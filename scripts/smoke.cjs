/* Test de fumée navigateur (Playwright requis, installé globalement dans l'environnement Claude Code).
 * Usage : npm run build && npx vite preview --port 4173 & node scripts/smoke.cjs [dossier-captures] */
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(BASE); await page.waitForSelector('h1')
  check('Accueil chargé (mobile)', (await page.textContent('h1')).length > 0)
  check('Barre inférieure visible', await page.locator('nav[aria-label="Navigation principale"]').last().isVisible())
  await page.waitForTimeout(600)
  check('Pas de débordement horizontal (mobile)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.screenshot({ path: `${OUT}/home-mobile.png`, fullPage: true })

  for (const [label, title] of [['LIFE', 'LIFE'], ['SPORT', 'SPORT'], ['RPG', 'RPG'], ['Historique', 'Historique'], ['Accueil', null]]) {
    await page.locator('nav >> a', { hasText: label }).last().click()
    await page.waitForTimeout(700)
    if (title) check(`Navigation → ${label}`, (await page.locator('h1').first().textContent()).trim() === title)
    if (title) await page.screenshot({ path: `${OUT}/${label.toLowerCase()}-mobile.png`, fullPage: true })
  }

  // Quêtes : cocher, vérifier la persistance après rechargement
  const quest = page.getByRole('button', { name: /Planifier la semaine/ })
  await quest.click(); await page.waitForTimeout(300)
  check('Quête cochée', (await quest.getAttribute('aria-pressed')) === 'true')
  await page.reload(); await page.waitForSelector('h1')
  check('Quête toujours cochée après rechargement', (await page.getByRole('button', { name: /Planifier la semaine/ }).getAttribute('aria-pressed')) === 'true')

  // Profil
  await page.getByRole('link', { name: 'Profil et réglages' }).click()
  await page.fill('#name', 'Aria'); await page.getByRole('button', { name: /Enregistrer/ }).click(); await page.waitForTimeout(300)
  await page.reload(); await page.waitForSelector('h1')
  check('Nom persisté après rechargement', (await page.inputValue('#name')) === 'Aria')
  await page.screenshot({ path: `${OUT}/profile-mobile.png`, fullPage: true })

  // Masquer la démo
  await page.getByRole('switch', { name: 'Données de démonstration' }).click(); await page.waitForTimeout(300)
  await page.locator('nav >> a', { hasText: 'Accueil' }).last().click(); await page.waitForTimeout(300)
  check('Démo masquée → état vide', await page.getByText("Aucune donnée pour l'instant").isVisible())
  await page.screenshot({ path: `${OUT}/empty-mobile.png` })
  await page.getByRole('link', { name: 'Réafficher la démo' }).click()
  await page.getByRole('switch', { name: 'Données de démonstration' }).click(); await page.waitForTimeout(300)

  // Hors ligne
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1000)
  await page.reload(); await page.waitForTimeout(800)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 })
  check('Rechargement hors ligne fonctionnel', (await page.locator('h1').count()) > 0)
  await ctx.setOffline(false)

  // Desktop
  const d = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await d.goto(BASE); await d.waitForSelector('h1')
  check('Menu latéral visible (desktop)', await d.locator('aside').isVisible())
  check('Barre inférieure masquée (desktop)', !(await d.locator('nav[aria-label="Navigation principale"]').last().isVisible()))
  await d.waitForTimeout(600)
  await d.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true })
  for (const p of ['#/rpg', '#/sport', '#/history', '#/life']) { await d.goto(BASE + p); await d.waitForTimeout(700); await d.screenshot({ path: `${OUT}/${p.slice(2)}-desktop.png`, fullPage: true }) }

  check('Aucune erreur console / page', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(`\n${results.filter(Boolean).length}/${results.length} contrôles réussis`)
  process.exit(results.every(Boolean) ? 0 : 1)
})()
