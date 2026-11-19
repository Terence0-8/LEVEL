import { useState } from 'react'
import { Badge, Card, ProgressBar } from '@/design/components'
import { ConfirmDialog } from '@/design/Sheet'
import { Icon } from '@/design/Icon'
import { questService } from '@/data/questService'
import { isRecurring } from '@/core/quest'
import { DIFFICULTY_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, formatDue } from './labels'
import type { QuestView } from './useQuestViews'
import s from './life.module.css'

type Pending = null | { kind: 'undo-quest' } | { kind: 'undo-step'; stepId: string; title: string } | { kind: 'delete' }

export function QuestCard({ view, onEdit }: { view: QuestView; onEdit: () => void }) {
  const { quest, category, cp, status } = view
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const stepped = quest.steps.length > 0
  const done = cp.completed
  const recurring = isRecurring(quest.type)

  const toggleMain = () => (done ? setPending({ kind: 'undo-quest' }) : void questService.completeQuest(quest.id))
  const toggleStep = (stepId: string, title: string) =>
    cp.stepDone[stepId] ? setPending({ kind: 'undo-step', stepId, title }) : void questService.completeStep(quest.id, stepId)

  const confirm = async () => {
    const p = pending
    setPending(null)
    if (!p) return
    if (p.kind === 'delete') await questService.deleteQuest(quest.id)
    else if (p.kind === 'undo-quest') await questService.undoQuestValidation(quest.id)
    else await questService.undoValidation(quest.id, p.stepId)
  }

  const bodyId = `qb-${quest.id}`
  return (
    <Card as="article" className={`${s.quest} ${done ? s.questDone : ''} ${status === 'archived' ? s.questArchived : ''}`}>
      <div className={s.qHead}>
        <button className={`${s.check} ${done ? s.checked : ''}`} onClick={toggleMain} aria-pressed={done}
          aria-label={done ? `Corriger la validation de ${quest.title}` : stepped ? `Valider toutes les étapes de ${quest.title}` : `Valider ${quest.title}`}>
          {done ? <Icon name="check" size={18} /> : null}
        </button>
        <button className={s.qTitleBtn} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={bodyId}>
          <span className={s.qTitle}>{quest.title}</span>
          <span className={s.qMeta}>
            <span>{category?.name ?? 'Sans catégorie'}</span>
            <span>{TYPE_LABEL[quest.type]}</span>
            {quest.dueDate ? <span className={status === 'overdue' ? s.late : ''}>Avant le {formatDue(quest.dueDate)}</span> : null}
          </span>
        </button>
        <Badge tone={done ? 'success' : 'gold'}>{done ? `+${cp.earnedXp}` : cp.earnedXp > 0 ? `${cp.earnedXp}/${quest.rewardXp}` : `+${quest.rewardXp}`} XP</Badge>
      </div>

      {stepped ? (
        <div className={s.qProgress}>
          <ProgressBar value={cp.progress} tone={done ? 'success' : 'gold'} thin label={`Étapes de ${quest.title}`} />
          <span className="num">{cp.doneSteps}/{cp.totalSteps}</span>
        </div>
      ) : null}

      {open ? (
        <div id={bodyId} className={s.qBody}>
          {quest.description ? <p className={s.desc}>{quest.description}</p> : null}
          {stepped ? (
            <ul className={s.steps}>
              {quest.steps.map((st) => (
                <li key={st.id}>
                  <button className={`${s.stepRow} ${cp.stepDone[st.id] ? s.stepDone : ''}`} aria-pressed={!!cp.stepDone[st.id]} onClick={() => toggleStep(st.id, st.title)}>
                    <span className={s.miniCheck}>{cp.stepDone[st.id] ? <Icon name="check" size={13} /> : null}</span>{st.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <dl className={s.facts}>
            <div><dt>Statut</dt><dd>{STATUS_LABEL[status]}</dd></div>
            <div><dt>Priorité</dt><dd>{PRIORITY_LABEL[quest.priority]}</dd></div>
            <div><dt>Difficulté</dt><dd>{DIFFICULTY_LABEL[quest.difficulty]}</dd></div>
            <div><dt>Effort</dt><dd>{quest.effortMinutes} min</dd></div>
            {recurring ? <div><dt>Série</dt><dd>{view.streak} {quest.type === 'daily' ? 'j' : 'sem.'}</dd></div> : null}
          </dl>
          {recurring && view.missed > 0 ? (
            <p className={s.note}>{view.missed} {quest.type === 'daily' ? 'jour(s)' : 'semaine(s)'} sans validation : la série repart, aucune XP n'est perdue.</p>
          ) : null}
          {status === 'overdue' ? <p className={s.note}>Échéance passée : vous pouvez toujours valider cette quête, sans pénalité.</p> : null}
          <div className={s.qActions}>
            <button className={s.act} onClick={onEdit}>Modifier</button>
            {cp.earnedXp > 0 ? <button className={s.act} onClick={() => setPending({ kind: 'undo-quest' })}>Corriger la validation</button> : null}
            <button className={s.act} onClick={() => void questService.setArchived(quest.id, !quest.archived)}>{quest.archived ? 'Désarchiver' : 'Archiver'}</button>
            <button className={`${s.act} ${s.actDanger}`} onClick={() => setPending({ kind: 'delete' })}>Supprimer</button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog open={pending?.kind === 'delete'} danger title="Supprimer la quête ?" confirmLabel="Supprimer" onConfirm={confirm} onCancel={() => setPending(null)}>
        <p><strong>« {quest.title} »</strong> sera supprimée définitivement.</p>
        <p>L'XP qu'elle a rapportée sera retirée ; l'historique conserve la trace de la correction.</p>
      </ConfirmDialog>
      <ConfirmDialog open={pending?.kind === 'undo-quest' || pending?.kind === 'undo-step'} title="Corriger la validation ?" confirmLabel="Corriger" onConfirm={confirm} onCancel={() => setPending(null)}>
        <p>{pending?.kind === 'undo-step' ? <>L'étape <strong>« {pending.title} »</strong> repassera à faire.</> : <>La quête <strong>« {quest.title} »</strong> repassera à faire.</>}</p>
        <p>L'XP correspondante est retirée, niveaux et attributs sont recalculés. Vous pourrez la valider à nouveau.</p>
      </ConfirmDialog>
    </Card>
  )
}
