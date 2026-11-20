/* Test de fumée navigateur de PILOTAGE V1 : vision, orientations, priorités (limite souple), cycles, revues, historique, relations LIFE,
 * recommandations stratégiques, réglages, rappels, sauvegarde chiffrée + restauration, hors ligne.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-pilotage.cjs [dossier-captures]
 * Les ACTIONS testées passent par l'interface ; seules les données LIFE de départ (objectifs, projet) sont écrites comme fixtures. */
const { chromium } = require('playwright')
const fs = require('node:fs')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }
const GUILT = /paresse|manque de discipline|manque de motivation|inconstan|échec|honte|décevant/i

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(() => {
    try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }) } catch { /* ignore */ }
    window.__shown = []
    ServiceWorkerRegistration.prototype.showNotification = function (title, opts) { window.__shown.push({ title, body: opts && opts.body }); return Promise.resolve() }
  })
  const t0 = new Date(); t0.setHours(10, 0, 0, 0)
  await page.clock.install({ time: t0 })
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(800) }
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
  const clearStores = (stores) => page.evaluate(async (list) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => { const tx = db.transaction(list, 'readwrite'); list.forEach((s) => tx.objectStore(s).clear()); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close()
  }, stores)
  const stamp = (daysAgo, h = 10) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const tmp = process.argv[3] || OUT

  // ── 1. Départ : Pilotage facultatif, rien d'imposé ──────────────────────────────────────────────────
  await page.goto(BASE + '#/'); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  check('Navigation : onglet Pilotage présent', await vis(page.getByRole('link', { name: 'Pilotage' })))
  check('Navigation mobile : 5 espaces sans débordement horizontal', (await noOverflow()) && (await page.locator('nav[aria-label="Navigation principale"] a:visible').count()) === 5)
  await page.getByRole('link', { name: 'Pilotage' }).first().click(); await page.waitForTimeout(700)
  check('Pilotage sans données : invitation facultative, aucune vision imposée', (await vis(page.getByText('Une trajectoire, à votre rythme'))) && (await vis(page.getByText(/Level fonctionne très bien sans lui/))))
  await shot('pilotage-empty-mobile')
  await go('/rpg/analyse')
  check('Analyse sans données stratégiques : aucune observation Pilotage', !(await vis(page.getByText(/priorités fondamentales actives/))))
  const before = { goals: [], xp: (await idbAll('xpEvents')).length }

  // ── 2. Données LIFE de départ (fixtures) : on les RÉFÉRENCE, on ne les duplique jamais ──────────────
  const mk = (id, title, extra = {}) => ({ id, title, description: '', categoryId: 'cat-pro', createdAt: stamp(60), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: stamp(60), updatedAt: stamp(60), ...extra })
  await putRows('goals', [mk('gl1', 'Lancer la bêta'), mk('gl2', 'Courir un semi-marathon', { categoryId: 'cat-perso' }), mk('gl3', 'Épargner trois mois de charges')])
  await putRows('projects', [{ id: 'pj1', title: 'Refonte du site', description: '', categoryId: 'cat-pro', goalId: 'gl1', priority: 'normal', startDate: null, dueDate: null, status: 'active', steps: [], createdAt: stamp(60), updatedAt: stamp(10), statusAt: stamp(60) }])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
  const lifeBefore = { goals: (await idbAll('goals')).length, projects: (await idbAll('projects')).length, quests: (await idbAll('quests')).length, xp: (await idbAll('xpEvents')).length }

  // ── 3. Vision : création, révision, conservation des versions ───────────────────────────────────────
  await go('/pilotage/vision')
  await page.getByRole('button', { name: 'Écrire ma vision' }).click(); await page.waitForTimeout(400)
  await page.fill('#v-title', 'Vivre de mes projets, près de la mer')
  await page.fill('#v-desiredSituation', 'Un quotidien calme, des revenus réguliers et du temps pour le sport.')
  await page.fill('#v-h-long', 'Habiter au bord de la mer.')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(700)
  check('Vision créée et affichée', (await vis(page.getByRole('heading', { name: 'Vivre de mes projets, près de la mer' }))) && (await vis(page.getByText('Habiter au bord de la mer.'))))
  await shot('pilotage-vision-mobile')
  await page.getByRole('button', { name: 'Réviser la vision' }).click(); await page.waitForTimeout(400)
  await page.fill('#v-desiredSituation', 'Un quotidien calme, des revenus réguliers, du temps pour le sport et la famille.')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(700)
  check('Révision : la version précédente reste consultable', (await vis(page.getByText(/Vision révisée/))) && (await vis(page.getByText('Voir la version précédente'))))
  const visions = await idbAll('visions')
  check('Une seule vision active, date de révision distincte de la création', visions.length === 1 && visions[0].status === 'active')

  // ── 4. Orientations : création, statut, liens LIFE (plusieurs), ordre, archivage ────────────────────
  await go('/pilotage/orientations')
  check('Orientations vides : message clair', await vis(page.getByText('Aucune orientation')))
  const newOrientation = async (name) => { await page.getByRole('button', { name: '+ Nouvelle orientation' }).click(); await page.waitForTimeout(350); await page.fill('#o-name', name); await page.getByRole('button', { name: 'Créer l’orientation' }).click(); await page.waitForTimeout(600) }
  await newOrientation('Autonomie financière'); await newOrientation('Santé')
  check('Deux orientations créées', (await idbAll('orientations')).length === 2)
  await page.getByLabel('Statut de Autonomie financière').selectOption('active'); await page.waitForTimeout(400)
  await page.getByLabel('Statut de Santé').selectOption('active'); await page.waitForTimeout(400)
  const linkTo = async (name, labels, uncheck = false) => {
    await page.locator(`article[aria-label="${name}"]`).getByRole('button', { name: 'Liens LIFE' }).click(); await page.waitForTimeout(400)
    for (const l of labels) await (uncheck ? page.getByLabel(l, { exact: false }).first().uncheck() : page.getByLabel(l, { exact: false }).first().check())
    await page.getByRole('button', { name: 'Enregistrer les liens' }).click(); await page.waitForTimeout(600)
  }
  await linkTo('Autonomie financière', ['Lancer la bêta', 'Épargner trois mois de charges', 'Refonte du site'])
  await linkTo('Santé', ['Courir un semi-marathon', 'Lancer la bêta'])
  const ors = await idbAll('orientations')
  const auto = ors.find((o) => o.name === 'Autonomie financière'), sante = ors.find((o) => o.name === 'Santé')
  check('Liens LIFE : références (ids), un même objectif sert deux orientations', auto.goalIds.includes('gl1') && sante.goalIds.includes('gl1') && auto.projectIds.includes('pj1'))
  const lifeAfterLinks = { goals: (await idbAll('goals')).length, projects: (await idbAll('projects')).length, quests: (await idbAll('quests')).length, xp: (await idbAll('xpEvents')).length }
  check('Aucune duplication : objectifs, projets, quêtes et XP inchangés', JSON.stringify(lifeAfterLinks) === JSON.stringify(lifeBefore))
  await shot('pilotage-orientations-mobile')
  await page.getByRole('button', { name: 'Descendre Autonomie financière' }).click(); await page.waitForTimeout(500)
  const order = (await idbAll('orientations')).sort((a, b) => a.order - b.order).map((o) => o.name)
  check('Réorganisation : ordre modifié', order[0] === 'Santé' && order[1] === 'Autonomie financière')
  // Détacher ne supprime rien
  await linkTo('Santé', ['Lancer la bêta'], true)
  check('Détacher un objectif : l’objectif LIFE existe toujours', (await idbAll('goals')).some((g) => g.id === 'gl1') && !(await idbAll('orientations')).find((o) => o.name === 'Santé').goalIds.includes('gl1'))
  await page.locator('article[aria-label="Santé"]').getByRole('button', { name: 'Archiver' }).click(); await page.waitForTimeout(500)
  check('Archivage : l’orientation disparaît de la liste mais reste en base', !(await vis(page.locator('article[aria-label="Santé"]'))) && (await idbAll('orientations')).find((o) => o.name === 'Santé').archived === true)
  await page.getByRole('button', { name: 'Afficher les archivées' }).click(); await page.waitForTimeout(400)
  check('Archivées consultables', await vis(page.locator('article[aria-label="Santé"]')))
  await page.locator('article[aria-label="Santé"]').getByRole('button', { name: 'Restaurer' }).click(); await page.waitForTimeout(400)

  // ── 5. Priorités : limite souple de 3 fondamentales, dépassement confirmé ───────────────────────────
  await go('/pilotage/priorites')
  const newPriority = async (title, level, goal) => {
    await page.getByRole('button', { name: '+ Nouvelle priorité' }).click(); await page.waitForTimeout(350)
    await page.fill('#p-title', title); await page.getByRole('radio', { name: level, exact: true }).click()
    if (goal) await page.getByLabel(goal, { exact: false }).first().check()
    await page.getByRole('button', { name: 'Créer la priorité' }).click(); await page.waitForTimeout(700)
  }
  await newPriority('Lancer la bêta avant l’été', 'Fondamentale', 'Lancer la bêta')
  await newPriority('Remettre un budget d’épargne', 'Fondamentale', 'Épargner trois mois')
  await newPriority('Préparer le semi-marathon', 'Fondamentale', 'Courir un semi')
  check('Trois priorités fondamentales : sous la limite, sans alerte', (await vis(page.getByText('3 / 3'))) && !(await vis(page.getByRole('heading', { name: 'Dépasser la limite souple ?' }))))
  await page.getByRole('button', { name: '+ Nouvelle priorité' }).click(); await page.waitForTimeout(350)
  await page.fill('#p-title', 'Apprendre le piano'); await page.getByRole('radio', { name: 'Fondamentale', exact: true }).click()
  await page.getByRole('button', { name: 'Créer la priorité' }).click(); await page.waitForTimeout(700)
  check('Quatrième fondamentale : confirmation explicite du dépassement', await vis(page.getByText('Dépasser la limite souple ?')))
  await shot('pilotage-limit-confirm-mobile', false)
  await page.getByRole('button', { name: 'Annuler' }).click(); await page.waitForTimeout(400)
  check('Annulation : rien n’est créé', (await idbAll('priorities')).length === 3)
  await page.getByRole('button', { name: 'Créer la priorité' }).click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Dépasser quand même' }).click(); await page.waitForTimeout(900)
  check('Dépassement confirmé : priorité créée, compteur 4 / 3', (await idbAll('priorities')).length === 4 && (await vis(page.getByText('4 / 3'))))
  await shot('pilotage-priorities-mobile')

  // ── 6. Tableau de bord ───────────────────────────────────────────────────────────────────────────────
  await go('/pilotage')
  check('Tableau de bord : vision, carte de trajectoire, KPI limite', (await vis(page.getByRole('heading', { name: 'Vivre de mes projets, près de la mer' }))) && (await vis(page.getByText('Carte de trajectoire'))) && (await vis(page.getByText('4 / 3'))))
  check('Tableau de bord : points d’attention sur la limite, avec niveau de certitude', (await vis(page.getByText(/4 priorités fondamentales actives/))) && (await vis(page.getByText('Certain', { exact: true }))))
  check('Tableau de bord : objectifs et projets reliés comptés (sans doublon)', await vis(page.getByText('Objectifs LIFE reliés')))
  check('Aucun vocabulaire culpabilisant', !GUILT.test(await page.locator('main').innerText()))
  check('Pas de débordement horizontal', await noOverflow())
  await shot('pilotage-dashboard-mobile')

  // ── 7. Recommandation stratégique appliquée APRÈS confirmation ───────────────────────────────────────
  await go('/rpg/analyse')
  check('Analyse : observation et recommandation stratégiques (constat, bénéfice, confiance)', (await vis(page.getByText(/4 priorités fondamentales actives/))) && (await vis(page.getByText(/Alléger vos priorités fondamentales|priorités fondamentales/i))))
  await shot('pilotage-analysis-mobile')
  const xpBeforeApply = (await idbAll('xpEvents')).length
  const prioBefore = (await idbAll('priorities')).filter((p) => p.level === 'fundamental' && p.status === 'active').length
  const recCard = page.locator('article[aria-label]').filter({ hasText: /fondamentale/i }).first()
  await recCard.getByRole('button', { name: 'Accepter' }).click(); await page.waitForTimeout(500)
  check('Application : confirmation demandée, rien de modifié avant', (await vis(page.getByRole('button', { name: 'Appliquer' }))) && (await idbAll('priorities')).filter((p) => p.level === 'fundamental' && p.status === 'active').length === prioBefore)
  await page.getByRole('button', { name: 'Appliquer' }).click(); await page.waitForTimeout(900)
  const prioAfter = (await idbAll('priorities')).filter((p) => p.level === 'fundamental' && p.status === 'active').length
  check('Après confirmation : une priorité rétrogradée (jamais supprimée), XP intacte', prioAfter === prioBefore - 1 && (await idbAll('priorities')).length === 4 && (await idbAll('xpEvents')).length === xpBeforeApply)
  const logRows = await idbAll('strategyLog')
  check('Décision tracée « sur proposition de Level, confirmée »', logRows.some((l) => l.action === 'priority-level' && /confirmée/.test(l.note || '')))

  // ── 8. Plan annuel, cycle trimestriel, revue de cycle ────────────────────────────────────────────────
  await go('/pilotage/cycles')
  await page.getByRole('button', { name: 'Préparer le plan' }).click(); await page.waitForTimeout(400)
  await page.fill('#pl-aims', 'Lancer la bêta et constituer une épargne de sécurité.'); await page.fill('#pl-why', 'Gagner en autonomie.'); await page.fill('#pl-act', 'Deux sessions de travail par semaine.')
  await page.getByRole('button', { name: 'Enregistrer le plan' }).click(); await page.waitForTimeout(700)
  check('Plan annuel enregistré (quoi, pourquoi, actions concrètes)', (await vis(page.getByText('Gagner en autonomie.'))) && (await idbAll('annualPlans')).length === 1)
  await page.getByRole('button', { name: 'Préparer le cycle' }).click(); await page.waitForTimeout(400)
  await page.getByLabel('Lancer la bêta avant l’été').check()
  await page.fill('#cy-res', 'Bêta ouverte à dix testeurs')
  await page.getByRole('button', { name: 'Enregistrer le cycle' }).click(); await page.waitForTimeout(700)
  const cyc = await idbAll('cycles')
  check('Cycle du trimestre : sélection d’éléments existants, aucune tâche créée', cyc.length === 1 && cyc[0].priorityIds.length === 1 && (await idbAll('quests')).length === lifeBefore.quests)
  check('Charge et capacité : section présente, constats qualifiés', await vis(page.getByText('Charge et capacité')))
  await shot('pilotage-cycles-mobile')
  await page.getByRole('button', { name: 'Faire la revue du trimestre' }).click(); await page.waitForTimeout(1200)
  check('Revue : faits calculés depuis LIFE, ton neutre', (await vis(page.getByText(/faits calculés depuis LIFE/))) && !GUILT.test(await page.locator('main').innerText()))
  await page.fill('#rv-difficulties', 'Peu de temps en septembre.'); await page.fill('#rv-dec', 'Garder la bêta comme priorité unique.')
  await shot('pilotage-review-mobile')
  await page.getByRole('button', { name: 'Enregistrer la revue' }).click(); await page.waitForTimeout(1000)
  const cycAfter = await idbAll('cycles'), revs = await idbAll('strategyReviews')
  check('Revue enregistrée avec ses faits ; cycle clos ; cycle suivant préparé (planifié)', revs.length === 1 && revs[0].facts && cycAfter.length === 2 && cycAfter.some((c) => c.status === 'closed') && cycAfter.some((c) => c.status === 'planned'))
  check('Aucune XP écrite par les revues, cycles ou priorités', (await idbAll('xpEvents')).length === lifeBefore.xp)

  // ── 9. Historique stratégique ────────────────────────────────────────────────────────────────────────
  await go('/pilotage/historique')
  await page.fill('#d-title', 'Concentrer le trimestre sur la bêta'); await page.getByRole('button', { name: 'Enregistrer la décision' }).click(); await page.waitForTimeout(600)
  check('Historique : décision ajoutée à la chronologie', await vis(page.getByText('Concentrer le trimestre sur la bêta').last()))
  check('Historique : visions, orientations, priorités, plan, cycles et revues tracés', await (async () => { const kinds = new Set((await idbAll('strategyLog')).map((l) => l.kind)); return ['vision', 'orientation', 'priority', 'plan', 'cycle', 'review', 'decision'].every((k) => kinds.has(k)) })())
  check('Historique : filtres par type', await vis(page.getByRole('button', { name: 'Priorités', exact: true })))
  await shot('pilotage-history-mobile')
  const logBefore = (await idbAll('strategyLog')).length

  // ── 10. Relation visible depuis LIFE ─────────────────────────────────────────────────────────────────
  await go('/life/objectifs')
  await page.getByText('Lancer la bêta', { exact: false }).first().click(); await page.waitForTimeout(600)
  check('Fiche objectif LIFE : section Pilotage (orientation, priorité, contribution)', (await vis(page.getByText(/Orientation · Autonomie financière/))) && (await vis(page.getByText(/Contribue à « Autonomie financière »/))))
  await page.screenshot({ path: `${OUT}/pilotage-life-goal-mobile.png` })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // ── 11. Réglages ─────────────────────────────────────────────────────────────────────────────────────
  await go('/profile')
  check('Profil : réglages Pilotage (limite, rappels de revue)', (await vis(page.getByText('Priorités fondamentales conseillées'))) && (await vis(page.getByRole('switch', { name: 'Rappel de revue mensuelle' }))))
  await page.fill('#pil-max', '5'); await page.keyboard.press('Tab'); await page.waitForTimeout(600)
  check('Limite de priorités fondamentales modifiée dans les réglages', (await idbAll('settings')).find((r) => r.key === 'appPrefs')?.value?.pilotage?.maxFundamental === 5)
  await page.getByRole('switch', { name: 'Rappel de revue mensuelle' }).click(); await page.waitForTimeout(500)
  check('Rappel mensuel activable (désactivé par défaut)', (await idbAll('settings')).find((r) => r.key === 'appPrefs')?.value?.pilotage?.reminders?.monthly === true)
  await go('/pilotage'); check('Limite 5 : plus de point d’attention sur la limite', !(await vis(page.getByText(/priorités fondamentales actives \(limite/))))

  // ── 12. Sauvegarde chiffrée et restauration ──────────────────────────────────────────────────────────
  await go('/backups')
  await page.getByRole('button', { name: 'Définir ma phrase secrète' }).first().click(); await page.waitForTimeout(400)
  await page.fill('#sp-pass', 'ma phrase secrète 2026'); await page.fill('#sp-conf', 'ma phrase secrète 2026')
  await page.getByRole('button', { name: 'Chiffrer et tester' }).click(); await page.waitForSelector('text=Test de déchiffrement réussi', { timeout: 15000 })
  await page.getByLabel(/J’ai conservé ma clé de secours/).check(); await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Exporter un fichier/ }).click(); await page.waitForTimeout(300)
  await page.fill('#ex-pass', 'ma phrase secrète 2026'); await page.getByRole('button', { name: 'Créer le fichier chiffré' }).click(); await page.waitForSelector('text=Fichier créé et vérifié', { timeout: 15000 })
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Télécharger level-sauvegarde/ }).click()])
  const exported = `${tmp}/pilotage-export.levelbackup`; await dl.saveAs(exported)
  const envText = fs.readFileSync(exported, 'utf8')
  check('Fichier exporté : chiffré, sans donnée stratégique en clair', !/Vivre de mes projets|Autonomie financière|Concentrer le trimestre/.test(envText))
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click(); await page.waitForTimeout(300)
  const snapshot = { v: (await idbAll('visions')).length, o: (await idbAll('orientations')).length, p: (await idbAll('priorities')).length, pl: (await idbAll('annualPlans')).length, c: (await idbAll('cycles')).length, r: (await idbAll('strategyReviews')).length, l: (await idbAll('strategyLog')).length }
  await clearStores(['visions', 'orientations', 'priorities', 'annualPlans', 'cycles', 'strategyReviews', 'strategyLog'])
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  check('Perte simulée : la stratégie est vide', (await idbAll('priorities')).length === 0 && (await idbAll('goals')).length === 3)
  await go('/backups')
  await page.getByRole('button', { name: /Restaurer depuis un fichier/ }).click(); await page.waitForTimeout(300)
  await page.setInputFiles('#rf-file', exported); await page.getByLabel('Phrase secrète', { exact: true }).fill('ma phrase secrète 2026')
  await page.getByRole('button', { name: 'Analyser la sauvegarde' }).click(); await page.waitForTimeout(1800)
  await page.getByLabel(/Je comprends que mes données actuelles/).check()
  await page.getByRole('button', { name: 'Remplacer mes données' }).click(); await page.waitForSelector('text=Restauration terminée et vérifiée', { timeout: 15000 })
  const restored = { v: (await idbAll('visions')).length, o: (await idbAll('orientations')).length, p: (await idbAll('priorities')).length, pl: (await idbAll('annualPlans')).length, c: (await idbAll('cycles')).length, r: (await idbAll('strategyReviews')).length, l: (await idbAll('strategyLog')).length }
  check('Restauration : vision, orientations, priorités, plan, cycles, revues et mémoire restitués', JSON.stringify(restored) === JSON.stringify(snapshot), JSON.stringify(restored))
  check('Restauration : objectifs, projets et XP intacts', (await idbAll('goals')).length === 3 && (await idbAll('projects')).length === 1 && (await idbAll('xpEvents')).length === lifeBefore.xp)

  // ── 13. Rappel de revue (fin de trimestre) via le moteur de notifications existant ──────────────────
  const q4 = new Date(); q4.setMonth(11, 26); q4.setHours(10, 0, 0, 0)
  await page.clock.setSystemTime(q4)
  await go('/'); await page.clock.fastForward(70_000); await page.waitForTimeout(1500)
  const shown = await page.evaluate(() => window.__shown)
  const inbox = await idbAll('notificationLog')
  const reviewNotif = inbox.find((n) => /^review-due:/.test(n.key))
  check('Rappel de revue : proposé en fin de période, ton neutre, facultatif', !!reviewNotif && !GUILT.test(`${reviewNotif.title} ${reviewNotif.body}`) && /facultati|possible|propos/i.test(`${reviewNotif.title} ${reviewNotif.body}`), reviewNotif ? reviewNotif.title : '(aucun)')
  void shown

  // ── 14. Hors ligne ───────────────────────────────────────────────────────────────────────────────────
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 }); await page.waitForTimeout(900)
  await go('/pilotage/orientations')
  check('Hors ligne : orientations et liens disponibles', await vis(page.locator('article[aria-label="Autonomie financière"]')))
  await go('/pilotage/priorites'); await newPriority('Tester sans réseau', 'Secondaire')
  check('Hors ligne : création d’une priorité', (await idbAll('priorities')).some((p) => p.title === 'Tester sans réseau'))
  await go('/pilotage'); check('Hors ligne : tableau de bord complet', await vis(page.getByText('Carte de trajectoire')))
  await ctx.setOffline(false)

  // ── 15. Non-régression d'ensemble ────────────────────────────────────────────────────────────────────
  for (const [h, t] of [['/', 'h1'], ['/life', 'h1'], ['/sport', 'h1'], ['/planning', 'h1'], ['/rpg', 'h1'], ['/bilans', 'h1']]) { await go(h); check(`Écran ${h} : s’affiche sans débordement`, (await vis(page.locator(t))) && (await noOverflow())) }
  await page.setViewportSize({ width: 1280, height: 900 }); await go('/pilotage'); await shot('pilotage-dashboard-desktop')
  await go('/pilotage/orientations'); await shot('pilotage-orientations-desktop')
  check('Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
