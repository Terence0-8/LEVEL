/** Utilitaires de dates (heure locale). Pures, sans dépendance. */

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Semaine ISO 8601, ex. « 2026-W47 ». */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Nombre de jours entiers entre deux clés « YYYY-MM-DD » (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}

/** Date locale à midi pour une clé « YYYY-MM-DD » (heure neutre pour une date déclarée). */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromDayKey(s).getTime())

/** Lundi (midi, local) de la semaine ISO « YYYY-Www ». */
export function dateOfWeekKey(key: string): Date {
  const [y, w] = key.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4, 12)
  const mondayW1 = addDays(jan4, -((jan4.getDay() || 7) - 1))
  return addDays(mondayW1, (w - 1) * 7)
}
