import type { Exercise, MuscleGroup, PoseId } from '@/core/sport/types'

/**
 * Illustration schématique d'un exercice : deux positions (départ / fin) d'un personnage de profil, avec les segments
 * sollicités en or et le matériel esquissé. Générée localement en SVG (quelques octets, aucune image à télécharger
 * ni à compresser, fonctionne hors ligne). Schéma pédagogique, pas une photographie : la fiche détaille l'exécution.
 */
type P = [number, number]
interface Skel { head: P; shoulder: P; elbow: P; hand: P; hip: P; knee: P; foot: P }
interface Pose { a: Skel; b: Skel; prop?: 'bar' | 'bench' | 'hangbar' }

const S = (head: P, shoulder: P, elbow: P, hand: P, hip: P, knee: P, foot: P): Skel => ({ head, shoulder, elbow, hand, hip, knee, foot })
const STAND = S([50, 14], [50, 27], [50, 41], [50, 55], [50, 55], [50, 73], [52, 89])

const POSES: Record<PoseId, Pose> = {
  press_flat: { prop: 'bench', a: S([18, 60], [30, 60], [36, 48], [32, 40], [62, 60], [78, 48], [80, 62]), b: S([18, 60], [30, 60], [32, 38], [32, 22], [62, 60], [78, 48], [80, 62]) },
  pushup: { a: S([20, 36], [28, 42], [28, 58], [28, 72], [60, 54], [80, 62], [98, 70]), b: S([20, 48], [28, 54], [38, 62], [28, 72], [60, 60], [80, 66], [98, 72]) },
  press_overhead: { a: S([50, 14], [50, 27], [42, 38], [48, 24], [50, 55], [50, 73], [52, 89]), b: S([50, 16], [50, 29], [50, 14], [50, 0], [50, 56], [50, 74], [52, 89]) },
  raise_lateral: { a: STAND, b: S([50, 14], [50, 27], [62, 30], [76, 28], [50, 55], [50, 73], [52, 89]) },
  row_bent: { a: S([22, 34], [32, 40], [32, 56], [32, 70], [56, 56], [62, 72], [60, 89]), b: S([22, 34], [32, 40], [48, 50], [52, 56], [56, 56], [62, 72], [60, 89]) },
  pull_up: { prop: 'hangbar', a: S([50, 22], [50, 34], [50, 20], [50, 6], [50, 62], [50, 78], [52, 92]), b: S([50, 6], [50, 20], [42, 14], [50, 6], [50, 48], [50, 64], [52, 78]) },
  curl: { a: STAND, b: S([50, 14], [50, 27], [50, 41], [64, 30], [50, 55], [50, 73], [52, 89]) },
  triceps_ext: { a: S([50, 14], [50, 27], [52, 10], [44, 24], [50, 55], [50, 73], [52, 89]), b: S([50, 14], [50, 27], [52, 10], [52, -2], [50, 55], [50, 73], [52, 89]) },
  squat: { a: STAND, b: S([46, 26], [46, 38], [58, 40], [68, 38], [36, 62], [64, 64], [50, 89]) },
  lunge: { a: STAND, b: S([52, 14], [52, 27], [56, 41], [58, 55], [50, 58], [70, 70], [70, 89]) },
  hinge: { a: STAND, b: S([80, 34], [68, 38], [70, 52], [70, 64], [44, 54], [46, 72], [46, 89]) },
  bridge: { a: S([18, 70], [30, 70], [40, 70], [52, 70], [60, 70], [74, 54], [82, 70]), b: S([18, 70], [30, 70], [40, 70], [52, 70], [60, 52], [74, 50], [82, 70]) },
  calf: { a: STAND, b: S([50, 8], [50, 21], [50, 35], [50, 49], [50, 49], [50, 67], [52, 84]) },
  plank: { a: S([20, 40], [28, 46], [28, 62], [40, 64], [60, 52], [80, 58], [98, 64]), b: S([20, 40], [28, 46], [28, 62], [40, 64], [60, 54], [80, 59], [98, 64]) },
  crunch: { a: S([18, 70], [30, 70], [44, 66], [52, 60], [60, 70], [74, 52], [84, 70]), b: S([34, 54], [40, 58], [52, 56], [58, 52], [60, 70], [74, 52], [84, 70]) },
  carry: { a: STAND, b: S([52, 14], [52, 27], [52, 41], [54, 58], [52, 55], [58, 73], [64, 89]) },
  stretch: { a: S([50, 28], [50, 40], [58, 52], [64, 66], [50, 66], [72, 72], [74, 88]), b: S([54, 24], [54, 36], [62, 46], [70, 36], [50, 66], [72, 72], [74, 88]) },
  cardio: { a: STAND, b: S([50, 4], [50, 17], [62, 8], [70, -2], [50, 45], [60, 58], [52, 70]) },
  rotation: { a: S([50, 14], [50, 27], [58, 32], [70, 34], [50, 55], [50, 73], [52, 89]), b: S([50, 14], [50, 27], [42, 32], [30, 34], [50, 55], [50, 73], [52, 89]) },
  hang: { prop: 'hangbar', a: S([50, 22], [50, 34], [50, 20], [50, 6], [50, 62], [50, 78], [52, 92]), b: S([50, 22], [50, 34], [50, 20], [50, 6], [50, 62], [50, 78], [52, 92]) },
}

