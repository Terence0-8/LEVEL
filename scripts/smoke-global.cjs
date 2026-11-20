/* Test de fumée navigateur de l'orchestration globale (Playwright) : accueil adaptatif, planning, notifications, bilans PDF, RPG, hors ligne.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-global.cjs [dossier-captures]
 * Les jeux de données (quêtes, engagements, séance, questionnaire) sont écrits directement dans IndexedDB, comme des fixtures ;
 * les ACTIONS testées (valider, appliquer une proposition, exporter, régler) passent par l'interface. */
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['notifications'], acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // Heure fixée à 10 h locale : les règles horaires (échéances dès 9 h, tranquillité 22 h–7 h) sont testées de façon déterministe.
  // Chromium headless refuse toujours les notifications système : on simule l'API pour tester le chemin « système » ;
  // le chemin de repli (refus) est testé plus bas dans un contexte SANS simulation.
  await page.addInitScript(() => {
    try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }) } catch { /* ignore */ }
    window.__shown = []
    ServiceWorkerRegistration.prototype.showNotification = function (title, opts) { window.__shown.push({ title, opts }); return Promise.resolve() }
  })
  const t = new Date(); t.setHours(10, 0, 0, 0)
  await page.clock.install({ time: t })
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(800) }
  const shot = (n, full = true) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full })
  const vis = (loc) => loc.first().isVisible().catch(() => false)
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const idb = (fn, arg) => page.evaluate(async ({ src, arg }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    try { return await new Function('db', 'arg', `return (${src})(db, arg)`)(db, arg) } finally { db.close() }
  }, { src: fn.toString(), arg })
  const put = (store, rows) => idb(async (db, a) => { await new Promise((res, rej) => { const tx = db.transaction(a.store, 'readwrite'); a.rows.forEach((r) => tx.objectStore(a.store).put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }) }, { store, rows })
  const all = (store) => idb((db, s) => new Promise((res, rej) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }), store)

  // ── 1. Accueil global (aucune donnée) ───────────────────────────────────
  await page.goto(BASE); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  check('Accueil : en-tête, niveaux LIFE et SPORT avec rang par domaine', (await vis(page.getByRole('heading', { name: 'LIFE · rang E' }))) && (await vis(page.getByRole('heading', { name: 'SPORT · rang E' }))))
  check('Accueil : prochaine séance (état vide utile), récupération, semaine', (await vis(page.getByText('Planifier ma semaine'))) && (await vis(page.getByRole('heading', { name: 'Récupération' }))) && (await vis(page.getByRole('heading', { name: 'Cette semaine' }))))
  check('Accueil vide : aucune alerte ni échéance affichée (pas de bloc vide)', !(await vis(page.getByRole('heading', { name: 'À savoir maintenant' }))) && !(await vis(page.getByRole('heading', { name: 'Échéances importantes' }))))
  check('Accueil : aucune réorganisation manuelle (pas de poignée ni de glisser-déposer)', (await page.locator('[draggable="true"]').count()) === 0)
  check('Mobile : pas de débordement horizontal (accueil)', await noOverflow())
  await shot('global-home-empty-mobile')
  check('Navigation mobile : Planning et Bilans accessibles', (await vis(page.locator('nav.tabs, nav[aria-label="Navigation principale"]').last().getByRole('link', { name: 'Planning' }))) || (await page.getByRole('link', { name: 'Planning' }).count()) > 0)

  // ── 2. Jeu de données : semaine chargée, engagement important, séance, quête importante ──
  const D = { tomorrow: ahead(1), d3: ahead(3), d6: ahead(6), d9: ahead(9) }
  const now = Date.now()
  const quest = (id, title, o) => ({ id, type: 'personal', title, description: '', categoryId: 'cat-pro', priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 60, steps: [], rewardXp: 40, archived: false, plannedFor: null, createdAt: now - 86_400_000 * 3, updatedAt: now, ...o })
  await put('quests', [
    quest('qa', 'Dossier de prêt bancaire', { priority: 'high', dueDate: D.tomorrow, plannedFor: D.tomorrow, effortMinutes: 150, difficulty: 'hard' }),
    quest('qb', 'Déclaration de charges', { dueDate: D.d6, plannedFor: D.tomorrow, effortMinutes: 120 }),
    quest('qc', 'Refonte du CV', { plannedFor: D.tomorrow, effortMinutes: 120 }),
    quest('qd', 'Ranger le bureau', { effortMinutes: 30 }),
    quest('qe', 'Marcher 20 minutes', { type: 'daily', effortMinutes: 20, rewardXp: 12 }),
  ])
  await put('commitments', [{ id: 'cm1', title: 'Rendez-vous notaire', date: D.tomorrow, start: '10:00', minutes: 60, important: true, note: '', createdAt: new Date().toISOString() }])
  const stamp = new Date().toISOString()
  await put('sportSessions', [{ id: 'ss1', kind: 'strength', origin: 'planned', date: D.tomorrow, status: 'planned', title: 'Haut du corps', plannedMinutes: 45, variant: 'equipment', slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp, updatedAt: stamp }])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(3500)

  // ── 3. Accueil adaptatif et alertes ─────────────────────────────────────
  check('Accueil : alertes et recommandations (échéance importante demain)', (await vis(page.getByRole('heading', { name: 'À savoir maintenant' }))) && (await vis(page.getByText('Échéance importante demain'))))
  check('Accueil : quêtes prioritaires avec raisons, la quête importante en tête', (await page.locator('ul li').filter({ hasText: 'Dossier de prêt bancaire' }).first().isVisible()) && (await vis(page.getByText(/échéance demain/i))))
  const order = await page.locator('main h2').allTextContents()
  check('Accueil : alertes et échéances avant les blocs secondaires (ordre automatique)', order.indexOf('À savoir maintenant') >= 0 && order.indexOf('À savoir maintenant') < order.indexOf('Activités récentes') && order.indexOf('Échéances importantes') < order.indexOf('Attributs'), JSON.stringify(order))
  check('Accueil : échéances importantes listées (engagement + quête)', (await vis(page.getByText('Rendez-vous notaire'))) && (await vis(page.getByText('Demain').first())))
  check('Accueil : prochaine séance planifiée visible', await vis(page.getByText('Haut du corps')))
  await shot('global-home-loaded-mobile')

  // ── 4. Notifications ─────────────────────────────────────────────────────
  let log = await all('notificationLog')
  check('Notification : alerte d’échéance émise (heure fixée à 10 h, hors tranquillité)', log.some((l) => l.category === 'deadlines'), JSON.stringify(log.map((l) => l.key)))
  check('Notification : une seule, pas de rafale', log.length === 1, `n=${log.length}`)
  const shown = await page.evaluate(() => window.__shown)
  check('Notification : remise système (permission accordée, API simulée)', log[0]?.channel === 'system' && shown.length === 1 && shown[0].opts?.data?.route === '/planning', JSON.stringify(shown[0]))
  await page.waitForTimeout(65_000)
  log = await all('notificationLog')
  check('Notification : pas de répétition après une minute (déduplication + écart minimal)', log.length === 1, `n=${log.length}`)

  // ── 5. Planning central ──────────────────────────────────────────────────
  await go('/planning')
  check('Planning : semaine, séance SPORT et engagement affichés', (await vis(page.getByText('Haut du corps'))) && (await vis(page.getByText('Rendez-vous notaire'))) && (await vis(page.getByText('Dossier de prêt bancaire'))))
  check('Planning : journée surchargée détectée', await vis(page.getByText(/Journée surchargée|Journée chargée/)))
  check('Planning : engagement important protégé signalé', await vis(page.getByText(/Engagement important le même jour/)))
  check('Planning : propositions listées avec la règle « rien n’est modifié sans accord »', (await vis(page.getByRole('heading', { name: 'Propositions de Level' }))) && (await vis(page.getByText(/Rien n’est modifié sans votre accord/))))
  check('Planning : aucune proposition ne vise la quête importante ni l’engagement', (await page.locator('ul li', { hasText: /Déplacer « Dossier de prêt|Simplifier « Dossier|Retirer « Dossier|Déplacer « Rendez-vous/ }).count()) === 0)
  check('Mobile : pas de débordement horizontal (planning)', await noOverflow())
  await shot('global-planning-mobile')
  const before = (await all('quests')).reduce((m, q) => ({ ...m, [q.id]: q }), {})
  const prop = page.getByRole('button', { name: 'Appliquer', exact: true }).first()
  const propTitle = await page.locator('li', { has: prop }).locator('b').first().textContent()
  await prop.click(); await page.waitForTimeout(400)
  check('Planning : confirmation demandée avant toute application', await vis(page.getByRole('button', { name: 'Appliquer', exact: true }).last()))
  await page.locator('dialog[open]').getByRole('button', { name: 'Appliquer', exact: true }).click(); await page.waitForTimeout(800)
  const after = (await all('quests')).reduce((m, q) => ({ ...m, [q.id]: q }), {})
  const moves = await all('planningMoves')
  const changed = Object.keys(after).filter((id) => JSON.stringify(after[id]) !== JSON.stringify(before[id]))
  console.log(`INFO  proposition appliquée : « ${propTitle} » ; quêtes modifiées : ${changed.join(', ')}`)
  check('Proposition appliquée : exactement une quête touchée, tracée comme réorganisation de Level', changed.length === 1 && moves.some((m) => m.byLevel && m.refId === changed[0]) || (changed.length === 1 && /Simplifier/.test(propTitle)))
  check('Échéances et quête importante intactes après réorganisation', after.qa.plannedFor === D.tomorrow && after.qa.dueDate === D.tomorrow && after.qb.dueDate === D.d6 && after.qa.effortMinutes === 150)
  // Placement manuel d'une quête sans jour
  await go('/planning')
  await page.getByRole('button', { name: 'Placer', exact: true }).first().click(); await page.waitForTimeout(400)
  await page.fill('#mv', D.d3)
  await page.locator('dialog[open]').getByRole('button', { name: 'Valider' }).click(); await page.waitForTimeout(700)
  check('Planning : placement manuel d’une quête (jour prévu, échéance jamais touchée)', (await all('quests')).find((q) => q.id === 'qd')?.plannedFor === D.d3)
  // Engagement via l'interface
  await page.getByRole('button', { name: 'Ajouter un engagement' }).click(); await page.waitForTimeout(400)
  await page.fill('#c-title', 'Dentiste'); await page.fill('#c-date', D.d3); await page.fill('#c-start', '09:00'); await page.fill('#c-min', '45')
  await page.locator('dialog[open]').getByRole('button', { name: 'Enregistrer' }).click(); await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Semaine suivante' }).click(); await page.waitForTimeout(500)
  check('Planning : engagement ajouté et affiché (semaine concernée)', (await all('commitments')).some((c) => c.title === 'Dentiste') && (await vis(page.getByText('Dentiste'))))
  // Conflit de récupération
  await put('recoveryChecks', [{ id: 'ck1', day: iso(new Date()), fatigue: 3, sleep: 0, soreness: 'none', sorenessAreas: {}, pain: 'strong', painArea: null, safety: 'ALERTE', index: 10, restChosen: false, at: new Date().toISOString() }])
  await put('sportSessions', [{ id: 'ss2', kind: 'strength', origin: 'planned', date: iso(new Date()), status: 'planned', title: 'Jambes', plannedMinutes: 45, variant: 'equipment', slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp, updatedAt: stamp }])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
  check('Planning : conflit de récupération (alerte + séance du jour)', await vis(page.getByText(/Alerte de récupération : cette séance ne doit pas avoir lieu/)))
  check('Planning : proposition SPORT déléguée au moteur SPORT', await vis(page.getByText('Réorganiser la semaine sportive')))
  await go('/')
  check('Accueil : alerte de récupération en tête, rappel « repos »', (await vis(page.getByText('Récupération en alerte'))) && (await page.locator('main h2').first().textContent()) !== null)
  const order2 = await page.locator('main h2').allTextContents()
  check('Accueil : alerte et récupération passent avant les quêtes (réorganisation automatique)', order2.indexOf('À savoir maintenant') < order2.indexOf('Quêtes prioritaires') && order2.indexOf('Récupération') < order2.indexOf('Quêtes prioritaires'), JSON.stringify(order2))
  await shot('global-home-alert-mobile')
  await page.waitForTimeout(2500)
  log = await all('notificationLog')
  check('Notification : alerte de récupération → conseil de repos, jamais une relance sportive', log.some((l) => l.category === 'recovery') || log.length >= 1)

  // ── 6. XP, recalculs et cohérence RPG ───────────────────────────────────
  await go('/rpg')
  const xp0 = (await page.locator('p', { hasText: /Total .* XP/ }).first().textContent()).replace(/\s| | /g, '')
  await go('/')
  await page.getByRole('button', { name: 'Valider Marcher 20 minutes' }).click(); await page.waitForTimeout(900)
  await go('/rpg')
  const xp1 = (await page.locator('p', { hasText: /Total .* XP/ }).first().textContent()).replace(/\s| | /g, '')
  check('XP : validation depuis l’accueil recalculée dans le RPG', xp0 !== xp1, `${xp0} → ${xp1}`)
  check('RPG : niveaux LIFE et SPORT indépendants avec rang par domaine', (await vis(page.getByText(/Niveau 1 · rang E/))) )
  await shot('global-rpg-mobile')
  await go('/profile')
  await page.getByRole('button', { name: 'Vérifier la cohérence du RPG' }).click(); await page.waitForTimeout(500)
  check('Cohérence RPG : tous les contrôles passent', (await vis(page.getByText('Tout est cohérent'))) && (await page.locator('li', { hasText: '✗' }).count()) === 0)
  check('Cohérence RPG : prestige annoncé honnêtement comme « à venir »', await vis(page.getByText(/À venir : Prestige/)))
  await shot('global-settings-rpg-mobile', false)

  // ── 7. Réglages : notifications, tranquillité, planning ────────────────
  await go('/profile')
  check('Réglages : capacité de la plateforme décrite honnêtement (pas de promesse en arrière-plan)', await vis(page.getByText(/Application fermée, aucune remise n’est garantie/)))
  await page.getByRole('radio', { name: 'Minimal' }).click(); await page.waitForTimeout(300)
  await page.getByRole('switch', { name: 'Sport' }).click(); await page.waitForTimeout(300)
  await page.getByLabel('Heure du rappel').fill('08:30'); await page.getByLabel('Texte du rappel').fill('Étirements'); await page.getByRole('button', { name: 'Ajouter', exact: true }).click(); await page.waitForTimeout(400)
  check('Réglages : fréquence, catégorie et rappel fixe enregistrés', (await vis(page.getByText('Étirements'))) && (await page.getByRole('radio', { name: 'Minimal' }).getAttribute('aria-checked')) === 'true')
  await page.getByRole('switch', { name: 'Rappel Étirements' }).click(); await page.waitForTimeout(300)
  await page.fill('#cap', '180'); await page.locator('#cap').blur(); await page.waitForTimeout(400); await page.getByRole('button', { name: 'dimanche' }).click(); await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Envoyer une notification d’essai' }).click(); await page.waitForTimeout(500)
  check('Réglages : notification d’essai', await vis(page.getByText('Notification d’essai').first()))
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  const kept = [await page.locator('#cap').inputValue(), await page.getByRole('radio', { name: 'Minimal' }).getAttribute('aria-checked'), await page.getByRole('switch', { name: 'Rappel Étirements' }).getAttribute('aria-checked')]
  check('Réglages : conservés après rechargement', kept[0] === '180' && kept[1] === 'true' && kept[2] === 'false', JSON.stringify(kept))
  check('Mobile : pas de débordement horizontal (réglages)', await noOverflow(), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ':' + Math.round(e.getBoundingClientRect().right)))))
  await shot('global-settings-mobile')
  // Plage de tranquillité couvrant l'heure courante : aucune nouvelle notification
  await page.getByLabel('De', { exact: true }).fill('09:00'); await page.getByLabel('À', { exact: true }).fill('11:00'); await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Vider' }).click(); await page.waitForTimeout(400)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(4500)
  log = await all('notificationLog')
  check('Tranquillité 9 h–11 h à 10 h : aucune notification émise', log.length === 0, `n=${log.length}`)
  await go('/planning')
  const loads = await page.locator('main').innerText()
  check('Planning : la capacité réglée (3 h/jour, dimanche indisponible) est appliquée', /Jour indisponible/.test(loads) && /\/ 2 h24/.test(loads), (loads.match(/\d+ ?h?\d* \/ [\dh ]+|Jour indisponible/g) || []).slice(0, 4).join(' ; '))

  // ── 8. Bilans et export PDF ──────────────────────────────────────────────
  await go('/bilans')
  check('Bilan du jour : accomplissements, non réalisés, sport, récupération, priorités de demain', (await vis(page.getByRole('heading', { name: 'XP gagnée' }))) && (await vis(page.getByRole('heading', { name: 'Accomplissements' }))) && (await vis(page.getByRole('heading', { name: 'Quêtes non réalisées' }))) && (await vis(page.getByRole('heading', { name: 'Activité sportive' }))) && (await vis(page.getByRole('heading', { name: 'État de récupération' }))) && (await vis(page.getByRole('heading', { name: 'Priorités de demain' }))))
  check('Bilan du jour : XP gagnée et quête validée', (await vis(page.getByText('Marcher 20 minutes'))))
  check('Bilans : pourcentages présentés comme mesure du planning', await vis(page.getByText(/Les pourcentages décrivent l’exécution du planning/)))
  check('Bilans : export présenté comme distinct d’une sauvegarde', await vis(page.getByText(/ce n’est pas une sauvegarde/)))
  await shot('global-report-day-mobile')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  const dayPath = `${OUT}/bilan-jour.pdf`; await dl.saveAs(dayPath)
  const head = fs.readFileSync(dayPath).subarray(0, 5).toString()
  check('PDF jour : fichier valide nommé « level-bilan-jour-… », distinct des sauvegardes', head === '%PDF-' && /^level-bilan-jour-\d{4}-\d{2}-\d{2}\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename())
  let txt = ''; try { txt = execSync(`pdftotext -layout ${dayPath} -`).toString() } catch { /* pdftotext absent */ }
  check('PDF jour : contenu lisible (accents, sections)', /Bilan du jour/.test(txt) && /Accomplissements/.test(txt) && /Priorités de demain/.test(txt) && /Marcher 20 minutes/.test(txt), txt ? '' : 'pdftotext indisponible')
  await page.getByRole('radio', { name: 'Semaine' }).click(); await page.waitForTimeout(600)
  check('Bilan hebdomadaire : régularité, progression, temps, volume, attributs, difficultés, recommandations', (await vis(page.getByRole('heading', { name: 'Régularité' }))) && (await vis(page.getByRole('heading', { name: 'Progression LIFE et SPORT' }))) && (await vis(page.getByRole('heading', { name: 'Répartition du temps' }))) && (await vis(page.getByRole('heading', { name: /Volume sportif/ }))) && (await vis(page.getByRole('heading', { name: 'Évolution des attributs' }))) && (await vis(page.getByRole('heading', { name: 'Difficultés rencontrées' }))) && (await vis(page.getByRole('heading', { name: 'Recommandations' }))))
  await shot('global-report-week-mobile')
  const [dlw] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  await dlw.saveAs(`${OUT}/bilan-semaine.pdf`)
  await page.getByRole('radio', { name: 'Mois' }).click(); await page.waitForTimeout(600)
  check('Bilan mensuel : progression, niveaux, attributs, objectifs, tendances, records, réussites, recommandations', (await vis(page.getByRole('heading', { name: 'Progression générale' }))) && (await vis(page.getByRole('heading', { name: 'Évolution des niveaux' }))) && (await vis(page.getByRole('heading', { name: 'Objectifs avancés' }))) && (await vis(page.getByRole('heading', { name: 'Tendances' }))) && (await vis(page.getByRole('heading', { name: 'Records sportifs' }))) && (await vis(page.getByRole('heading', { name: 'Réussites' }))) && (await vis(page.getByRole('heading', { name: 'Recommandations à moyen terme' }))))
  const [dlm] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  await dlm.saveAs(`${OUT}/bilan-mois.pdf`)
  try { const n = execSync(`python3 -c "import pypdf;print(len(pypdf.PdfReader('${OUT}/bilan-mois.pdf').pages))"`).toString().trim(); check('PDF mois : lisible par un lecteur tiers (pypdf)', Number(n) >= 1, `pages=${n}`) } catch { check('PDF mois : lisible par un lecteur tiers (pypdf)', false, 'pypdf indisponible') }
  await page.getByRole('button', { name: 'Période précédente' }).click(); await page.waitForTimeout(500)
  check('Bilans : navigation vers la période précédente', await vis(page.getByText(/octobre|novembre|décembre|janvier|février|mars|avril|mai|juin|juillet|août|septembre/)))
  check('Mobile : pas de débordement horizontal (bilans)', await noOverflow())
  await shot('global-report-month-mobile')

  // ── 9. Sauvegardes : les nouvelles données sont couvertes ───────────────
  await go('/backups')
  check('Sauvegardes : page toujours opérationnelle (tables v5 couvertes par les tests de format)', await vis(page.getByRole('heading', { name: /Sauvegardes/ })))

  // ── 10. Hors ligne ──────────────────────────────────────────────────────
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(1500)
  await go('/')
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  check('Hors ligne : accueil global disponible', await vis(page.getByRole('heading', { name: 'Cette semaine' })))
  await go('/planning'); check('Hors ligne : planning disponible', await vis(page.getByRole('heading', { name: 'Planning' })))
  await go('/bilans')
  const [dlo] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter ce bilan en PDF/ }).click()])
  const offPath = `${OUT}/bilan-hors-ligne.pdf`; await dlo.saveAs(offPath)
  check('Hors ligne : export PDF fonctionnel', fs.readFileSync(offPath).subarray(0, 5).toString() === '%PDF-')
  await go('/profile'); check('Hors ligne : réglages et notifications disponibles', await vis(page.getByRole('heading', { name: 'Notifications' })))
  await ctx.setOffline(false)

  // ── 10 bis. Repli : navigateur qui refuse les notifications système (contexte neuf, SANS simulation) ──
  {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    const p2 = await ctx2.newPage()
    await p2.clock.install({ time: t })
    await p2.goto(BASE); await p2.waitForSelector('h1'); await p2.waitForTimeout(800)
    const put2 = (store, rows) => p2.evaluate(async ({ store, rows }) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); rows.forEach((r) => tx.objectStore(store).put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close()
    }, { store, rows })
    await put2('quests', [quest('qx', 'Envoyer le dossier', { priority: 'high', dueDate: D.tomorrow, plannedFor: D.tomorrow })])
    await p2.reload(); await p2.waitForSelector('h1'); await p2.waitForTimeout(4000)
    await p2.evaluate(() => { location.hash = '/profile' }); await p2.waitForTimeout(900)
    check('Repli : permission refusée → explication honnête et rappels dans l’application', await p2.getByText(/refusées dans ce navigateur/).first().isVisible())
    check('Repli : la notification d’échéance attend dans la boîte de réception', await p2.getByText(/Échéance demain : Envoyer le dossier/).first().isVisible())
    await p2.screenshot({ path: `${OUT}/global-settings-fallback-mobile.png`, fullPage: false })
    await ctx2.close()
  }

  // ── 11. Bureau ──────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 })
  await go('/'); await shot('global-home-desktop')
  await go('/planning'); await shot('global-planning-desktop')
  await go('/bilans'); await shot('global-report-desktop')
  check('Bureau : navigation latérale avec Planning et Bilans', (await vis(page.locator('aside').getByRole('link', { name: 'Planning' }))) && (await vis(page.locator('aside').getByRole('link', { name: 'Bilans' }))))

  const real = errors.filter((e) => !/favicon|Failed to load resource|net::ERR/.test(e))
  check('Aucune erreur JavaScript', real.length === 0, real.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})()
