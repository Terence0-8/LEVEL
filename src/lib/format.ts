const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formatNumber = (n: number) => new Intl.NumberFormat('fr-FR').format(n)
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Aujourd'hui", "Hier" ou "mardi 4 novembre". */
export function formatDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const diff = Math.round((new Date(dayKey(now)).getTime() - new Date(dayKey(d)).getTime()) / 86_400_000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  const s = dayFmt.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