const ARM: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'avant_bras']
const TORSO: MuscleGroup[] = ['pectoraux', 'dos', 'abdominaux', 'epaules']
const LEG: MuscleGroup[] = ['quadriceps', 'ischios', 'fessiers', 'mollets']

function Frame({ k, ex, dx }: { k: Skel; ex: Exercise; dx: number }) {
  const g = ex.primary
  const arm = g.some((x) => ARM.includes(x)), torso = g.some((x) => TORSO.includes(x)), leg = g.some((x) => LEG.includes(x))
  const col = (on: boolean) => (on ? 'var(--c-sport)' : 'var(--c-text-faint)')
  const seg = (a: P, b: P, on: boolean, w = 5) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col(on)} strokeWidth={w} strokeLinecap="round" />
  const eq = ex.equipment
  return (
    <g transform={`translate(${dx},4)`}>
      {POSES[ex.pose].prop === 'bench' ? <rect x={14} y={66} width={62} height={5} rx={2} fill="var(--c-surface)" /> : null}
      {POSES[ex.pose].prop === 'hangbar' || eq.includes('pullup_bar') ? <line x1={30} y1={4} x2={72} y2={4} stroke="var(--c-text-dim)" strokeWidth={3} strokeLinecap="round" /> : null}
      {seg(k.shoulder, k.hip, torso, 6)}
      {seg(k.hip, k.knee, leg)}
      {seg(k.knee, k.foot, leg)}
      {seg(k.shoulder, k.elbow, arm)}
      {seg(k.elbow, k.hand, arm)}
      <circle cx={k.head[0]} cy={k.head[1]} r={7} fill="var(--c-card)" stroke={col(false)} strokeWidth={2.4} />
      {eq.includes('dumbbells') || eq.includes('kettlebell') ? <><circle cx={k.hand[0]} cy={k.hand[1]} r={4.5} fill="var(--c-text-dim)" /><circle cx={k.hand[0] + 7} cy={k.hand[1]} r={4.5} fill="var(--c-text-dim)" opacity={0.6} /></> : null}
      {eq.includes('barbell') ? <line x1={k.hand[0] - 14} y1={k.hand[1]} x2={k.hand[0] + 14} y2={k.hand[1]} stroke="var(--c-text-dim)" strokeWidth={3.5} strokeLinecap="round" /> : null}
      {eq.includes('bands') ? <path d={`M${k.hand[0]},${k.hand[1]} Q${k.hand[0] + 16},${(k.hand[1] + k.foot[1]) / 2} ${k.foot[0]},${k.foot[1]}`} fill="none" stroke="var(--c-info)" strokeWidth={2} strokeDasharray="3 3" /> : null}
      <line x1={0} y1={93} x2={100} y2={93} stroke="var(--c-line)" strokeWidth={1} />
    </g>
  )
}

export function ExerciseFigure({ exercise, size = 'md' }: { exercise: Exercise; size?: 'sm' | 'md' }) {
  const pose = POSES[exercise.pose]
  const h = size === 'sm' ? 70 : 110
  return (
    <svg viewBox="0 0 230 100" height={h} width="100%" role="img" preserveAspectRatio="xMidYMid meet"
      aria-label={`Illustration schématique de ${exercise.name} : position de départ puis position finale`}>
      <Frame k={pose.a} ex={exercise} dx={4} />
      <Frame k={pose.b} ex={exercise} dx={118} />
      <text x={54} y={99} fontSize={7} textAnchor="middle" fill="var(--c-text-faint)">Départ</text>
      <text x={168} y={99} fontSize={7} textAnchor="middle" fill="var(--c-text-faint)">Fin</text>
    </svg>
  )
}
