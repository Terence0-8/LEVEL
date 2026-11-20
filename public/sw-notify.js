/* Ouvre l'écran concerné quand l'utilisateur touche une notification de Level. Aucun réseau. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = (event.notification.data && event.notification.data.route) || '/'
  const url = self.registration.scope + '#' + route
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list[0]
      if (c) {
        c.focus()
        if ('navigate' in c) return c.navigate(url).catch(() => undefined)
        return undefined
      }
      return self.clients.openWindow(url)
    }),
  )
})
