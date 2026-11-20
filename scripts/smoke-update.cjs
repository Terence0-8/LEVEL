/* Test de fumée : mise à jour de l'application (service worker) avec des données locales et une saisie non enregistrée.
 * Reconstruit l'application avec une version B modifiée (marqueur dans main.tsx, restauré ensuite), puis vérifie :
 * la mise à jour est PROPOSÉE (jamais imposée), la saisie en cours et les données survivent, et après validation l'application redémarre avec les données.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-update.cjs [dossier-captures] */
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }
const MAIN = 'src/main.tsx'

;(async () => {
  const original = fs.readFileSync(MAIN, 'utf8')
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  let page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const count = (store) => page.evaluate(async (s) => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const n = await new Promise((res) => { const r = db.transaction(s).objectStore(s).count(); r.onsuccess = () => res(r.result) }); db.close(); return n }, store)
  try {
    await page.goto(BASE + '#/life/quetes'); await page.waitForSelector('h1')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.waitForTimeout(1500)
    // Comme un utilisateur qui rouvre l'application installée : la page est alors contrôlée par le service worker
    await page.reload(); await page.waitForSelector('h1'); await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    // Données de la version A
    await page.locator('button[aria-label="Créer une quête"]:visible').first().click(); await page.waitForTimeout(400)
    await page.fill('#q-title', 'Quête créée en version A'); await page.getByRole('button', { name: /Créer la quête|Enregistrer/ }).first().click(); await page.waitForTimeout(800)
    const before = await count('quests')
    check('Version A : donnée créée', before === 1)
    // Saisie non enregistrée en cours
    await page.locator('button[aria-label="Créer une quête"]:visible').first().click(); await page.waitForTimeout(400)
    await page.fill('#q-title', 'Saisie non enregistrée')
    await page.evaluate(() => { window.__marker = 'avant-mise-a-jour' })
    check('Aucune bannière avant mise à jour', !(await page.getByText('Une nouvelle version de Level est prête').first().isVisible().catch(() => false)))

    // Version B
    fs.writeFileSync(MAIN, original + "\nconsole.debug('level-build-b-marker')\n")
    execSync('npx vite build', { stdio: 'ignore' })
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update() })
    await page.waitForFunction(() => !!document.body.innerText.match(/nouvelle version de Level est prête/i), null, { timeout: 20000 }).catch(() => undefined)
    // La bannière est dans la zone principale ; une modale ouverte la masque visuellement : on la lit dans le DOM
    const bannerInDom = await page.evaluate(() => /nouvelle version de Level est prête/i.test(document.body.innerText))
    check('Mise à jour détectée : une bannière la PROPOSE', bannerInDom)
    const state0 = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return { waiting: !!reg.waiting, installing: !!reg.installing, active: !!reg.active } })
    check('La nouvelle version est installée et EN ATTENTE (non activée d’office)', state0.waiting && state0.active, JSON.stringify(state0))
    check('Aucun rechargement automatique : la page et la saisie en cours sont intactes', (await page.evaluate(() => window.__marker)) === 'avant-mise-a-jour' && (await page.inputValue('#q-title')) === 'Saisie non enregistrée')
    check('Données locales intactes pendant l’attente', (await count('quests')) === before)
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/stabilisation-mise-a-jour.png` })
    await page.getByRole('button', { name: 'Plus tard' }).click(); await page.waitForTimeout(300)
    check('« Plus tard » masque la bannière sans recharger', !(await page.getByText('Une nouvelle version de Level est prête').first().isVisible().catch(() => false)) && (await page.evaluate(() => window.__marker)) === 'avant-mise-a-jour')

    // Réouverture de l'application (nouvel onglet) : la version en attente est proposée à nouveau ; l'utilisateur valide
    const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errors.push(e.message))
    await p2.goto(BASE + '#/'); await p2.waitForSelector('h1')
    await p2.waitForFunction(() => /nouvelle version de Level est prête/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => undefined)
    check('Réouverture : la mise à jour en attente est reproposée', await p2.getByRole('button', { name: 'Mettre à jour' }).first().isVisible().catch(() => false))
    await Promise.all([p2.waitForEvent('load', { timeout: 20000 }).catch(() => undefined), p2.getByRole('button', { name: 'Mettre à jour' }).first().click()])
    await p2.waitForSelector('h1'); await p2.waitForTimeout(1500)
    await page.close()
    check('Après « Mettre à jour » : l’application redémarre et les données sont conservées', (await p2.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const n = await new Promise((res) => { const r = db.transaction('quests').objectStore('quests').count(); r.onsuccess = () => res(r.result) }); db.close(); return n })) === before && (await p2.locator('h1').first().isVisible()))
    page = p2
    const fresh = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return { active: !!reg.active, waiting: !!reg.waiting } })
    check('Un seul service worker actif, aucun en attente', fresh.active && !fresh.waiting)
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('h1', { timeout: 10000 })
    check('Après mise à jour : démarrage hors ligne possible', await page.locator('h1').first().isVisible())
    await ctx.setOffline(false)
    check('Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 2).join(' | '))
  } finally {
    fs.writeFileSync(MAIN, original)
    execSync('npx vite build', { stdio: 'ignore' })
    await browser.close()
  }
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
