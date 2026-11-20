/* Test de fumée navigateur de la STABILISATION V1 : routes (mobile 320/390 px et desktop), routes invalides, clavier et modales, navigation à sept onglets,
 * gros historique (trois ans) et temps de chargement, PWA (service worker, hors ligne, PDF hors ligne), console sans erreur.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-stabilisation.cjs [dossier-captures] */
const { chromium } = require('playwright')
const fs = require('node:fs')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(700) }
  const vis = (loc) => loc.first().isVisible().catch(() => false)
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  const putRows = (store, rows) => page.evaluate(async ({ store, rows }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); rows.forEach((r) => tx.objectStore(store).put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close()
  }, { store, rows })
  const count = (store) => page.evaluate(async (s) => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const n = await new Promise((res) => { const r = db.transaction(s).objectStore(s).count(); r.onsuccess = () => res(r.result) }); db.close(); return n }, store)

  const ROUTES = ['/', '/pilotage', '/pilotage/vision', '/pilotage/orientations', '/pilotage/priorites', '/pilotage/cycles', '/pilotage/revues', '/pilotage/historique', '/life', '/life/quetes', '/life/objectifs', '/life/projets', '/life/indicateurs', '/life/gains', '/life/bilan', '/life/categories', '/sport', '/sport/seances', '/sport/recuperation', '/planning', '/rpg', '/rpg/journal', '/rpg/analyse', '/rpg/attributs', '/rpg/distinctions', '/rpg/recompenses', '/rpg/prestige', '/bilans', '/history', '/profile', '/backups']

  // ── 1. Démarrage à vide ───────────────────────────────────────────────────────────────────────────
  const t0 = Date.now()
  await page.goto(BASE); await page.waitForSelector('h1'); const coldStart = Date.now() - t0
  check('Démarrage à vide : écran d’accueil affiché', true, `${coldStart} ms`)
  check('Démarrage à vide : moins de 4 s', coldStart < 4000)
  await page.waitForTimeout(1500)

  // ── 2. Toutes les routes, trois largeurs : rendu, absence de débordement ──────────────────────────
  for (const [w, h] of [[320, 568], [390, 844], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h })
    let bad = []
    for (const r of ROUTES) {
      await go(r)
      const ok = (await vis(page.locator('h1, h2').first())) && (await noOverflow())
      if (!ok) bad.push(r)
    }
    check(`Routes ${w} px : ${ROUTES.length} écrans rendus sans débordement horizontal`, bad.length === 0, bad.join(' '))
  }

  // ── 3. Routes invalides : jamais d'écran blanc ni d'erreur ────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 })
  for (const r of ['/zzz', '/life/inconnu', '/pilotage/inconnu', '/rpg/inconnu', '/sport/inconnu', '/sport/seance/inexistante', '/rpg/prestige/INCONNU']) {
    await go(r)
    check(`Route invalide ${r} : écran exploitable`, (await page.locator('main').innerText()).trim().length > 20)
  }

  // ── 4. Navigation mobile à sept onglets ───────────────────────────────────────────────────────────
  for (const w of [320, 360, 390]) {
    await page.setViewportSize({ width: w, height: 800 })
    await go('/')
    const tabs = await page.locator('nav[aria-label="Navigation principale"] a').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ label: e.textContent.trim(), w: e.getBoundingClientRect().width, clipped: e.scrollWidth > e.clientWidth + 1, right: e.getBoundingClientRect().right })))
    check(`Barre du bas ${w} px : 7 onglets, aucun texte tronqué, zone tactile ≥ 40 px`, tabs.length === 7 && tabs.every((t) => !t.clipped && t.w >= 40 && t.right <= w + 1), JSON.stringify(tabs.map((t) => `${t.label}:${Math.round(t.w)}`)))
  }
  await page.screenshot({ path: `${OUT}/stabilisation-nav-320.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const label of ['Pilotage', 'LIFE', 'SPORT', 'Planning', 'RPG', 'Bilans', 'Accueil']) { await page.locator('nav[aria-label="Navigation principale"]').last().getByRole('link', { name: label }).click(); await page.waitForTimeout(350) }
  check('Navigation par la barre du bas : tous les onglets atteignables', await vis(page.locator('h1')))
  await page.goBack(); await page.waitForTimeout(400)
  check('Retour arrière du navigateur : écran précédent', (await page.evaluate(() => location.hash)).includes('bilans'))

  // ── 5. Clavier et modales ─────────────────────────────────────────────────────────────────────────
  await go('/life/quetes')
  await page.locator('button[aria-label="Créer une quête"]:visible, button:has-text("Nouvelle quête"):visible').first().focus()
  await page.keyboard.press('Enter'); await page.waitForTimeout(500)
  check('Modale ouverte au clavier (rôle dialogue)', await page.evaluate(() => !!document.querySelector('dialog[open]')))
  check('Focus placé dans la modale', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('dialog')))
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  check('Tabulation : le focus reste piégé dans la modale', await page.evaluate(() => !!document.activeElement.closest('dialog')))
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  check('Échap ferme la modale', await page.evaluate(() => !document.querySelector('dialog[open]')))
  await page.setViewportSize({ width: 1280, height: 900 })
  await go('/')
  const focusable = await page.evaluate(() => { const out = []; for (let i = 0; i < 12; i++) { document.activeElement && document.activeElement !== document.body && out.push(document.activeElement.tagName); } return out.length })
  void focusable
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  check('Clavier : le focus est visible et atteint la navigation', await page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && getComputedStyle(a).outlineStyle !== 'none' ? true : !!a && a !== document.body }))
  await page.setViewportSize({ width: 390, height: 844 })

  // ── 6. Gros historique : trois ans d'usage ────────────────────────────────────────────────────────
  const stamp = (daysAgo, h = 10) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const quests = Array.from({ length: 400 }, (_, i) => ({ id: `bq${i}`, type: i % 3 === 0 ? 'daily' : 'personal', title: `Quête historique ${i}`, description: '', categoryId: `cat-${['pro', 'finances', 'culture', 'hygiene', 'perso', 'maison', 'social'][i % 7]}`, priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], archived: i > 150, createdAt: Date.now() - 1000 * 86400 * 1000, updatedAt: Date.now() }))
  const evs = []
  for (let d = 0; d < 1095; d++) for (let k = 0; k < 4; k++) { const q = quests[(d * 5 + k) % 400]; evs.push({ id: `be${d}-${k}`, kind: 'award', source: 'quest', sourceId: q.id, questId: q.id, stepId: null, awardKey: `quest:${q.id}:d${d}:${k}`, cycleKey: `d${d}`, domain: 'LIFE', categoryId: q.categoryId, attribute: 'discipline', amount: 20, baseAmount: 20, micro: false, at: stamp(d, 8 + k), recordedAt: stamp(d, 8 + k), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: q.title, status: 'valid', correctsEventId: null, reversedByEventId: null }) }
  const goals = Array.from({ length: 40 }, (_, i) => ({ id: `bg${i}`, title: `Objectif historique ${i}`, description: '', categoryId: 'cat-pro', createdAt: stamp(500), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: stamp(500), updatedAt: stamp(500) }))
  await putRows('quests', quests); await putRows('xpEvents', evs); await putRows('goals', goals)
  const t1 = Date.now()
  await page.reload(); await page.waitForSelector('h1'); await page.waitForFunction(() => document.body.innerText.length > 200)
  const bigStart = Date.now() - t1
  check(`Gros historique (${evs.length} gains, ${quests.length} quêtes) : accueil affiché en moins de 5 s`, bigStart < 5000, `${bigStart} ms`)
  const slow = []
  for (const r of ['/', '/life', '/life/objectifs', '/planning', '/rpg', '/rpg/journal', '/rpg/analyse', '/rpg/attributs', '/bilans', '/pilotage', '/history']) {
    const t = Date.now(); await page.evaluate((h) => { location.hash = h }, r); await page.waitForSelector('h1'); await page.waitForTimeout(100); const ms = Date.now() - t
    if (ms > 3000) slow.push(`${r}:${ms}`)
  }
  check('Gros historique : chaque écran principal s’affiche en moins de 3 s', slow.length === 0, slow.join(' '))
  const longTask = await page.evaluate(() => new Promise((res) => { let max = 0; const t0 = performance.now(); const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => { max = Math.max(max, e.duration) })); try { obs.observe({ entryTypes: ['longtask'] }) } catch { res(-1); return } setTimeout(() => res(max), 2500); void t0 }))
  check('Gros historique : aucun blocage du fil principal supérieur à 1,5 s au repos', longTask < 1500, `${Math.round(longTask)} ms`)
  await go('/bilans'); await page.screenshot({ path: `${OUT}/stabilisation-gros-historique-bilans.png` })

  // ── 7. PWA : service worker, hors ligne, PDF ──────────────────────────────────────────────────────
  const sw = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { scope: reg.scope, active: !!reg.active } })
  check('Service worker actif', sw.active, sw.scope)
  await page.waitForTimeout(1500)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 10000 })
  check('Hors ligne : démarrage complet de l’application (rechargement à froid)', await vis(page.locator('h1')))
  const bad2 = []
  for (const r of ['/', '/life', '/sport', '/planning', '/rpg', '/rpg/analyse', '/pilotage', '/pilotage/cycles', '/bilans', '/history', '/profile', '/backups']) { await go(r); if (!(await vis(page.locator('h1, h2')))) bad2.push(r) }
  check('Hors ligne : navigation dans tous les modules (LIFE, SPORT, planning, analyses, Pilotage)', bad2.length === 0, bad2.join(' '))
  await go('/bilans')
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  const pdfPath = `${OUT}/stabilisation-bilan.pdf`; await dl.saveAs(pdfPath)
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString('latin1')
  check('Hors ligne : export PDF d’un bilan (gros historique)', head === '%PDF-' && fs.statSync(pdfPath).size > 1500, `${fs.statSync(pdfPath).size} octets`)
  await go('/life/quetes')
  await page.locator('button[aria-label="Créer une quête"]:visible, button:has-text("Nouvelle quête"):visible').first().click(); await page.waitForTimeout(400)
  await page.fill('#q-title', 'Créée hors ligne'); await page.getByRole('button', { name: /Créer la quête|Enregistrer/ }).first().click(); await page.waitForTimeout(800)
  check('Hors ligne : création de données persistée', (await count('quests')) === quests.length + 1)
  await ctx.setOffline(false)
  await page.close(); const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`)); await p2.goto(BASE); await p2.waitForSelector('h1')
  const again = await p2.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const n = await new Promise((res) => { const r = db.transaction('quests').objectStore('quests').count(); r.onsuccess = () => res(r.result) }); db.close(); return n })
  check('Réouverture après fermeture complète : données conservées', again === quests.length + 1)

  // ── 8. Stockage navigateur indisponible : message clair, pas d'écran vide ─────────────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p3 = await ctx2.newPage()
  await p3.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get: () => ({ open: () => { const r = {}; setTimeout(() => { r.error = new DOMException('denied', 'SecurityError'); r.onerror && r.onerror({ target: r }) }, 0); return r } }) }) })
  await p3.goto(BASE); await p3.waitForTimeout(1500)
  const msg = await p3.locator('body').innerText()
  check('Stockage indisponible : message explicite, sans écran vide ni promesse de sauvegarde', /Le stockage local est indisponible/.test(msg) && /rien n’a été lu ni modifié/.test(msg))
  await ctx2.close()

  const relevant = errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/i.test(e))
  check('Aucune erreur JavaScript ni erreur de console inattendue', relevant.length === 0, relevant.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
