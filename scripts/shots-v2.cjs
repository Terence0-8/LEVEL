/* Captures d'écran « avant/après » de la refonte V2 : écrans principaux, 4 largeurs, données vides puis données d'usage.
 * Usage : node scripts/shots-v2.cjs <dossier> [routes séparées par des virgules] — nécessite `vite preview --port 4173`. */
const { chromium } = require('playwright')
const fs = require('node:fs')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp/shots'
const ROUTES = (process.argv[3] || '/,/life,/sport,/rpg,/pilotage,/planning').split(',')
const WIDTHS = (process.env.WIDTHS || '320,390,768,1280').split(',').map(Number)
const THEME = process.env.THEME || ''
const slug = (r) => (r === '/' ? 'accueil' : r.replace(/^\//, '').replace(/\//g, '-'))
const stamp = (daysAgo, h = 10) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString() }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const dataset of ['vide', 'usage']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    if (THEME) await page.addInitScript((t) => { try { localStorage.setItem('level-theme', t) } catch { /* ignore */ } }, THEME)
    await page.goto(BASE + '#/'); await page.waitForSelector('h1, h2'); await page.waitForTimeout(1200)
    if (dataset === 'usage') {
      const put = (store, rows) => page.evaluate(async ({ store, rows }) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); rows.forEach((r) => tx.objectStore(store).put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close()
      }, { store, rows })
      const q = (id, title, cat, type, o = {}) => ({ id, type, title, description: '', categoryId: cat, priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], archived: false, createdAt: Date.now() - 20 * 86400000, updatedAt: Date.now(), ...o })
      await put('quests', [q('s1', 'Lire 20 minutes', 'cat-culture', 'daily'), q('s2', 'Marcher 20 minutes', 'cat-hygiene', 'daily', { effortMinutes: 20 }), q('s3', 'Faire le point sur le budget', 'cat-finances', 'weekly', { effortMinutes: 40 }), q('s4', 'Avancer sur le dossier client', 'cat-pro', 'personal', { priority: 'high', effortMinutes: 90 }), q('s5', 'Appeler un proche', 'cat-social', 'personal', { effortMinutes: 15 })])
      const ev = []
      for (let d = 1; d < 40; d++) for (const k of [0, 1]) ev.push({ id: `sx${d}-${k}`, kind: 'award', source: 'quest', sourceId: `s${k + 1}`, questId: `s${k + 1}`, stepId: null, awardKey: `quest:s${k + 1}:d${d}`, cycleKey: `d${d}`, domain: 'LIFE', categoryId: k ? 'cat-hygiene' : 'cat-culture', attribute: 'discipline', amount: 20, baseAmount: 20, micro: false, at: stamp(d, 9 + k), recordedAt: stamp(d, 9 + k), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: 'Quête', status: 'valid', correctsEventId: null, reversedByEventId: null })
      await put('xpEvents', ev)
      await put('goals', [{ id: 'g1', title: 'Lancer la bêta', description: '', categoryId: 'cat-pro', createdAt: stamp(60), dueDate: null, priority: 'normal', importance: 3, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: stamp(60), updatedAt: stamp(60) }])
      await page.reload(); await page.waitForSelector('h1, h2'); await page.waitForTimeout(1800)
    }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w >= 768 ? 900 : 844 })
      for (const r of ROUTES) {
        await page.evaluate((h) => { location.hash = h }, r); await page.waitForTimeout(900)
        await page.screenshot({ path: `${OUT}/${dataset}-${slug(r)}-${w}.png`, fullPage: w < 768 })
      }
    }
    await ctx.close()
  }
  await browser.close()
  console.log('captures dans', OUT)
})()
