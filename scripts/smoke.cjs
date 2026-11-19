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
  const go = async (label) => { await page.locator('nav >> a', { hasText: label }).last().click(); await page.waitForTimeout(700) }
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
  const rpgXp = async () => { await go('RPG'); return (await page.locator('p', { hasText: /Total .* XP/ }).first().textContent()).replace(/\s| | /g, '') }

  // ── Accueil vide (données réelles, démo masquée par défaut)
  await page.goto(BASE); await page.waitForSelector('h1'); await page.waitForTimeout(800)
  check('Accueil réel : état vide invitant à créer une quête', await page.getByText("Aucune quête pour l'instant").isVisible())
  check('Pas de débordement horizontal (mobile)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await shot('home-empty-mobile')

  // ── LIFE : création d'une quête composée
  await go('LIFE')
  check('LIFE : état vide', await page.getByText("Aucune quête pour l'instant").isVisible())
  await shot('life-empty-mobile')
  await page.getByRole('button', { name: 'Créer ma première quête' }).click(); await page.waitForTimeout(400)
  await page.fill('#q-title', 'Rédiger le rapport client')
  await page.fill('#q-desc', 'Version finale à envoyer avant vendredi.')
  await page.getByRole('radio', { name: 'Difficile' }).click()
  await page.getByRole('radio', { name: '1 h' }).click()
  for (let i = 1; i <= 3; i++) { await page.getByRole('button', { name: '+ Ajouter une étape' }).click(); await page.getByLabel(`Étape ${i}`, { exact: true }).fill(['Plan détaillé', 'Rédaction', 'Relecture'][i - 1]) }
  await page.waitForTimeout(300); await shot('life-form-mobile')
  await page.getByRole('button', { name: 'Créer la quête' }).click(); await page.waitForTimeout(600)
  check('Quête créée et visible', await page.getByText('Rédiger le rapport client').first().isVisible())

  // ── Étapes : valider, corriger (avec confirmation), revalider
  await page.locator('button[aria-expanded]').first().click()
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
  await page.getByRole('tab', { name: 'Récompenses' }).click(); await page.waitForTimeout(500)
  check('Journal : correction visible et justifiée', (await page.getByText('Corrigé', { exact: true }).count()) > 0 && (await page.getByText(/Correction manuelle/).count()) > 0)
  await shot('life-rewards-mobile')

  // ── Catégories
  await page.getByRole('tab', { name: 'Catégories' }).click(); await page.waitForTimeout(400)
  check('7 catégories initiales', (await page.locator('li', { hasText: /Hygiène de vie|Professionnel|Social & relations|Projets personnels|Économie & finances|Culture & connaissances|Développement personnel/ }).count()) >= 7)
  await page.getByRole('button', { name: '+ Ajouter' }).click(); await page.fill('#c-name', 'Bricolage'); await page.getByRole('button', { name: 'Enregistrer' }).click(); await page.waitForTimeout(500)
  check('Catégorie personnalisée ajoutée', await page.getByText('Bricolage').first().isVisible())
  await shot('life-categories-mobile')

  // ── Suppression avec confirmation (XP retirée)
  await page.getByRole('tab', { name: 'Quêtes' }).click(); await page.waitForTimeout(300)
  await page.locator('button[aria-expanded]').first().click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Supprimer' }).click(); await page.waitForTimeout(400)
  check('Suppression demande confirmation', await page.getByRole('heading', { name: 'Supprimer la quête ?' }).isVisible())
  await shot('life-delete-confirm-mobile')
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click(); await page.waitForTimeout(600)
  check('Quête supprimée', (await page.getByText('Rédiger le rapport client').count()) === 0 || !(await page.getByRole('article').count()))
  const xpAfterDelete = await rpgXp()
  check('XP retirée après suppression', /Total0XP/.test(xpAfterDelete), xpAfterDelete)

  // ── Quête simple depuis l'accueil
  await go('LIFE'); await page.getByRole('button', { name: 'Créer une quête' }).click(); await page.waitForTimeout(300)
  await page.fill('#q-title', 'Appeler le notaire'); await page.getByRole('button', { name: 'Créer la quête' }).click(); await page.waitForTimeout(500)
  await go('Accueil')
  await page.getByRole('button', { name: 'Valider Appeler le notaire' }).click(); await page.waitForTimeout(600)
  check('Quête simple validée depuis l’accueil', await page.getByText('Tout est accompli').isVisible())
  await shot('home-real-mobile')

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
