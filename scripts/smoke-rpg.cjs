/* Test de fumée navigateur de RPG V1.1 : rangs, attributs, prestige LIFE (indépendant de SPORT), récompenses, succès, bilans, hors ligne.
 * Usage : npm run build && npx vite preview --port 4173 &  node scripts/smoke-rpg.cjs [dossier-captures]
 * L'XP initiale est écrite dans le journal IndexedDB comme fixture (atteindre le niveau 36 par l'usage prendrait des années) ;
 * toutes les ACTIONS testées (prestige, choix, équipement, consultation) passent par l'interface. */
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4173/'
const OUT = process.argv[2] || '/tmp'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }
// Courbe de la configuration centrale : coût du niveau l = round(100 · l^1,35) ; 36 niveaux de domaine
const xpToMax = () => { let s = 0; for (let l = 1; l < 36; l++) s += Math.round(100 * Math.pow(l, 1.35)); return s }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
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
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d.toISOString() }
  const xpEvent = (id, domain, amount, daysAgo) => ({ id, kind: 'award', source: domain === 'LIFE' ? 'quest' : 'activity', sourceId: id, questId: null, stepId: null, awardKey: domain === "SPORT" ? `sport:fixture:${id}` : `fixture:${id}`, cycleKey: 'once', domain, categoryId: domain === 'LIFE' ? 'cat-pro' : null, attribute: domain === 'LIFE' ? 'discipline' : 'force', amount, baseAmount: amount, micro: false, at: day(daysAgo), recordedAt: day(daysAgo), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: 'Fixture de test', label: `Fixture ${domain}`, status: 'valid', correctsEventId: null, reversedByEventId: null })

  // ── 1. Progression : rangs E → SSS, niveaux de domaine, attributs ───────────────────────────────
  await page.goto(BASE + '#/rpg'); await page.waitForSelector('h1'); await page.waitForTimeout(1000)
  check('RPG : 5 sections (Progression, Attributs, Distinctions, Récompenses, Prestige)', (await page.getByRole('navigation', { name: 'Sections RPG' }).getByRole('link').count()) === 5)
  check('Niveaux LIFE et SPORT indépendants, rang E au départ', await vis(page.getByText(/Niveau 1 · rang E/)))
  const rungs = await page.locator('[class*="rung"] [class*="letter"]').allTextContents()
  check('Échelle des rangs : E, D, C, B, A, S, SS, SSS', JSON.stringify(rungs) === JSON.stringify(['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E']), JSON.stringify(rungs))
  check('Mobile : pas de débordement horizontal (progression)', await noOverflow())
  await shot('rpg-progress-mobile')
  await go('/rpg/attributs')
  const attrs = await page.locator('[class*="attr"] > span:first-child').allTextContents()
  check('Attributs LIFE (7, un par catégorie) et SPORT (7) avec ce qui les fait évoluer', (await vis(page.getByText('Relations'))) && (await vis(page.getByText(/Social et relations/))) && (await vis(page.getByText(/Séances de mobilité/))) && attrs.length >= 14, `n=${attrs.length}`)
  await shot('rpg-attributes-mobile')

  // ── 2. Données : LIFE au dernier niveau du rang SSS, SPORT bien en-dessous ─────────────────────
  const need = xpToMax()
  await putRows('xpEvents', [xpEvent('fx1', 'LIFE', need, 40), xpEvent('fx2', 'SPORT', 6000, 35), xpEvent('fx3', 'LIFE', 2500, 5)])
  const sumBefore = (await idbAll('xpEvents')).reduce((n, e) => n + e.amount, 0)
  const countBefore = (await idbAll('xpEvents')).length
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(3500)
  await go('/')
  check('Accueil : LIFE au rang SSS (niveau 36) et alerte « Prestige LIFE disponible »', (await vis(page.getByText('Prestige LIFE disponible'))) && (await vis(page.getByRole('heading', { name: /LIFE · rang SSS/ }))))
  check('Accueil : SPORT sans prestige (non éligible)', !(await vis(page.getByText('Prestige SPORT disponible'))))
  await shot('rpg-home-prestige-mobile')
  await go('/rpg')
  check('Progression : dernier niveau du cycle, XP au-delà conservée, prestige signalé facultatif', (await vis(page.getByText(/Niveau maximal du cycle/))) && (await vis(page.getByText(/Prestige LIFE disponible — facultatif/))))
  const lifeMaxed = await page.locator('main').innerText()
  check('LIFE continue de progresser au niveau maximal sans prestige obligatoire', /2\s?500 XP au-delà/.test(lifeMaxed.replace(/ | /g, ' ')))

  // ── 3. Prestige : éligibilité, annulation, confirmation ────────────────────────────────────────
  await go('/rpg/prestige')
  check('Prestige : LIFE disponible, SPORT non (indépendance)', (await vis(page.getByRole('link', { name: 'Préparer le prestige LIFE' }))) && !(await vis(page.getByRole('link', { name: 'Préparer le prestige SPORT' }))))
  check('Prestige : SPORT indique l’XP restante, historique vide par domaine', (await vis(page.getByText(/Il reste environ .* XP pour atteindre le niveau 36/))) && (await vis(page.getByText('Aucun prestige LIFE pour l’instant'))) && (await vis(page.getByText('Aucun prestige SPORT pour l’instant'))))
  await shot('rpg-prestige-mobile')
  await go('/rpg/prestige/SPORT')
  check('Prestige SPORT refusé (non éligible), aucune confirmation possible', (await vis(page.getByText(/n’est pas disponible/))) && !(await vis(page.getByRole('button', { name: /Confirmer le prestige/ }))))
  await go('/rpg/prestige/LIFE')
  check('Écran de confirmation : position actuelle, prochain numéro, conservé, réinitialisé, nouveau fonctionnement', (await vis(page.getByRole('heading', { name: /Prestige LIFE n° 1/ }))) && (await vis(page.getByText('Ce qui est conservé'))) && (await vis(page.getByText('Ce qui est réinitialisé'))) && (await vis(page.getByText(/Nouveau fonctionnement/))) && (await vis(page.getByText(/20 % d’XP en plus \(×1.2\)/))) && (await vis(page.getByText(/Niveau 36/))))
  const choices = page.getByRole('radio')
  const nChoices = await choices.count()
  const cats = await page.locator('[class*="choice"] [class*="cat"]').allTextContents()
  check('Récompenses proposées : 4 propositions de catégories différentes', nChoices === 4 && new Set(cats.map((c) => c.split(' · ')[0])).size === 4, JSON.stringify(cats.map((c) => c.split(' · ')[0])))
  const confirmBtn = page.getByRole('button', { name: /Confirmer le prestige LIFE n° 1/ })
  check('Confirmation impossible sans choix ni accord explicite', await confirmBtn.isDisabled())
  await choices.filter({ hasText: 'Élan LIFE I' }).click(); await page.waitForTimeout(200)
  check('Choix seul insuffisant : l’accord explicite reste obligatoire', await confirmBtn.isDisabled())
  await shot('rpg-prestige-confirm-mobile')
  await page.getByRole('link', { name: 'Plus tard' }).click(); await page.waitForTimeout(700)
  check('Annulation : aucun prestige ni récompense enregistrés, XP intacte', (await idbAll('prestiges')).length === 0 && (await idbAll('rpgRewards')).length === 0 && (await idbAll('xpEvents')).length === countBefore)
  await go('/rpg/prestige/LIFE')
  await page.getByRole('radio').filter({ hasText: 'Élan LIFE I' }).click()
  await page.getByLabel(/Je comprends que le niveau LIFE repart/).check()
  check('Confirmation possible après choix et accord', !(await confirmBtn.isDisabled()))
  await confirmBtn.click(); await page.waitForTimeout(2200)
  check('Mise en scène du prestige (événement marquant) avec numéro et récompense', (await vis(page.getByRole('dialog', { name: /Prestige LIFE n° 1 accompli/ }))) && (await vis(page.getByText('Un nouveau cycle commence'))) && (await vis(page.getByText(/Récompense : Élan LIFE I/))))
  await shot('rpg-prestige-celebration-mobile', false)
  const pre = await idbAll('prestiges'); const rw = await idbAll('rpgRewards'); const evAfter = await idbAll('xpEvents')
  check('Prestige enregistré avec numéro, niveau/rang avant, récompense, bonus et paramètres du nouveau cycle', pre.length === 1 && pre[0].id === 'prestige:LIFE:1' && pre[0].levelBefore === 36 && pre[0].rankBefore === 'SSS' && pre[0].rewardId === 'xp-life-1' && pre[0].bonusGainedPct === 5 && pre[0].nextXpScale === 1.2 && pre[0].nextXpToMax > need, JSON.stringify(pre[0]).slice(0, 160))
  check('Récompense enregistrée une seule fois', rw.length === 1 && rw[0].id === 'xp-life-1' && rw[0].prestigeId === 'prestige:LIFE:1')
  check('Journal d’XP strictement inchangé par le prestige', evAfter.length === countBefore && evAfter.reduce((n, e) => n + e.amount, 0) === sumBefore)
  await page.getByRole('button', { name: 'Continuer' }).click(); await page.waitForTimeout(800)
  check('Retour à l’espace prestige : historique LIFE détaillé, SPORT vide', (await vis(page.getByText(/Prestige n° 1 ·/))) && (await vis(page.getByText(/Récompense : Élan LIFE I · bonus \+5 % d’XP LIFE/))) && (await vis(page.getByText(/XP requise ×1.2/))) && (await vis(page.getByText('Aucun prestige SPORT pour l’instant'))))
  await shot('rpg-prestige-history-mobile')

  // ── 4. Conséquences : seul LIFE repart ─────────────────────────────────────────────────────────
  await go('/rpg')
  const txt = (await page.locator('main').innerText()).replace(/ | /g, ' ')
  check('LIFE repart (niveau 1, rang E, cycle 2, prestige ×1) ; XP globale et historique conservés', /LIFE[\s\S]*Niveau 1 · rang E[\s\S]*cycle 2 \(prestige ×1\)/.test(txt))
  check('SPORT inchangé (cycle 1, aucun prestige)', !/SPORT[\s\S]{0,80}cycle 2/.test(txt) && /SPORT ×0/.test(txt))
  const totalTxt = txt.match(/Total ([\d ]+) XP/)
  check('Niveau global et XP totale inchangés par le prestige', !!totalTxt && Number(totalTxt[1].replace(/ /g, '')) === sumBefore, `${totalTxt?.[1]} vs ${sumBefore}`)
  await go('/rpg/attributs')
  check('Attributs conservés après prestige (valeurs non nulles)', (await page.locator('[class*="attr"] .num').allTextContents()).some((v) => Number(v) > 0))
  await go('/rpg/prestige/LIFE')
  check('Prestige LIFE n° 2 indisponible juste après (nouveau cycle)', (await vis(page.getByText(/n’est pas disponible/))))
  await go('/')
  check('Accueil : prestige ×1 affiché pour LIFE, plus d’alerte de prestige', (await vis(page.getByText(/prestige ×1/))) && !(await vis(page.getByText('Prestige LIFE disponible'))))

  // ── 5. Récompenses, succès, titres ─────────────────────────────────────────────────────────────
  await go('/rpg/recompenses')
  check('Récompenses : bonus permanent +5 % LIFE (SPORT +0 %), date d’obtention, prestige d’origine', (await vis(page.getByText('+5 %'))) && (await vis(page.getByText('+0 %'))) && (await vis(page.getByText(/Élan LIFE I/))) && (await vis(page.getByText(/prestige LIFE n° 1/))))
  check('Bonus : à partir du lendemain, uniquement LIFE, jamais rétroactif', await vis(page.getByText(/à partir du lendemain de l’obtention/)))
  await shot('rpg-rewards-mobile')
  await go('/rpg/distinctions')
  check('Succès : débloqués avec date (Premier pas, Renaissance), autres verrouillés', (await vis(page.getByRole('listitem', { name: /Premier pas : débloqué/ }))) && (await vis(page.getByRole('listitem', { name: /Renaissance : débloqué/ }))) && (await vis(page.getByRole('listitem', { name: /Cent séances : verrouillé/ }))) && (await vis(page.getByText(/Obtenu le/))))
  const nUnlocked = await page.getByRole('listitem', { name: /: débloqué/ }).count()
  await page.waitForTimeout(2500)
  check('Succès : jamais débloqués deux fois (rechargement des données)', (await page.getByRole('listitem', { name: /: débloqué/ }).count()) === nUnlocked && new Set((await idbAll('achievements')).map((a) => a.id)).size === (await idbAll('achievements')).length)
  check('Premier prestige : succès, rareté et titre associé', (await vis(page.getByText(/titre « Renaissant »/))))
  await page.getByRole('button', { name: 'Afficher' }).first().click(); await page.waitForTimeout(500)
  check('Titre équipé, affiché sur l’accueil', await (async () => { await go('/'); return vis(page.getByText('Renaissant')) })())
  await go('/rpg/distinctions'); await shot('rpg-distinctions-mobile')
  await go('/profile')
  check('Profil : distinctions (titre, succès, prestiges, récompenses) et historique accessibles', (await vis(page.getByText(/LIFE ×1 · SPORT ×0/))) && (await vis(page.getByRole('link', { name: 'Historique des prestiges' }))))
  await page.getByRole('button', { name: 'Vérifier la cohérence du RPG' }).click(); await page.waitForTimeout(500)
  check('Cohérence RPG : tout est cohérent avec un prestige, une récompense et des succès', (await vis(page.getByText('Tout est cohérent'))) && (await page.locator('li', { hasText: '✗' }).count()) === 0)

  // ── 6. Bilans ──────────────────────────────────────────────────────────────────────────────────
  await go('/bilans'); await page.getByRole('radio', { name: 'Semaine' }).click(); await page.waitForTimeout(600)
  check('Bilan hebdomadaire : prestige, succès et récompense du RPG', (await vis(page.getByRole('heading', { name: 'Distinctions et prestiges' }))) && (await vis(page.getByText(/Prestige LIFE n° 1 accompli/))) && (await vis(page.getByText(/Succès débloqué :/))))
  await shot('rpg-report-week-mobile')
  await page.getByRole('radio', { name: 'Mois' }).click(); await page.waitForTimeout(500)
  check('Bilan mensuel : évolution des niveaux par domaine avec cycle', await vis(page.getByText(/cycle 2/)))

  // ── 7. Sauvegardes et hors ligne ───────────────────────────────────────────────────────────────
  await go('/backups')
  check('Sauvegardes : page opérationnelle (tables RPG couvertes par les tests de format et de restauration)', await vis(page.getByRole('heading', { name: /Sauvegardes/ })))
  await go('/rpg/distinctions'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(1500)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(1200)
  check('Hors ligne : distinctions et titre équipé disponibles', await vis(page.getByRole('listitem', { name: /Renaissance : débloqué/ })))
  await go('/rpg/prestige'); check('Hors ligne : historique des prestiges disponible', await vis(page.getByText(/Prestige n° 1 ·/)))
  await ctx.setOffline(false)

  // ── 8. Bureau ──────────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 })
  await go('/rpg'); await shot('rpg-progress-desktop')
  await go('/rpg/prestige'); await shot('rpg-prestige-desktop')
  await go('/'); await shot('rpg-home-desktop')
  const real = errors.filter((e) => !/favicon|Failed to load resource|net::ERR/.test(e))
  check('Aucune erreur JavaScript', real.length === 0, real.slice(0, 3).join(' | '))
  await browser.close()
  const ok = results.filter(Boolean).length
  console.log(`\n${ok}/${results.length} contrôles réussis`)
  process.exit(ok === results.length ? 0 : 1)
})()
