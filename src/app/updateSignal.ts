/** Pont entre le service worker (mise à jour disponible) et l'interface. Aucune mise à jour automatique : l'utilisateur choisit le moment. */
type Listener = (ready: boolean) => void
let ready = false
let apply: (() => void) | null = null
const listeners = new Set<Listener>()
export const updateSignal = {
  /** Appelé par l'enregistrement du service worker quand une nouvelle version est installée et attend. */
  markReady(fn: () => void) { ready = true; apply = fn; listeners.forEach((l) => l(true)) },
  isReady: () => ready,
  /** Active la nouvelle version et recharge la page (les données IndexedDB ne sont pas touchées). */
  apply: () => { apply?.() },
  dismiss() { ready = false; listeners.forEach((l) => l(false)) },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } },
}
