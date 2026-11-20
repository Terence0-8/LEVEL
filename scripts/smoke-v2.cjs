/* Test de fumée navigateur de LEVEL V2 : première utilisation, bibliothèque et packs LIFE, programmes SPORT (recommandation, activation, séance, changement),
 * thèmes clair et sombre (contrastes, absence de dominante dorée), 4 largeurs × 2 thèmes, hors ligne.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-v2.cjs [dossier-captures] */
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const t0 = new Date(); t0.setHours(10, 0, 0, 0)
  await page.clock.install({ time: t0 })
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(700) }
  const vis = (loc) => loc.first().isVisible().catch(() => false)
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  const idb = (store) => page.evaluate(async (s) => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const rows = await new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result) }); db.close(); return rows }, store)
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

  // ── 1. Première utilisation : aucun écran sans indication ──────────────────────────────────────────
  await page.goto(BASE + '#/'); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
  check('Accueil vide : message clair et deux chemins (quêtes prêtes, pack)', (await vis(page.getByText('Commence par ajouter quelques activités à ton quotidien'))) && (await vis(page.getByRole('link', { name: 'Choisir des quêtes' }))) && (await vis(page.getByRole('link', { name: 'Charger un pack de démarrage' }))))
  check('Accueil vide : invitation SPORT (programme) présente', await vis(page.getByRole('link', { name: 'Trouver mon programme' })))
  check('Accueil : en-tête contextualisé et date du jour', (await vis(page.getByRole('heading', { name: /Bonjour|Bonsoir|Bon après-midi/ }))) && (await vis(page.getByText(/novembre/))))
  await shot('v2-accueil-vide-mobile')
  await go('/pilotage'); check('Pilotage vide : invitation facultative', await vis(page.getByText('Une trajectoire, à votre rythme')))
  await go('/sport'); check('SPORT vide : « Pas encore de programme » avec action directe', (await vis(page.getByText('Pas encore de programme'))) && (await vis(page.getByRole('link', { name: 'Trouver mon programme' }))))
  await go('/sport/programmes')
  check('Programmes : « Aucun programme actif » + trois chemins (recommandation, découvrir, personnalisé)', (await vis(page.getByRole('heading', { name: 'Aucun programme actif' }))) && (await vis(page.getByRole('button', { name: 'Obtenir une recommandation' }))) && (await vis(page.getByRole('link', { name: 'Découvrir les programmes' }))) && (await vis(page.getByRole('link', { name: 'Créer un programme personnalisé' }))))
  await go('/life'); check('LIFE vide : trois chemins de démarrage', (await vis(page.getByRole('button', { name: 'Choisir des quêtes prédéfinies' }))) && (await vis(page.getByRole('button', { name: 'Charger un pack de démarrage' }))) && (await vis(page.getByRole('button', { name: 'Créer une quête personnelle' }))))

  // ── 2. Bibliothèque LIFE ─────────────────────────────────────────────────────────────────────────────
  await go('/'); await page.getByRole('link', { name: 'Choisir des quêtes' }).click(); await page.waitForTimeout(600)
  check('Bibliothèque : packs de démarrage et sept catégories proposés', (await vis(page.getByRole('heading', { name: 'Packs de démarrage' }))) && (await page.getByRole('button', { name: /, 8 quêtes$/ }).count()) === 7)
  await shot('v2-bibliotheque-mobile')
  await page.getByRole('button', { name: 'Culture & connaissances, 8 quêtes' }).click(); await page.waitForTimeout(400)
  const reading = page.locator('li').filter({ hasText: 'Lire pendant 20 minutes' })
  check('Catégorie : quêtes proposées avec rythme, durée, difficulté et XP indicative', (await vis(reading)) && /Chaque jour/.test(await reading.first().innerText()) && /≈ \d+ XP/.test(await reading.first().innerText()))
  check('Aucune quête n’est créée tant qu’on n’a rien choisi', (await idb('quests')).length === 0)
  await reading.first().getByRole('button', { name: 'Ajouter', exact: true }).click(); await page.waitForTimeout(600)
  const q1 = (await idb('quests'))[0]
  check('Ajouter : UNE vraie quête LIFE est créée (catégorie, rythme, durée du modèle) et aucune XP n’est attribuée', (await idb('quests')).length === 1 && q1.title === 'Lire pendant 20 minutes' && q1.type === 'daily' && q1.categoryId === 'cat-culture' && q1.effortMinutes === 20 && (await idb('xpEvents')).length === 0)
  check('Retour immédiat : « Dans vos quêtes » + message de confirmation', (await vis(reading.getByText('Dans vos quêtes'))) && (await vis(page.getByText('« Lire pendant 20 minutes » est dans vos quêtes.'))))
  await reading.first().getByRole('button', { name: /favoris/ }).click(); await page.waitForTimeout(300)
  check('Favori : étoile activée et mémorisée', (await idb('settings')).some((r) => r.key === 'lifeCatalog' && r.value.favorites.includes('life.cul.lecture')))
  await page.getByRole('button', { name: 'Découvrir' }).click(); await page.getByRole('searchbox', { name: 'Rechercher une quête' }).fill('budget'); await page.waitForTimeout(400)
  check('Recherche : « budget » trouve les quêtes finances', (await vis(page.locator('li').filter({ hasText: 'Mettre à jour son budget' }))) && !(await vis(page.locator('li').filter({ hasText: 'Lire pendant 20 minutes' }))))
  await page.getByRole('searchbox', { name: 'Rechercher une quête' }).fill('')
  // Personnaliser avant d'ajouter
  await page.getByRole('button', { name: 'Économie & finances, 8 quêtes' }).click(); await page.waitForTimeout(300)
  await page.locator('li').filter({ hasText: 'Mettre à jour son budget' }).first().getByRole('button', { name: 'Personnaliser' }).click(); await page.waitForTimeout(400)
  await page.getByRole('radio', { name: 'Chaque jour' }).click(); await page.fill('#cz-min', '15'); await page.getByRole('button', { name: 'Ajouter à mes quêtes' }).click(); await page.waitForTimeout(600)
  const budget = (await idb('quests')).find((q) => q.title === 'Mettre à jour son budget')
  check('Personnaliser : rythme et durée choisis avant l’ajout', !!budget && budget.type === 'daily' && budget.effortMinutes === 15)
  // Doublon
  await page.getByRole('button', { name: 'Découvrir' }).click(); await page.getByRole('searchbox', { name: 'Rechercher une quête' }).fill('lire pendant'); await page.waitForTimeout(300)
  check('Doublons : la quête déjà ajoutée n’a plus de bouton « Ajouter »', !(await vis(page.locator('li').filter({ hasText: 'Lire pendant 20 minutes' }).getByRole('button', { name: 'Ajouter', exact: true }))))
  await page.getByRole('searchbox', { name: 'Rechercher une quête' }).fill('')

  // ── 3. Pack de démarrage : prévisualiser, retirer, changer le rythme, ajouter ─────────────────────────
  await page.getByRole('button', { name: 'Voir le pack Organisation quotidienne' }).click(); await page.waitForTimeout(500)
  check('Pack : contenu visible avec un récapitulatif de charge (jamais de routine imposée)', (await vis(page.getByRole('checkbox', { name: 'Marcher quotidiennement' }))) && (await vis(page.getByText(/quête.* dont \d+ par jour/))))
  await shot('v2-pack-mobile')
  const before = (await idb('quests')).length
  await page.getByRole('checkbox', { name: 'Ranger son espace de travail' }).uncheck()
  await page.getByLabel('Rythme de Tenir un court journal').selectOption('weekly'); await page.waitForTimeout(200)
  await page.getByRole('button', { name: /^Ajouter 4 quêtes$/ }).click(); await page.waitForTimeout(800)
  const after = await idb('quests')
  check('Pack : 4 quêtes ajoutées (une retirée), rythme modifié, aucune XP, aucune autre créée', after.length === before + 4 && after.find((q) => q.title === 'Tenir un court journal')?.type === 'weekly' && !after.some((q) => q.title === 'Ranger son espace de travail') && (await idb('xpEvents')).length === 0)
  await page.getByRole('button', { name: 'Voir le pack Organisation quotidienne' }).click(); await page.waitForTimeout(400)
  check('Pack rouvert : quêtes déjà présentes signalées et non sélectionnables (pas de doublon)', (await page.getByText('Déjà dans vos quêtes').count()) >= 4 && (await page.getByRole('checkbox', { name: 'Marcher quotidiennement' }).isDisabled()))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // ── 4. Valider depuis l'accueil : XP du moteur existant ─────────────────────────────────────────────
  await go('/')
  const rewarded = (await idb('quests')).find((q) => q.title === 'Lire pendant 20 minutes')
  await page.getByRole('button', { name: 'Valider Lire pendant 20 minutes' }).click(); await page.waitForTimeout(800)
  const xp = (await idb('xpEvents')).filter((e) => e.kind === 'award')
  check('Validation depuis l’accueil : XP du moteur (journal) égale à la récompense de la quête', xp.length === 1 && xp[0].amount === rewarded.rewardXp && rewarded.rewardXp > 0, `${xp[0]?.amount}/${rewarded.rewardXp}`)
  check('Retour visuel immédiat : quête cochée et XP gagnée affichée', (await vis(page.getByText(`+${rewarded.rewardXp} XP`))) && (await vis(page.getByText('Validée', { exact: true }))))
  await shot('v2-accueil-usage-mobile')
  // Dupliquer, enregistrer comme modèle
  await go('/life/quetes')
  await page.locator('article button[aria-expanded]').first().click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Dupliquer' }).first().click(); await page.waitForTimeout(500)
  check('Dupliquer une quête : copie indépendante sans XP', (await idb('quests')).some((q) => /\(copie\)$/.test(q.title)))
  await page.getByRole('button', { name: 'Enregistrer comme modèle' }).first().click(); await page.waitForTimeout(500)
  check('Modèle personnel enregistré (copie du catalogue personnel)', (await idb('settings')).some((r) => r.key === 'lifeCatalog' && r.value.custom.length === 1))
  await go('/life/bibliotheque'); check('« Mes modèles » apparaît dans la bibliothèque', await vis(page.getByRole('button', { name: /Mes modèles \(1\)/ })))

  // ── 5. SPORT : recommandation, activation, séance, changement ───────────────────────────────────────
  await go('/sport/programmes')
  await page.getByRole('button', { name: 'Obtenir une recommandation' }).click(); await page.waitForTimeout(500)
  check('Assistant : étape 1 — objectif', await vis(page.getByRole('radio', { name: /Prendre du muscle/ })))
  await page.getByRole('radio', { name: /Prendre du muscle/ }).click(); await page.getByRole('button', { name: 'Continuer' }).click(); await page.waitForTimeout(300)
  check('Assistant : le niveau est demandé (profil vide)', await vis(page.getByText('Quel est ton niveau ?')))
  await page.getByRole('radio', { name: 'Débutant' }).click(); await page.getByRole('button', { name: 'Continuer' }).click(); await page.waitForTimeout(300)
  await page.getByRole('radio', { name: '3', exact: true }).click(); await page.getByRole('button', { name: 'Continuer' }).click(); await page.waitForTimeout(300)
  await page.getByRole('radio', { name: 'Domicile' }).click(); await page.getByRole('button', { name: 'Continuer' }).click(); await page.waitForTimeout(400)
  check('Assistant : proposition expliquée (« Pourquoi ce programme ? »)', (await vis(page.getByRole('heading', { name: 'Musculation débutant' }))) && (await vis(page.getByText('Pourquoi ce programme ?'))))
  await shot('v2-assistant-resultat-mobile')
  await page.getByRole('button', { name: 'Activer ce programme' }).click(); await page.waitForTimeout(500)
  check('Activation : récapitulatif de ce qui change, catalogue intact', (await vis(page.getByText('Ce qui va changer'))) && (await vis(page.getByText(/Le programme du catalogue reste intact/))))
  await page.getByRole('button', { name: 'Activer le programme' }).click(); await page.waitForTimeout(900)
  const sp = (await idb('settings')).find((r) => r.key === 'sportProgram')
  check('Programme actif : instance personnalisée enregistrée, profil SPORT adapté', sp?.value.active?.templateId === 'prog.muscu.debutant' && (await idb('sportProfile'))[0].experience === 'beginner' && (await idb('sportProfile'))[0].equipmentProfile === 'home')
  check('Programme actif : prochaine séance, semaine et bouton d’action visibles', (await vis(page.getByRole('heading', { name: 'Corps entier A' }))) && (await vis(page.getByText(/Semaine 1 sur 8/))) && (await vis(page.getByRole('button', { name: 'Commencer la séance' }))))
  if (process.env.DEBUG) console.log('PROG>>', (await page.locator('main').innerText()).slice(0, 600).replace(/\n/g, ' | '))
  await shot('v2-programme-actif-mobile')
  await go('/'); check('Accueil : la prochaine séance du programme est proposée', (await vis(page.getByRole('heading', { name: 'Corps entier A' }))) && (await vis(page.getByRole('button', { name: 'Commencer la séance' }))))
  await page.getByRole('button', { name: 'Commencer la séance' }).click(); await page.waitForURL(/seance\//, { timeout: 8000 }); await page.waitForTimeout(800)
  const session = (await idb('sportSessions'))[0]
  const names = session.slots.map((s) => (s.equipment || s.bodyweight).exerciseId)
  check('Séance démarrée depuis le programme : composée par le moteur SPORT, étiquetée programme, aucune XP avant la fin', session.programTag?.templateId === 'prog.muscu.debutant' && session.slots.length > 0 && (await idb('xpEvents')).filter((e) => e.domain === 'SPORT').length === 0)
  check('Aucune variante de pompes dans la séance du programme', !(await page.locator('main').innerText()).match(/pompe/i) && !names.some((n) => /pushup|pompe/i.test(n)))
  await go('/sport/programmes')
  await page.getByRole('button', { name: 'Voir le programme Préparer un 5 km' }).click(); await page.waitForTimeout(400)
  check('Détail d’un programme de course : consignes et progression', (await vis(page.locator('dialog[open]').getByText('Progression', { exact: true }))) && (await vis(page.locator('dialog[open]').getByText('Sortie longue', { exact: true }))))
  await page.getByRole('button', { name: 'Choisir ce programme' }).click(); await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Activer le programme' }).click(); await page.waitForTimeout(900)
  const sp2 = (await idb('settings')).find((r) => r.key === 'sportProgram').value
  check('Changer de programme : l’ancien rejoint l’historique, séances et performances conservées', sp2.active.templateId === 'prog.course.5km' && sp2.history.length === 1 && sp2.history[0].templateId === 'prog.muscu.debutant' && (await idb('sportSessions')).length === 1)
  check('Programme de course : séance du jour avec consigne et bouton « Enregistrer la sortie »', await vis(page.getByRole('button', { name: 'Enregistrer la sortie' })))
  await page.getByRole('button', { name: 'Enregistrer la sortie' }).first().click(); await page.waitForTimeout(500)
  check('Sortie préremplie selon le programme (durée)', (await page.locator('dialog[open] input[type=number]').first().inputValue()).length >= 0 && (await vis(page.getByRole('heading', { name: 'Enregistrer une course' }))))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)

  // ── 6. Récupération prioritaire : alerte → aucune séance proposée ───────────────────────────────────
  await go('/sport/recuperation'); await page.waitForTimeout(400)
  await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('level'); r.onsuccess = () => res(r.result) }); const tx = db.transaction('recoveryChecks', 'readwrite'); tx.objectStore('recoveryChecks').put({ id: 'rc-v2', day: new Date().toISOString().slice(0, 10), fatigue: 0, sleep: 3, soreness: 'none', sorenessAreas: {}, pain: 'strong', painArea: 'pectoraux', safety: 'ALERTE', index: 10, restChosen: false, at: new Date().toISOString() }); await new Promise((r) => { tx.oncomplete = r }); db.close() })
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  await go('/sport/programmes')
  check('Alerte de récupération : pas de bouton de démarrage, message explicite', !(await vis(page.getByRole('button', { name: 'Enregistrer la sortie' }))) && (await vis(page.getByText(/Alerte de récupération : aucune séance/))))
  await go('/'); check('Accueil : l’alerte de récupération est mise en avant', await vis(page.getByRole('heading', { name: 'À savoir' })))

  // ── 7. Thèmes : contrastes et sobriété du doré ───────────────────────────────────────────────────────
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => { localStorage.setItem('level-theme', t); document.documentElement.dataset.theme = t }, theme)
    await go('/life')
    const c = await page.evaluate(() => { const st = getComputedStyle(document.documentElement); const rgb = (v) => { const el = document.createElement('i'); el.style.color = v.trim(); document.body.appendChild(el); const m = getComputedStyle(el).color.match(/\d+/g).map(Number); el.remove(); return m.slice(0, 3) }; const g = (n) => rgb(st.getPropertyValue(n)); return { bg: g('--c-bg'), panel: g('--c-panel'), text: g('--c-text'), dim: g('--c-text-dim'), faint: g('--c-text-faint'), accent: g('--c-accent'), onAccent: g('--c-on-accent'), sport: g('--c-sport'), pilot: g('--c-pilot'), success: g('--c-success'), warn: g('--c-warn'), danger: g('--c-danger'), rpg: g('--c-rpg') } })
    const r = (a, b) => Math.round(ratio(c[a], c[b]) * 10) / 10
    check(`Thème ${theme} : texte principal ≥ 7:1, secondaire ≥ 4.5:1, discret ≥ 4.5:1 sur la surface`, r('text', 'panel') >= 7 && r('dim', 'panel') >= 4.5 && r('faint', 'panel') >= 4.5, `${r('text', 'panel')} / ${r('dim', 'panel')} / ${r('faint', 'panel')}`)
    check(`Thème ${theme} : boutons pleins lisibles (texte sur accent ≥ 4.5:1)`, r('onAccent', 'accent') >= 4.5, `${r('onAccent', 'accent')}`)
    check(`Thème ${theme} : accents LIFE / SPORT / Pilotage lisibles en texte (≥ 3:1 sur le fond)`, r('accent', 'bg') >= 3 && r('sport', 'bg') >= 3 && r('pilot', 'bg') >= 3, `${r('accent', 'bg')} / ${r('sport', 'bg')} / ${r('pilot', 'bg')}`)
    check(`Thème ${theme} : succès, alerte et erreur lisibles (≥ 3:1)`, r('success', 'bg') >= 3 && r('warn', 'bg') >= 3 && r('danger', 'bg') >= 3, `${r('success', 'bg')} / ${r('warn', 'bg')} / ${r('danger', 'bg')}`)
    // Le doré (or RPG) ne domine pas : aucun élément LIFE / SPORT / Pilotage n'en utilise
    const goldIn = async (route) => { await go(route); return page.evaluate((gold) => { const near = (s) => { const m = s.match(/[\d.]+/g); if (!m || m.length < 3) return false; const [r, g, b] = m.map(Number); return Math.abs(r - gold[0]) + Math.abs(g - gold[1]) + Math.abs(b - gold[2]) < 24 && (m.length < 4 || Number(m[3]) > 0.5) }; return [...document.querySelectorAll('main *, nav *')].filter((e) => { const cs = getComputedStyle(e); return near(cs.color) || near(cs.backgroundColor) || near(cs.borderTopColor) }).length }, c.rpg) }
    const gold = { life: await goldIn('/life/quetes'), lib: await goldIn('/life/bibliotheque'), sport: await goldIn('/sport/programmes'), pilot: await goldIn('/pilotage') }
    check(`Thème ${theme} : aucun doré dans LIFE, SPORT et Pilotage (réservé au RPG)`, gold.life + gold.lib + gold.sport + gold.pilot === 0, JSON.stringify(gold))
  }

  // ── 8. Quatre largeurs × deux thèmes : lisibilité, débordements, captures ───────────────────────────
  const ROUTES = ['/', '/life/quetes', '/life/bibliotheque', '/sport', '/sport/programmes', '/rpg', '/pilotage', '/planning', '/profile']
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => { localStorage.setItem('level-theme', t); document.documentElement.dataset.theme = t }, theme)
    for (const w of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width: w, height: w >= 768 ? 900 : 800 })
      const bad = []
      for (const r of ROUTES) { await go(r); if (!(await noOverflow())) bad.push(r) }
      check(`${theme} ${w} px : ${ROUTES.length} écrans sans débordement horizontal`, bad.length === 0, bad.join(' '))
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await go('/'); const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36 && !e.closest('p') }).map((e) => e.textContent.trim().slice(0, 24)))
  check('Accueil mobile : zones tactiles ≥ 36 px (hors liens dans une phrase)', small.length === 0, small.join(' | '))

  // ── 9. Hors ligne : catalogues disponibles localement ───────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('level-theme', 'dark'))
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('h1'); await go('/life/bibliotheque')
  check('Hors ligne : bibliothèque et packs disponibles', (await vis(page.getByRole('heading', { name: 'Packs de démarrage' }))) && (await page.getByRole('button', { name: /, \d+ quêtes$/ }).count()) === 7)
  await go('/sport/programmes'); check('Hors ligne : catalogue de programmes disponible', await vis(page.getByRole('button', { name: 'Voir le programme Force' })))
  await page.getByRole('button', { name: 'Voir le programme Force' }).click(); await page.waitForTimeout(400); check('Hors ligne : détail d’un programme (aucune API externe)', await vis(page.locator('dialog[open]').getByText('Progression', { exact: true })))
  await page.keyboard.press('Escape'); await ctx.setOffline(false)

  const relevant = errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/i.test(e))
  check('Aucune erreur JavaScript ni erreur de console', relevant.length === 0, relevant.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
