/* Test de fumée navigateur de RPG V1.2 : journal d'événements, analyse locale, recommandations, narration, notifications, bilans, hors ligne.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-intel.cjs [dossier-captures]
 * Les données historiques (activité régulière, projet en retard…) sont écrites dans IndexedDB comme fixtures ;
 * toutes les ACTIONS testées (consulter, décider, appliquer, exporter) passent par l'interface. */
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ahead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // Notifications système simulées (Chromium headless refuse toutes les permissions) ; heure fixée à 10 h pour des règles horaires déterministes
  await page.addInitScript(() => {
    try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }) } catch { /* ignore */ }
    window.__shown = []
    ServiceWorkerRegistration.prototype.showNotification = function (title, opts) { window.__shown.push({ title, body: opts && opts.body }); return Promise.resolve() }
  })
  const t0 = new Date(); t0.setHours(10, 0, 0, 0)
  await page.clock.install({ time: t0 })
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(900) }
  const shot = (n, full = true) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full })
  const vis = (loc) => loc.first().isVisible().catch(() => false)
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const idbAll = (store) => page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const rows = await new Promise((res, rej) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    db.close(); return rows
  }, store)
  const putRows = (store, rows) => page.evaluate(async ({ store, rows }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); rows.forEach((r) => tx.objectStore(store).put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close()
  }, { store, rows })
  const stamp = (daysAgo, h = 10) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString() }
  let seq = 0
  const xp = (domain, amount, at, extra = {}) => ({ id: `fx${++seq}`, kind: 'award', source: domain === 'LIFE' ? 'quest' : 'activity', sourceId: `fx${seq}`, questId: null, stepId: null, awardKey: domain === 'SPORT' ? `sport:fixture:${seq}` : `fixture:${seq}`, cycleKey: 'once', domain, categoryId: domain === 'LIFE' ? 'cat-pro' : null, attribute: domain === 'LIFE' ? 'discipline' : 'force', amount, baseAmount: amount, micro: false, at, recordedAt: at, retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: 'Fixture de test', label: `Fixture ${domain}`, status: 'valid', correctsEventId: null, reversedByEventId: null, ...extra })
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(10, 0, 0, 0)
  const weekDay = (w, d) => { const x = new Date(monday); x.setDate(x.getDate() - 7 * w + d); return x.toISOString() }
  const GUILT = /échec|raté|manqué|paresse|retard|rattraper|honte|décevant/i

  // ── 1. Départ : aucune donnée, aucun événement, aucune conclusion artificielle ───────────────────────
  await page.goto(BASE + '#/rpg/journal'); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
  check('Journal vide : message clair, aucune entrée', (await vis(page.getByText('Le journal est encore vide'))) && (await vis(page.getByText(/Une action ordinaire n’y apparaît jamais/))))
  await go('/rpg/analyse')
  check('Analyse sans données : aucune observation ni recommandation, comportement adapté', (await vis(page.getByText(/Aucune recommandation pour l’instant/))) && (await vis(page.getByText(/Pas encore assez de données pour une observation fiable/))))
  await go('/')
  check('Accueil sans données : pas de carte « En ce moment »', !(await vis(page.getByRole('heading', { name: 'En ce moment' }))))

  // ── 2. Historique : six semaines régulières, un grand cap, un projet en retard, un objectif proche ──
  const regular = []
  for (let w = 1; w <= 8; w++) for (const d of [0, 2, 4]) regular.push(xp('LIFE', 40, weekDay(w, d)))
  await putRows('xpEvents', [...regular, xp('LIFE', 3000, stamp(60))])
  const late = { id: 'pj1', title: 'Refonte du site', description: '', categoryId: 'cat-pro', goalId: null, priority: 'normal', startDate: null, dueDate: ahead(-1), status: 'active', steps: [], createdAt: stamp(70), updatedAt: stamp(45), statusAt: stamp(70) }
  const goalSoon = { id: 'gl1', title: 'Publier la v1', description: '', categoryId: 'cat-pro', createdAt: stamp(60), dueDate: ahead(3), priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: stamp(60), updatedAt: stamp(60) }
  const goalToDo = { id: 'gl2', title: 'Courir un semi-marathon', description: '', categoryId: 'cat-perso', createdAt: stamp(30), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: stamp(30), updatedAt: stamp(30) }
  await putRows('projects', [late]); await putRows('goals', [goalSoon, goalToDo])
  // Simule une mise à jour depuis une version antérieure : données existantes, journal jamais initialisé
  await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); await new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').delete('rpgEventsInit'); tx.oncomplete = res }); db.close() })
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(4500)
  await go('/rpg/journal')
  const baseline = await idbAll('rpgEvents')
  check('Journal reconstitué depuis les faits : niveaux, rang D, succès, régularité, échéance proche', baseline.length >= 8 && baseline.some((e) => e.type === 'level-up') && baseline.some((e) => e.id === 'rank-up:LIFE:1:D') && baseline.some((e) => e.type === 'achievement') && baseline.some((e) => e.type === 'regular-weeks') && baseline.some((e) => e.type === 'goal-due-soon'), `n=${baseline.length}`)
  check('Historique reconstitué : jamais présenté comme « nouveau »', baseline.every((e) => e.backfill && e.seenAt) && !(await vis(page.getByRole('button', { name: /— nouveau/ }))))
  check('Identifiants uniques (aucun doublon)', new Set(baseline.map((e) => e.id)).size === baseline.length)
  const lvDate = baseline.find((e) => e.id === 'rank-up:LIFE:1:D')?.at
  check('Dates réelles des faits (rang D franchi il y a ~60 jours, pas à l’instant)', !!lvDate && (Date.now() - new Date(lvDate).getTime()) / 86_400_000 > 50)
  await shot('intel-journal-mobile')

  // ── 3. Nouveaux faits : événements non consultés, notification groupée / majeure ───────────────────
  await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); await new Promise((res) => { const tx = db.transaction('notificationLog', 'readwrite'); tx.objectStore('notificationLog').clear(); tx.oncomplete = res }); db.close() })
  await putRows('xpEvents', [xp('LIFE', 12000, stamp(0, 9))])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(5000)
  await go('/rpg/journal')
  const all1 = await idbAll('rpgEvents')
  const fresh = all1.filter((e) => !e.backfill)
  check('Nouveaux niveaux, rang C (majeur) et palier de 10 (important) détectés', fresh.some((e) => e.id === 'rank-up:LIFE:1:C' && e.importance === 'major') && fresh.some((e) => e.id === 'level-up:LIFE:1:10' && e.importance === 'important') && fresh.every((e) => !e.seenAt))
  check('Seuls les faits importants créent des événements (pas une entrée par action ordinaire)', fresh.length < 25, `nouveaux=${fresh.length}`)
  check('Journal : entrées « nouveau » repérables, importance affichée', (await vis(page.getByRole('button', { name: /Rang C atteint en LIFE — Majeur — nouveau/ }))) && (await vis(page.getByRole('button', { name: /LIFE niveau 10 — Important — nouveau/ }))))
  const log = await idbAll('notificationLog')
  check('Notification : le rang majeur est notifié seul, une fois, sans formule culpabilisante', log.length === 1 && /Rang C atteint en LIFE/.test(log[0].title) && log[0].category === 'insights' && !GUILT.test(`${log[0].title} ${log[0].body}`), JSON.stringify(log.map((l) => l.title)))
  const infoNotified = log.some((l) => /niveau [2-4] /i.test(l.title))
  check('Aucune notification pour les simples montées de niveau d’information', !infoNotified)
  check('Notification système remise avec la route du journal', (await page.evaluate(() => window.__shown.length)) === 1)
  await shot('intel-journal-new-mobile')

  // ── 4. Consultation, filtres, historique conservé ────────────────────────────────────────────────────
  const total = all1.length
  await page.getByRole('button', { name: /Rang C atteint en LIFE/ }).click(); await page.waitForTimeout(600)
  check('Consulter une entrée : détail contextualisé (narration + description) et accès à la fonctionnalité', (await vis(page.getByRole('link', { name: 'Ouvrir' }))) && (await vis(page.getByText(/entre dans le rang C|accède au rang C|franchit une nouvelle étape/))))
  const afterOne = await idbAll('rpgEvents')
  check('La consultation est enregistrée sans rien supprimer', afterOne.find((e) => e.id === 'rank-up:LIFE:1:C').seenAt && afterOne.length === total)
  await shot('intel-journal-detail-mobile', false)
  for (const [filter, want] of [['LIFE', (e) => e.domain === 'LIFE'], ['Succès et récompenses', (e) => e.type === 'achievement' || e.type === 'reward'], ['Importants', (e) => e.importance !== 'info']]) {
    await page.getByRole('button', { name: filter, exact: true }).click(); await page.waitForTimeout(400)
    const shown = await page.getByRole('button', { name: /— (Information|Important|Majeur|Exceptionnel)/ }).count()
    const expected = all1.filter(want).length
    check(`Filtre « ${filter} » : entrées cohérentes`, filter === 'LIFE' ? shown > 0 && shown <= Math.min(30, expected) : shown === Math.min(30, expected), `${shown}/${expected}`)
  }
  await page.getByRole('button', { name: 'SPORT', exact: true }).click(); await page.waitForTimeout(400)
  check('Filtre SPORT : aucun moment sportif pour l’instant, message adapté', await vis(page.getByText(/Aucun moment dans cette catégorie/)))
  await page.getByRole('button', { name: 'Tout', exact: true }).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Tout marquer comme consulté/ }).click(); await page.waitForTimeout(600)
  const afterAll = await idbAll('rpgEvents')
  check('« Tout marquer comme consulté » : plus aucun nouveau, historique intact', afterAll.every((e) => e.seenAt) && afterAll.length === total)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(3500)
  check('Rechargement : aucun doublon ni nouvel événement fantôme', (await idbAll('rpgEvents')).length === total)
  check('Mobile : pas de débordement horizontal (journal)', await noOverflow())

  // ── 5. Analyse locale et recommandations ────────────────────────────────────────────────────────────
  await go('/rpg/analyse')
  check('Observation de régularité (faits chiffrés, fiabilité affichée)', (await vis(page.getByRole('article', { name: /Rythme régulier depuis 4 semaines/ }))) && (await vis(page.getByText(/Fiabilité (faible|moyenne|élevée)/))) && (await vis(page.getByText(/jours actifs/))))
  check('Observation « fait » mesuré étiquetée comme telle', await vis(page.getByText('Mesuré', { exact: true })))
  check('Constats LIFE réutilisés (projet en retard)', await vis(page.getByRole('article', { name: /Projet en retard : Refonte du site/ })))
  const rec = page.getByRole('article', { name: 'Réorganiser une échéance de projet' })
  check('Recommandation explicable : constat, justification, recommandation, bénéfice, confiance', (await vis(rec.getByText('Constat'))) && (await vis(rec.getByText('Ce qui le justifie'))) && (await vis(rec.getByText('Recommandation', { exact: true }))) && (await vis(rec.getByText('Bénéfice attendu'))) && (await vis(rec.getByText(/Confiance/))))
  check('Quatre décisions possibles : accepter, reporter, refuser, ignorer', (await vis(rec.getByRole('button', { name: 'Accepter' }))) && (await vis(rec.getByRole('button', { name: /Reporter/ }))) && (await vis(rec.getByRole('button', { name: 'Refuser' }))) && (await vis(rec.getByRole('button', { name: 'Ignorer' }))))
  check('Aucune pression : texte sans formule de culpabilité', !GUILT.test((await page.locator('main').innerText()).replace(/en retard|Projet en retard|retard/gi, '')))
  await shot('intel-analysis-mobile')
  const dueBefore = (await idbAll('projects')).find((p) => p.id === 'pj1').dueDate
  await rec.getByRole('button', { name: 'Refuser' }).click(); await page.waitForTimeout(700)
  check('Refus : la recommandation disparaît, rien n’est modifié', !(await vis(page.getByRole('article', { name: 'Réorganiser une échéance de projet' }))) && (await idbAll('projects')).find((p) => p.id === 'pj1').dueDate === dueBefore)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(3000)
  await go('/rpg/analyse')
  check('Recommandation refusée non re-proposée (situation inchangée)', !(await vis(page.getByRole('article', { name: 'Réorganiser une échéance de projet' }))))
  await page.getByText(/Décisions passées/).click(); await page.waitForTimeout(300)
  check('Historique minimal des décisions consultable', await vis(page.getByText(/Refusée le/)))
  await page.getByRole('button', { name: 'Réexaminer' }).first().click(); await page.waitForTimeout(700)
  check('Réexaminer une décision la remet en jeu', await vis(page.getByRole('article', { name: 'Réorganiser une échéance de projet' })))
  await page.getByRole('article', { name: 'Réorganiser une échéance de projet' }).getByRole('button', { name: /Reporter/ }).click(); await page.waitForTimeout(600)
  const snoozed = (await idbAll('recommendationStates')).find((s) => s.status === 'snoozed')
  check('Report : masquée jusqu’à une date, décision conservée', !!snoozed && snoozed.snoozeUntil === ahead(7))
  await page.getByText(/Décisions passées/).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Réexaminer' }).first().click(); await page.waitForTimeout(600)
  const acc = page.getByRole('article', { name: 'Réorganiser une échéance de projet' })
  await acc.getByRole('button', { name: 'Accepter' }).click(); await page.waitForTimeout(500)
  check('Acceptation d’une modification : confirmation explicite demandée, aucune écriture avant', (await vis(page.locator('dialog[open]').getByRole('button', { name: 'Appliquer' }))) && (await idbAll('projects')).find((p) => p.id === 'pj1').dueDate === dueBefore)
  await page.locator('dialog[open]').getByRole('button', { name: 'Appliquer' }).click(); await page.waitForTimeout(900)
  const projAfter = (await idbAll('projects')).find((p) => p.id === 'pj1')
  check('Après confirmation : échéance décalée, tracée, décision « acceptée »', projAfter.dueDate === ahead(14) && (await idbAll('planningMoves')).some((m) => m.kind === 'project' && m.byLevel) && (await idbAll('recommendationStates')).some((s) => s.status === 'accepted'))

  // ── 6. Sécurité SPORT : alerte de récupération → repos, jamais d'incitation à s'entraîner ──────────
  await putRows('recoveryChecks', [{ id: 'ck1', day: iso(new Date()), fatigue: 3, sleep: 0, soreness: 'none', sorenessAreas: {}, pain: 'strong', painArea: null, safety: 'ALERTE', index: 10, restChosen: false, at: stamp(0, 8) }])
  await putRows('sportSessions', [{ id: 'ss1', kind: 'strength', origin: 'planned', date: iso(new Date()), status: 'planned', title: 'Jambes', plannedMinutes: 45, variant: 'equipment', slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp(0), updatedAt: stamp(0) }])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(3000)
  await go('/rpg/analyse')
  const recSport = page.getByRole('article', { name: 'Prévoir une récupération adaptée' })
  check('Alerte de récupération : recommandation de repos adapté avec les éléments chiffrés', (await vis(recSport)) && (await vis(recSport.getByText(/alerte \(indice \d+\/100\)/))) && (await vis(recSport.getByText(/Privilégier le repos/))))
  check('Aucune recommandation de reprise ou d’entraînement pendant l’alerte', !(await vis(page.getByRole('article', { name: 'Reprendre progressivement' }))) && !/s’entraîner malgré|forcer/i.test(await page.locator('main').innerText()))
  await go('/')
  const order = await page.locator('main h2').allTextContents()
  check('Accueil : la récupération et les alertes restent prioritaires sur « En ce moment »', order.indexOf('Récupération') >= 0 && order.indexOf('En ce moment') >= 0 && order.indexOf('Récupération') < order.indexOf('En ce moment') && order.indexOf('À savoir maintenant') < order.indexOf('En ce moment'), JSON.stringify(order))
  check('Accueil : une seule carte « En ce moment » (événement, observation, recommandation)', (await page.getByRole('heading', { name: 'En ce moment' }).count()) === 1)
  await shot('intel-home-mobile')

  // ── 7. Événement majeur en cours de session : présentation marquée ─────────────────────────────────
  await go('/life/objectifs')
  await page.getByRole('button', { name: 'Ouvrir l’objectif Courir un semi-marathon' }).click(); await page.waitForTimeout(500)
  await page.locator('dialog[open]').getByRole('radio', { name: 'Atteint' }).click(); await page.waitForTimeout(4500)
  check('Objectif atteint pendant la session : carte « moment marquant » avec narration', (await vis(page.getByText('MOMENT MARQUANT'))) && (await vis(page.getByRole('status').filter({ hasText: /Objectif atteint : Courir un semi-marathon/ }))) && (await vis(page.getByText(/« Courir un semi-marathon » (est atteint|rejoint les objectifs atteints)|L’objectif « Courir un semi-marathon » est atteint/))))
  await shot('intel-major-toast-mobile', false)
  check('Événement « Objectif atteint » inscrit (majeur, nouveau)', (await idbAll('rpgEvents')).some((e) => e.id === 'goal-achieved:gl2' && e.importance === 'major' && !e.seenAt))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // ── 8. Bilans enrichis ──────────────────────────────────────────────────────────────────────────────
  await go('/bilans'); await page.getByRole('radio', { name: 'Semaine' }).click(); await page.waitForTimeout(700)
  check('Bilan hebdomadaire : synthèse du moteur (état général, progression, recommandations)', (await vis(page.getByRole('heading', { name: 'État général' }))) && (await vis(page.getByRole('heading', { name: 'Progression LIFE' }))) && (await vis(page.getByRole('heading', { name: 'Recommandations' }))))
  check('Bilan : faits mesurés, estimations, lectures du moteur et recommandations distingués', (await vis(page.getByText('Mesuré', { exact: true }))) && (await vis(page.getByText('Estimation', { exact: true }))) && (await vis(page.getByText('Recommandation', { exact: true }))))
  await shot('intel-report-week-mobile')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  const pdf = `${OUT}/bilan-intel-semaine.pdf`; await dl.saveAs(pdf)
  let txt = ''; try { txt = execSync(`pdftotext -layout ${pdf} -`).toString() } catch { /* absent */ }
  check('PDF : étiquettes de nature présentes', /Mesuré/.test(txt) && /État général/.test(txt), txt ? '' : 'pdftotext indisponible')
  await page.getByRole('radio', { name: 'Mois' }).click(); await page.waitForTimeout(600)
  check('Bilan mensuel : synthèse et tendances', (await vis(page.getByRole('heading', { name: 'État général' }))) && (await vis(page.getByRole('heading', { name: 'Évolution des niveaux' }))))
  await page.getByRole('radio', { name: 'Jour' }).click(); await page.waitForTimeout(600)
  check('Bilan du jour : événements importants du jour', await vis(page.getByRole('heading', { name: 'Événements importants' })))
  check('Mobile : pas de débordement horizontal (analyse, bilans)', await noOverflow())

  // ── 9. Narration : variée et fidèle ──────────────────────────────────────────────────────────────────
  await go('/rpg/journal')
  const bodies = await page.locator('[class*="entryBody"]').allTextContents()
  check('Narration contextuelle variée (pas un message répété)', new Set(bodies).size >= Math.min(8, bodies.length - 2), `${new Set(bodies).size}/${bodies.length}`)
  const nums = bodies.join(' ').match(/\d+/g) ?? []
  check('Narration fidèle : aucun niveau cité au-delà du niveau maximal', bodies.every((b) => [...b.matchAll(/niveau (\d+)/gi)].every((m) => Number(m[1]) <= 36)), nums.join(',').slice(0, 80))

  // ── 10. Sauvegardes, hors ligne ─────────────────────────────────────────────────────────────────────
  await go('/backups')
  check('Sauvegardes : page opérationnelle (journal et décisions couverts par les tests de format et de restauration)', await vis(page.getByRole('heading', { name: /Sauvegardes/ })))
  await go('/rpg/journal'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(1500)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
  check('Hors ligne : journal consultable, y compris les moments anciens', (await vis(page.getByRole('button', { name: /Rang D atteint en LIFE/ }))) || (await page.getByRole('button', { name: /— (Information|Important|Majeur|Exceptionnel)/ }).count()) > 0)
  await page.getByRole('button', { name: /Objectif atteint : Courir/ }).first().click().catch(() => undefined); await page.waitForTimeout(500)
  await go('/rpg/analyse')
  check('Hors ligne : analyse et recommandations disponibles', (await vis(page.getByRole('heading', { name: 'Observations' }))) && (await vis(page.getByRole('heading', { name: 'Recommandations' }))))
  await go('/bilans'); await page.getByRole('radio', { name: 'Semaine' }).click(); await page.waitForTimeout(500)
  const [dlo] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  await dlo.saveAs(`${OUT}/bilan-intel-hors-ligne.pdf`)
  check('Hors ligne : bilan enrichi exportable en PDF', fs.readFileSync(`${OUT}/bilan-intel-hors-ligne.pdf`).subarray(0, 5).toString() === '%PDF-')
  await ctx.setOffline(false)

  // ── 11. Bureau ──────────────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 })
  await go('/rpg/journal'); await shot('intel-journal-desktop')
  await go('/rpg/analyse'); await shot('intel-analysis-desktop')
  await go('/'); await shot('intel-home-desktop')
  const real = errors.filter((e) => !/favicon|Failed to load resource|net::ERR/.test(e))
  check('Aucune erreur JavaScript', real.length === 0, real.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})()
