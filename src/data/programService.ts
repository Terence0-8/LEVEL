import { dayKey } from '@/core/dates'
import {
  instanceFrom, nextProgramSession, profilePatchFor, programById, programSessions, runInstruction, sanitizeProgramState, type NextProgramSession, type ProgramAnswers, type ProgramInstance, type ProgramState,
} from '@/core/sport/programs'
import { defaultProfile } from '@/core/sport/profile'
import { evaluateRecovery } from '@/core/sport/recovery'
import type { RunSuggestion } from '@/core/sport/running'
import type { SportSession } from '@/core/sport/session'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'
import { createSportService } from './sportService'

export const PROGRAM_KEY = 'sportProgram'
export class ProgramError extends Error {
  constructor(public code: 'not_found' | 'no_program' | 'not_available' | 'invalid', message: string) { super(message) }
}
export async function readProgramState(database: LevelDB = db): Promise<ProgramState> {
  return sanitizeProgramState((await database.settings.get(PROGRAM_KEY))?.value)
}

/**
 * Programmes SPORT : le catalogue (modèles) reste intact ; l'activation crée une INSTANCE personnalisée stockée dans `settings` (sauvegardée avec le reste, sans
 * nouvelle table). Aucun moteur de progression n'est ajouté : les séances sont composées par `sportService` (bibliothèque, contraintes, récupération), l'XP vient
 * de `sportService.syncXp`. Changer de programme archive l'instance dans l'historique du programme ; séances, performances et records ne sont jamais touchés.
 */
export function createProgramService(database: LevelDB = db, deps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }) {
  const sport = createSportService(database, deps)
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', database.tables, fn)
  const write = (s: ProgramState) => database.settings.put({ key: PROGRAM_KEY, value: s })

  async function archive(state: ProgramState): Promise<ProgramState> {
    if (!state.active) return state
    const sessions = await database.sportSessions.toArray()
    return { ...state, active: null, history: [...state.history, { templateId: state.active.templateId, name: state.active.name, startedAt: state.active.startedAt, endedAt: deps.now().toISOString(), sessionsDone: programSessions(state.active, sessions).length }] }
  }

  return {
    /** Active un programme (le précédent est archivé). Adapte niveau, matériel et disponibilités du profil SPORT, jamais ses contraintes physiques. */
    activate: (templateId: string, a: Pick<ProgramAnswers, 'level' | 'perWeek' | 'days' | 'minutes' | 'equipment'>) => tx(async () => {
      const t = programById(templateId)
      if (!t) throw new ProgramError('not_found', 'Programme introuvable.')
      if (!t.equipment.includes(a.equipment)) throw new ProgramError('invalid', 'Ce programme ne correspond pas à votre matériel.')
      const state = await archive(await readProgramState(database))
      const inst = instanceFrom(t, a, deps.now())
      const profile = (await database.sportProfile.get('me')) ?? defaultProfile(deps.now().toISOString())
      await database.sportProfile.put({ ...profile, ...profilePatchFor(inst, profile), updatedAt: deps.now().toISOString() })
      await write({ ...state, active: inst })
      return inst
    }),

    /** Personnalisation de l'instance (fréquence, jours, durée) ; le modèle du catalogue n'est jamais modifié. */
    customize: (patch: { perWeek?: number; days?: number[]; minutes?: number | null }) => tx(async () => {
      const state = await readProgramState(database)
      if (!state.active) throw new ProgramError('no_program', 'Aucun programme actif.')
      const a: ProgramInstance = { ...state.active, ...(patch.perWeek ? { perWeek: Math.max(1, Math.min(7, Math.round(patch.perWeek))) } : {}), ...(patch.days ? { days: [...new Set(patch.days)].sort() } : {}), ...(patch.minutes !== undefined ? { minutes: patch.minutes } : {}) }
      const profile = (await database.sportProfile.get('me')) ?? defaultProfile(deps.now().toISOString())
      await database.sportProfile.put({ ...profile, ...profilePatchFor(a, profile), updatedAt: deps.now().toISOString() })
      await write({ ...state, active: a })
      return a
    }),

    /** Arrête le programme : l'instance rejoint l'historique ; aucune séance n'est modifiée. */
    stop: () => tx(async () => {
      const state = await readProgramState(database)
      if (!state.active) throw new ProgramError('no_program', 'Aucun programme actif.')
      await write(await archive(state))
    }),

    /** Prochaine séance, calculée sur les données à jour (récupération comprise). */
    next: async (): Promise<NextProgramSession | null> => {
      const state = await readProgramState(database)
      if (!state.active) return null
      const now = deps.now()
      const [sessions, checks, custom] = await Promise.all([database.sportSessions.toArray(), database.recoveryChecks.toArray(), database.customExercises.toArray()])
      return nextProgramSession(state.active, sessions, evaluateRecovery({ checks, sessions, now, today: dayKey(now), custom }), now)
    },

    /**
     * Démarre la prochaine séance du programme. Musculation et circuit : une séance est composée par le moteur SPORT (refus en alerte, allègement en vigilance).
     * Course : renvoie la consigne pour l'enregistrement de la sortie.
     */
    startNext: () => tx(async () => {
      const state = await readProgramState(database)
      if (!state.active) throw new ProgramError('no_program', 'Aucun programme actif.')
      const inst = state.active
      const now = deps.now()
      const [sessions, checks, custom] = await Promise.all([database.sportSessions.toArray(), database.recoveryChecks.toArray(), database.customExercises.toArray()])
      const next = nextProgramSession(inst, sessions, evaluateRecovery({ checks, sessions, now, today: dayKey(now), custom }), now)
      if (next.state === 'blocked' || next.state === 'done-today' || next.state === 'finished') throw new ProgramError('not_available', next.message)
      const tag: SportSession['programTag'] = { templateId: inst.templateId, startedAt: inst.startedAt, index: next.index }
      const def = next.session
      if (def.kind === 'run') {
        const t = programById(inst.templateId)
        const suggestion: RunSuggestion = { family: def.runFamily!, minutes: next.minutes, distanceKm: null, paceRange: null, effort: t ? runInstruction(t, def, next.week) : 'Allure facile', notes: def.cues }
        return { kind: 'run' as const, next, tag, suggestion }
      }
      if (def.kind === 'hiit') {
        const r = await sport.generateHiit(Math.min(next.minutes, 30), tag)
        return { kind: 'session' as const, next, tag, session: r.session }
      }
      const r = await sport.generateStrength({ minutes: next.minutes, focus: def.focus, programTag: tag, title: `${inst.name} · ${def.label}` })
      return { kind: 'session' as const, next, tag, session: r.session }
    }),
  }
}
export const programService = createProgramService()
