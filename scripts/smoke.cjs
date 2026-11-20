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
  const tab = async (name) => { const re = name instanceof RegExp ? name : new RegExp('^' + name + '$'); const t = page.getByRole('tab', { name: re }); if (await t.first().isVisible().catch(() => false)) { await t.first().click(); return } await page.locator('[role=tab][aria-haspopup]').first().click(); await page.getByRole('button', { name: re }).first().click() }
  const go = async (label) => { await page.locator('nav >> a', { hasText: label === 'RPG' ? 'Progression' : label }).last().click(); await page.waitForTimeout(700) }
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
  const rpgXp = async () => { await go('RPG'); return (await page.locator('p', { hasText: /Total .* XP/ }).first().textContent()).replace(/\s| | /g, '') }

  // ── Accueil vide (données réelles, démo masquée par défaut)
  await page.goto(BASE); await page.waitForSelector('h1'); await page.waitForTimeout(800)
  check('Accueil réel : état vide guidant vers des quêtes prêtes à l’emploi', (await page.getByText('Commence par ajouter quelques activités à ton quotidien').isVisible()) && (await page.getByRole('link', { name: 'Choisir des quêtes' }).isVisible()))
  check('Pas de débordement horizontal (mobile)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await shot('home-empty-mobile')

  // ── LIFE : création d'une quête composée
  await go('LIFE')
  check('LIFE : état vide avec trois chemins (quêtes prédéfinies, pack, quête personnelle)', (await page.getByText('Commence par ajouter quelques activités à ton quotidien').isVisible()) && (await page.getByRole('button', { name: 'Choisir des quêtes prédéfinies' }).isVisible()) && (await page.getByRole('button', { name: 'Charger un pack de démarrage' }).isVisible()))
  await shot('life-empty-mobile')
  await page.getByRole('button', { name: 'Créer une quête personnelle' }).click(); await page.waitForTimeout(400)
  await page.fill('#q-title', 'Rédiger le rapport client')
  await page.fill('#q-desc', 'Version finale à envoyer avant vendredi.')
  await page.getByRole('radio', { name: 'Difficile' }).click()
  await page.getByRole('radio', { name: '1 h' }).click()
  for (let i = 1; i <= 3; i++) { await page.getByRole('button', { name: '+ Ajouter une étape' }).click(); await page.getByLabel(`Étape ${i}`, { exact: true }).fill(['Plan détaillé', 'Rédaction', 'Relecture'][i - 1]) }
  await page.waitForTimeout(300); await shot('life-form-mobile')
  await page.getByRole('button', { name: 'Créer la quête' }).click(); await page.waitForTimeout(600)
  check('Quête créée et visible', await page.getByText('Rédiger le rapport client').first().isVisible())

  // ── Étapes : valider, corriger (avec confirmation), revalider
  await page.locator('article button[aria-expanded]').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Plan détaillé/ }).click(); await page.waitForTimeout(300)
  check('Étape validée → progression 1/3', await page.getByText('1/3').first().isVisible())
  await shot('life-quest-open-mobile')
  await page.getByRole('button', { name: /Plan détaillé/ }).click(); await page.waitForTimeout(400)
  check('Correction demande confirmation', await page.getByRole('heading', { name: 'Corriger la validation ?' }).isVisible())
  await page.getByRole('button', { name: 'Annuler' }).click(); await page.waitForTimeout(300)
  check('Annuler la correction conserve la validation', await page.getByText('1/3').first().isVisible())
  await page.getByRole('button', { name: /Plan détaillé/ }).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Corriger', exact: true }).click(); await page.waitForTimeout(400)
  check('Correction explicite → 0/3', await page.getByText('0/3').first().isVisible())

  // ── Validation complète + niveau atteint
  await page.getByRole('button', { name: /Valider toutes les étapes/ }).click(); await page.waitForTimeout(600)
  check('Quête composée entièrement validée', await page.getByRole('button', { name: /Corriger la validation de/ }).first().isVisible())
  check('Annonce de niveau (or lumineux)', await page.locator('[role=status]', { hasText: /LEVEL UP/ }).isVisible())
  await page.screenshot({ path: `${OUT}/life-levelup-mobile.png` })
  await page.waitForTimeout(500)
  const xpDone = await rpgXp()
  check('RPG : XP totale recalculée depuis le journal', /Total[1-9]/.test(xpDone), xpDone)
  await shot('rpg-real-mobile')

  // ── Persistance après rechargement
  await go('LIFE'); await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(700)
  check('Validation conservée après rechargement', await page.getByRole('button', { name: /Corriger la validation de/ }).first().isVisible())

  // ── Journal des récompenses (avec correction tracée)
  await tab('Gains'); await page.waitForTimeout(500)
  check('Journal : correction visible et justifiée', (await page.getByText('Corrigé', { exact: true }).count()) > 0 && (await page.getByText(/Correction manuelle/).count()) > 0)
  await shot('life-rewards-mobile')

  // ── Catégories
  await tab('Catégories'); await page.waitForTimeout(400)
  check('7 catégories initiales', (await page.locator('li', { hasText: /Hygiène de vie|Professionnel|Social & relations|Projets personnels|Économie & finances|Culture & connaissances|Développement personnel/ }).count()) >= 7)
  await page.getByRole('button', { name: '+ Ajouter' }).click(); await page.fill('#c-name', 'Bricolage'); await page.getByRole('button', { name: 'Enregistrer' }).click(); await page.waitForTimeout(500)
  check('Catégorie personnalisée ajoutée', await page.getByText('Bricolage').first().isVisible())
  await shot('life-categories-mobile')

  // ── Suppression avec confirmation (XP retirée)
  await tab('Quêtes'); await page.waitForTimeout(300)
  await page.locator('article button[aria-expanded]').first().click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Supprimer' }).click(); await page.waitForTimeout(400)
  check('Suppression demande confirmation', await page.getByRole('heading', { name: 'Supprimer la quête ?' }).isVisible())
  await shot('life-delete-confirm-mobile')
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click(); await page.waitForTimeout(600)
  check('Quête supprimée', (await page.getByText('Rédiger le rapport client').count()) === 0 || !(await page.getByRole('article').count()))
  const xpAfterDelete = await rpgXp()
  check('XP retirée après suppression', /Total0XP/.test(xpAfterDelete), xpAfterDelete)

  // ── Quête simple depuis l'accueil
  await go('LIFE'); await page.getByRole('button', { name: 'Créer une quête', exact: true }).click(); await page.waitForTimeout(300)
  await page.fill('#q-title', 'Appeler le notaire'); await page.getByRole('button', { name: 'Créer la quête' }).click(); await page.waitForTimeout(500)
  await go('Accueil')
  await page.getByRole('button', { name: 'Valider Appeler le notaire' }).click(); await page.waitForTimeout(600)
  check('Quête simple validée depuis l’accueil', await page.getByText('Tout est accompli').isVisible())
  await shot('home-real-mobile')


  // ── v0.3 : trois situations, rétroactif, bilan, révisions
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
  const daysAhead = (n) => daysAgo(-n)
  const createQuest = async (title, o = {}) => {
    await go('LIFE'); await tab('Quêtes'); await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Créer une quête', exact: true }).click(); await page.waitForTimeout(350)
    await page.fill('#q-title', title)
    if (o.type) await page.getByRole('radio', { name: o.type, exact: true }).click()
    if (o.difficulty) await page.getByRole('radio', { name: o.difficulty }).click()
    if (o.effort) await page.getByRole('radio', { name: o.effort }).click()
    if (o.due) await page.fill('#q-due', o.due)
    await page.getByRole('button', { name: 'Créer la quête' }).click(); await page.waitForTimeout(500)
  }
  const card = (title) => page.getByRole('article').filter({ hasText: title })
  const expandCard = async (title) => {
    const b = card(title).locator('button[aria-expanded]').first()
    if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await page.waitForTimeout(250) }
  }
  const openWork = async (title) => {
    await expandCard(title)
    await card(title).getByRole('button', { name: 'Enregistrer mon travail' }).click(); await page.waitForTimeout(400)
  }

  // Progression partielle (proportionnelle)
  await createQuest('Préparer la présentation', { difficulty: 'Difficile', effort: '1 h' })
  await openWork('Préparer la présentation')
  check('Feuille « Enregistrer mon travail » : 3 situations', (await page.getByRole('radio', { name: /Réussite complète|Progression partielle|Effort sans objectif atteint/ }).count()) === 3)
  await page.getByRole('radio', { name: /Progression partielle/ }).click()
  await page.getByRole('radio', { name: '50 %' }).click()
  await page.fill('#w-dur', '45'); await page.fill('#w-note', 'Plan et première moitié des slides'); await page.waitForTimeout(300)
  check('Aperçu proportionnel (+50 XP)', await page.getByText('+50 XP').first().isVisible())
  await page.screenshot({ path: `${OUT}/work-partial-mobile.png` })
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(500)
  check('Confirmation de l’enregistrement', await page.getByRole('heading', { name: 'Enregistré' }).isVisible())
  await page.screenshot({ path: `${OUT}/work-saved-mobile.png` })
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(400)
  check('Quête à 50 % de progression', await card('Préparer la présentation').getByText('50 %').first().isVisible())
  // garde-fou : progression sans avancée refusée
  await openWork('Préparer la présentation')
  await page.getByRole('radio', { name: /Progression partielle/ }).click(); await page.fill('input[aria-label="Part du travail en pourcentage"]', '50'); await page.waitForTimeout(300)
  check('Garde-fou : même progression refusée', await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled())
  await page.getByRole('button', { name: 'Annuler' }).click(); await page.waitForTimeout(300)

  // Effort sans objectif atteint
  await createQuest('Réviser le contrat', { difficulty: 'Difficile', effort: '1 h' })
  await openWork('Réviser le contrat')
  await page.getByRole('radio', { name: /Effort sans objectif atteint/ }).click(); await page.fill('#w-dur', '30'); await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/work-effort-mobile.png` })
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(500)
  check('Effort enregistré (XP réduite, non nulle)', /\+[1-9]\d* XP/.test(await page.locator('[role=status]', { hasText: 'Enregistré' }).textContent()))
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(300)

  // Validation rétroactive
  await createQuest('Marcher 20 minutes', { type: 'Quotidienne', difficulty: 'Facile', effort: '30 min' })
  await openWork('Marcher 20 minutes')
  await page.fill('#w-date', daysAgo(2)); await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/work-retro-mobile.png` })
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(500)
  check('Validation rétroactive confirmée', await page.getByText(/Validation rétroactive/).first().isVisible())
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(300)
  await tab('Gains'); await page.waitForTimeout(400)
  check('Journal : badge Rétroactif et dates conservées', (await page.getByText('Rétroactif', { exact: true }).count()) > 0 && (await page.getByText(/réalisé le .*enregistré le/).count()) > 0)
  await page.screenshot({ path: `${OUT}/rewards-v3-mobile.png`, fullPage: true })

  // Annuler un gain depuis le journal (correction tracée)
  await page.getByRole('button', { name: /Annuler le gain « Marcher 20 minutes/ }).click(); await page.waitForTimeout(350)
  check('Annulation d’un gain demande confirmation', await page.getByRole('heading', { name: 'Annuler ce gain ?' }).isVisible())
  await page.getByRole('button', { name: 'Annuler le gain', exact: true }).click(); await page.waitForTimeout(500)
  check('Gain annulé → mention Corrigé', (await page.getByText('Corrigé', { exact: true }).count()) > 0)

  // Bilan des quêtes manquées
  await createQuest('Envoyer la facture', { effort: '15 min', due: daysAgo(1) })
  await tab(/Bilan/); await page.waitForTimeout(500)
  check('Bilan : échéance dépassée à analyser', await page.getByText('Envoyer la facture').first().isVisible())
  check('Bilan : pastille de comptage', (await page.locator('[aria-label$="à analyser"]').count()) > 0)
  await page.screenshot({ path: `${OUT}/bilan-mobile.png`, fullPage: true })
  const xpBefore = await rpgXp()
  await go('LIFE'); await tab(/Bilan/); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Analyser' }).first().click(); await page.waitForTimeout(400)
  await page.getByRole('radio', { name: 'Manque de temps' }).click()
  await page.getByRole('radio', { name: /Reporter/ }).click(); await page.fill('#a-due', daysAhead(3)); await page.fill('#a-note', 'Semaine chargée')
  await page.screenshot({ path: `${OUT}/analysis-sheet-mobile.png` })
  await page.getByRole('button', { name: 'Enregistrer l’analyse' }).click(); await page.waitForTimeout(500)
  check('Analyse enregistrée', await page.getByRole('heading', { name: 'Analyse enregistrée' }).isVisible())
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(400)
  check('Historique des analyses conservé (cause affichée)', await page.getByText('Manque de temps').first().isVisible())
  await page.screenshot({ path: `${OUT}/bilan-after-mobile.png`, fullPage: true })
  const xpAfter = await rpgXp()
  check('Analyse : aucune pénalité d’XP', xpBefore === xpAfter, `${xpBefore} / ${xpAfter}`)

  // Modification historique tracée
  await go('LIFE'); await tab('Quêtes'); await page.waitForTimeout(300)
  await expandCard('Préparer la présentation')
  await card('Préparer la présentation').getByRole('button', { name: 'Modifier' }).click(); await page.waitForTimeout(400)
  await page.getByRole('radio', { name: 'Épique' }).click(); await page.waitForTimeout(250)
  check('Avertissement : XP acquise conservée', await page.getByText(/ils sont conservés/).isVisible())
  await page.screenshot({ path: `${OUT}/edit-warning-mobile.png` })
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(600)
  await expandCard('Préparer la présentation')
  await card('Préparer la présentation').getByText(/Historique des modifications/).click(); await page.waitForTimeout(250)
  check('Historique des modifications visible', await card('Préparer la présentation').getByText(/Difficulté :/).isVisible())
  await page.screenshot({ path: `${OUT}/revisions-mobile.png`, fullPage: true })

  // Persistance hors ligne
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(1200)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 }); await page.waitForTimeout(600)
  await createQuest('Quête créée hors ligne')
  await card('Quête créée hors ligne').getByRole('button', { name: /Valider Quête créée hors ligne/ }).click(); await page.waitForTimeout(500)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 }); await page.waitForTimeout(700)
  await go('LIFE')
  check('Hors ligne : création + validation conservées après rechargement', await card('Quête créée hors ligne').getByRole('button', { name: /Corriger la validation de/ }).isVisible())
  await ctx.setOffline(false)


  // ── v0.4 : sauvegardes chiffrées, export, restauration, récupération, dates anciennes
  const fs = require('fs')
  const tmp = process.argv[3] || OUT
  await go('Accueil')
  check('Bandeau : sauvegardes à sécuriser', await page.getByText('Sauvegardes : action recommandée').isVisible())
  await page.getByRole('link', { name: 'Profil et réglages' }).click(); await page.waitForTimeout(500)
  await page.getByRole('link', { name: 'Gérer les sauvegardes' }).click(); await page.waitForTimeout(700)
  check('Page Sauvegardes : statut honnête sans phrase secrète', await page.getByRole('heading', { name: 'Action recommandée' }).isVisible())
  check('Sauvegardes automatiques déjà présentes et vérifiées', (await page.getByText('Intégrité vérifiée').count()) > 0)
  await page.screenshot({ path: `${OUT}/backup-home-mobile.png`, fullPage: true })

  // Configuration de la phrase secrète (test réel de déchiffrement)
  await page.getByRole('button', { name: 'Définir ma phrase secrète' }).first().click(); await page.waitForTimeout(400)
  await page.fill('#sp-pass', 'court'); check('Phrase trop courte : bouton désactivé', await page.getByRole('button', { name: 'Chiffrer et tester' }).isDisabled())
  await page.fill('#sp-pass', 'ma phrase secrète 2026'); await page.fill('#sp-conf', 'ma phrase secrète 2026')
  await page.screenshot({ path: `${OUT}/backup-setup-mobile.png` })
  await page.getByRole('button', { name: 'Chiffrer et tester' }).click(); await page.waitForSelector('text=Test de déchiffrement réussi', { timeout: 15000 })
  check('Test réel : phrase secrète ET clé de secours', (await page.getByText('✓ réussi').count()) === 2)
  const recoveryKey = (await page.locator('div[aria-label="Clé de secours"] span').allTextContents()).join('-')
  check('Clé de secours affichée (8 groupes)', /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/.test(recoveryKey), recoveryKey)
  check('Terminer impossible sans accusé de conservation', await page.getByRole('button', { name: 'Terminé' }).isDisabled())
  await page.screenshot({ path: `${OUT}/backup-recovery-key-mobile.png` })
  await page.getByLabel(/J’ai conservé ma clé de secours/).check(); await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(600)
  check('Statut « Données protégées » après test', await page.getByRole('heading', { name: 'Données protégées' }).isVisible())

  // Sauvegarde manuelle + liste
  await page.getByRole('button', { name: /Sauvegarder maintenant/ }).click(); await page.waitForTimeout(900)
  check('Sauvegarde manuelle ajoutée à la liste', (await page.getByText(/^Manuelle/).count()) > 0)
  await page.screenshot({ path: `${OUT}/backup-list-mobile.png`, fullPage: true })

  // Export : mauvaise phrase refusée, bonne phrase → fichier téléchargé et vérifié
  await createQuest('Quête de test sauvegarde', { difficulty: 'Difficile', effort: '1 h' })
  await go('LIFE'); await page.getByRole('button', { name: 'Créer une quête', exact: true }).waitFor()
  await card('Quête de test sauvegarde').getByRole('button', { name: /Valider Quête de test sauvegarde/ }).click(); await page.waitForTimeout(500)
  const xpWithQuest = await rpgXp()
  await page.getByRole('link', { name: 'Profil et réglages' }).click(); await page.getByRole('link', { name: 'Gérer les sauvegardes' }).click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Exporter un fichier/ }).click(); await page.waitForTimeout(300)
  await page.fill('#ex-pass', 'mauvaise phrase du tout'); await page.getByRole('button', { name: 'Créer le fichier chiffré' }).click(); await page.waitForTimeout(1200)
  check('Export : phrase incorrecte refusée', await page.getByText('Phrase secrète incorrecte.').isVisible())
  await page.fill('#ex-pass', 'ma phrase secrète 2026'); await page.getByRole('button', { name: 'Créer le fichier chiffré' }).click(); await page.waitForSelector('text=Fichier créé et vérifié', { timeout: 15000 })
  check('Export : fichier relu et déchiffré avec la phrase', await page.getByText('Relu et déchiffré avec votre phrase').isVisible())
  await page.screenshot({ path: `${OUT}/backup-export-mobile.png` })
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Télécharger level-sauvegarde/ }).click()])
  const exported = `${tmp}/export.levelbackup`
  await dl.saveAs(exported)
  const envText = fs.readFileSync(exported, 'utf8'); const env = JSON.parse(envText)
  check('Fichier exporté : format chiffré, sans donnée en clair', env.format === 'level-backup' && env.cipher === 'AES-256-GCM' && !/Quête de test sauvegarde/.test(envText))
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click(); await page.waitForTimeout(300)

  // Erreur utilisateur : suppression de la quête
  await go('LIFE'); await card('Quête de test sauvegarde').locator('button[aria-expanded]').first().click(); await page.waitForTimeout(250)
  await card('Quête de test sauvegarde').getByRole('button', { name: 'Supprimer' }).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click(); await page.waitForTimeout(600)
  check('Quête supprimée (avant restauration)', (await page.getByText('Quête de test sauvegarde').count()) === 0)

  // Fichier corrompu puis phrase fausse puis bon fichier
  const bad = JSON.parse(envText); const c = bad.ciphertext; bad.ciphertext = c.slice(0, 40) + (c[40] === 'A' ? 'B' : 'A') + c.slice(41)
  fs.writeFileSync(`${tmp}/corrupt.levelbackup`, JSON.stringify(bad))
  fs.writeFileSync(`${tmp}/truncated.levelbackup`, envText.slice(0, 500))
  const future = { ...JSON.parse(envText), formatVersion: 99 }; fs.writeFileSync(`${tmp}/future.levelbackup`, JSON.stringify(future))
  await page.getByRole('link', { name: 'Profil et réglages' }).click(); await page.getByRole('link', { name: 'Gérer les sauvegardes' }).click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Restaurer depuis un fichier/ }).click(); await page.waitForTimeout(300)
  const tryFile = async (file, secret = 'ma phrase secrète 2026') => {
    await page.setInputFiles('#rf-file', file)
    await page.getByLabel('Phrase secrète', { exact: true }).fill(secret)
    await page.getByRole('button', { name: 'Analyser la sauvegarde' }).click(); await page.waitForTimeout(1500)
  }
  await tryFile(`${tmp}/corrupt.levelbackup`)
  check('Fichier corrompu : refusé (altération détectée)', await page.getByRole('alert').filter({ hasText: /altér|Déchiffrement impossible|corrompu/i }).isVisible())
  await page.screenshot({ path: `${OUT}/backup-corrupt-mobile.png` })
  await tryFile(`${tmp}/truncated.levelbackup`)
  check('Fichier tronqué : refusé', await page.getByRole('alert').filter({ hasText: /tronqué|illisible|JSON/i }).isVisible())
  await tryFile(`${tmp}/future.levelbackup`)
  check('Version de format incompatible : refusée', await page.getByRole('alert').filter({ hasText: /plus récente/ }).isVisible())
  await tryFile(exported, 'une autre phrase secrète')
  check('Mauvaise phrase : refusée', await page.getByRole('alert').filter({ hasText: 'Phrase secrète incorrecte.' }).isVisible())
  await page.getByText('Aucune donnée', { exact: false }).count()
  await tryFile(exported)
  check('Revue avant restauration : comparaison sauvegarde / données actuelles', await page.getByRole('columnheader', { name: 'Données actuelles' }).isVisible())
  check('Remplacement impossible sans confirmation explicite', await page.getByRole('button', { name: 'Remplacer mes données' }).isDisabled())
  await page.screenshot({ path: `${OUT}/backup-restore-review-mobile.png`, fullPage: true })
  await page.getByLabel(/Je comprends que mes données actuelles/).check()
  await page.getByRole('button', { name: 'Remplacer mes données' }).click(); await page.waitForSelector('text=Restauration terminée et vérifiée', { timeout: 15000 })
  check('Vérification après restauration : tous les contrôles conformes', (await page.getByText('✓ conforme').count()) === 4 && (await page.getByText('✗ écart').count()) === 0)
  await page.screenshot({ path: `${OUT}/backup-restore-done-mobile.png` })
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(500)
  await go('LIFE')
  check('Quête supprimée retrouvée après restauration', await page.getByText('Quête de test sauvegarde').first().isVisible())
  const xpRestored = await rpgXp()
  check('XP identique après restauration', xpRestored === xpWithQuest, `${xpRestored} / ${xpWithQuest}`)

  // Sauvegarde de sécurité « Avant restauration » : retour arrière possible
  await page.getByRole('link', { name: 'Profil et réglages' }).click(); await page.getByRole('link', { name: 'Gérer les sauvegardes' }).click(); await page.waitForTimeout(600)
  check('Sauvegarde « Avant restauration » créée', (await page.getByText(/^Avant restauration/).count()) > 0)

  // Test de récupération avec la clé de secours
  await page.getByText('Tester la récupération').click(); await page.waitForTimeout(250)
  await page.getByRole('radio', { name: 'Clé de secours' }).first().click()
  await page.fill('#rt-secret', recoveryKey.toLowerCase())
  await page.getByRole('button', { name: 'Tester maintenant' }).click(); await page.waitForTimeout(1500)
  check('Test de récupération réel avec la clé de secours', await page.getByText(/Déchiffrement réussi avec la clé de secours/).isVisible())
  await page.screenshot({ path: `${OUT}/backup-recovery-test-mobile.png`, fullPage: true })

  // Hors ligne : sauvegarde + restauration locale sans réseau
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 }); await page.waitForTimeout(700)
  const before = await page.getByText('Intégrité vérifiée').count() + await page.getByText('Récupération testée').count()
  await page.getByRole('button', { name: /Sauvegarder maintenant/ }).click(); await page.waitForTimeout(1200)
  const after = await page.getByText('Intégrité vérifiée').count() + await page.getByText('Récupération testée').count()
  check('Hors ligne : sauvegarde chiffrée créée et vérifiée', after > before, `${before} → ${after}`)
  await page.getByRole('button', { name: 'Restaurer', exact: true }).first().click(); await page.waitForSelector('text=Sauvegarde déchiffrée et vérifiée', { timeout: 15000 })
  check('Hors ligne : restauration locale analysée', await page.getByRole('columnheader', { name: 'Cette sauvegarde' }).isVisible())
  await page.getByRole('button', { name: 'Annuler' }).click(); await page.waitForTimeout(300)
  await ctx.setOffline(false)

  // Validation rétroactive à une date ancienne : confirmation exigée
  await go('LIFE')
  await expandCard('Marcher 20 minutes')
  await card('Marcher 20 minutes').getByRole('button', { name: 'Enregistrer mon travail' }).click(); await page.waitForTimeout(400)
  await page.fill('#w-date', daysAgo(75)); await page.waitForTimeout(300)
  check('Date ancienne : case de confirmation affichée', await page.getByLabel(/Je confirme que ce travail a bien été réalisé/).isVisible())
  check('Date ancienne : enregistrement bloqué sans confirmation', await page.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled())
  await page.screenshot({ path: `${OUT}/work-old-date-mobile.png` })
  await page.getByLabel(/Je confirme que ce travail a bien été réalisé/).check()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await page.waitForTimeout(600)
  check('Validation à 75 jours enregistrée (rétroactive)', await page.getByText(/Validation rétroactive/).first().isVisible())
  await page.getByRole('button', { name: 'Terminé' }).click(); await page.waitForTimeout(300)

  // ── Données de démonstration (séparées des données réelles)
  await page.getByRole('link', { name: 'Profil et réglages' }).click()
  await page.getByRole('switch', { name: 'Données de démonstration' }).click(); await page.waitForTimeout(300)
  await go('Accueil')
  check('Démo activée → étiquette Démo', (await page.getByText('Démo', { exact: true }).count()) > 0)
  await page.getByRole('link', { name: 'Profil et réglages' }).click()
  await page.getByRole('switch', { name: 'Données de démonstration' }).click(); await page.waitForTimeout(300)

  // ── Hors ligne
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1000)
  await page.reload(); await page.waitForTimeout(800)
  await ctx.setOffline(true)
  await page.reload(); await page.waitForSelector('h1', { timeout: 8000 })
  check('Rechargement hors ligne fonctionnel', (await page.locator('h1').count()) > 0)
  await ctx.setOffline(false)

  // ── Desktop
  const d = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await d.goto(BASE + '#/life'); await d.waitForSelector('h1'); await d.waitForTimeout(800)
  check('Menu latéral visible (desktop)', await d.locator('aside').isVisible())
  check('Bouton « Nouvelle quête » desktop', await d.getByRole('button', { name: '+ Nouvelle quête' }).isVisible())
  await d.screenshot({ path: `${OUT}/life-desktop.png`, fullPage: true })
  await d.goto(BASE + '#/'); await d.waitForTimeout(800); await d.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true })

  check('Aucune erreur console / page', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(`\n${results.filter(Boolean).length}/${results.length} contrôles réussis`)
  process.exit(results.every(Boolean) ? 0 : 1)
})()
