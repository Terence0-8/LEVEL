import type { Difficulty, QuestType } from '../quest'
import type { QuestPack, QuestTemplate } from './types'

/** Version du catalogue intégré (informative : chaque modèle porte sa propre version). */
export const LIFE_CATALOG_VERSION = 1

const C = { pro: 'cat-pro', cul: 'cat-culture', fin: 'cat-finances', dev: 'cat-perso', soc: 'cat-social', prj: 'cat-projets', hyg: 'cat-hygiene' } as const
type Cat = keyof typeof C
const t = (cat: Cat, key: string, name: string, description: string, type: QuestType, minutes: number, difficulty: Difficulty, tags: string[], o: Partial<QuestTemplate> = {}): QuestTemplate =>
  ({ id: `life.${cat}.${key}`, v: 1, name, description, categoryId: C[cat], type, minutes, difficulty, tags, ...o })

/**
 * Catalogue de départ : à enrichir. Aucune quête n'est imposée ; les durées sont modestes (une quête tenable vaut mieux qu'une quête ambitieuse
 * abandonnée) et les récompenses sont calculées par le moteur XP, pas décidées ici.
 */
export const QUEST_TEMPLATES: QuestTemplate[] = [
  // Professionnel
  t('pro', 'focus-block', 'Consacrer du temps à une tâche importante', 'Un bloc de travail sans interruption sur ce qui compte le plus aujourd’hui.', 'daily', 30, 'normal', ['concentration', 'priorité']),
  t('pro', 'dossier', 'Avancer sur un dossier', 'Faire progresser un dossier en cours : une étape concrète, pas le dossier entier.', 'personal', 60, 'normal', ['dossier'], { priority: 'high' }),
  t('pro', 'veille', 'Effectuer une veille professionnelle', 'Parcourir vos sources habituelles et noter une chose utile.', 'weekly', 30, 'easy', ['veille', 'apprentissage']),
  t('pro', 'competence', 'Développer une compétence', 'Un exercice ou une lecture ciblée sur une compétence que vous voulez gagner.', 'weekly', 45, 'normal', ['compétence']),
  t('pro', 'priorites', 'Faire le point sur ses priorités', 'Relire vos tâches, choisir les trois qui comptent et repousser le reste.', 'weekly', 20, 'easy', ['organisation', 'priorité']),
  t('pro', 'boite-mail', 'Vider sa boîte de réception', 'Traiter, classer ou supprimer : objectif boîte propre, pas boîte vide à tout prix.', 'weekly', 25, 'easy', ['organisation']),
  t('pro', 'presentation', 'Préparer une présentation importante', 'Plan, contenu, répétition : trois étapes pour arriver prêt.', 'personal', 120, 'hard', ['préparation'], { steps: ['Définir le message principal', 'Rédiger le support', 'Répéter à voix haute'] }),
  t('pro', 'bilan-annuel', 'Bilan de carrière', 'Prendre du recul sur votre parcours et fixer une direction pour l’année.', 'exceptional', 90, 'hard', ['bilan', 'long terme']),

  // Culture & connaissances
  t('cul', 'lecture', 'Lire pendant 20 minutes', 'Un livre papier ou numérique, sans écran de notifications.', 'daily', 20, 'easy', ['lecture']),
  t('cul', 'etude', 'Étudier un sujet pendant 30 minutes', 'Un sujet à la fois, avec un objectif simple pour la séance.', 'daily', 30, 'normal', ['étude']),
  t('cul', 'ecoute', 'Écouter un contenu éducatif', 'Podcast, conférence ou documentaire : en marchant, en cuisinant ou en trajet.', 'weekly', 40, 'easy', ['audio']),
  t('cul', 'notes', 'Prendre des notes sur un apprentissage', 'Résumer en quelques lignes ce que vous avez retenu.', 'weekly', 20, 'easy', ['notes', 'mémoire']),
  t('cul', 'approfondir', 'Approfondir un sujet découvert récemment', 'Retourner sur un sujet qui vous a marqué pour aller un cran plus loin.', 'personal', 45, 'normal', ['curiosité']),
  t('cul', 'langue', 'Pratiquer une langue étrangère', 'Quelques exercices ou une conversation courte, régulièrement.', 'daily', 15, 'easy', ['langue']),
  t('cul', 'livre', 'Terminer un livre', 'Un livre, découpé en objectifs de lecture réalistes.', 'personal', 240, 'normal', ['lecture', 'progression'], { steps: ['Lire le premier tiers', 'Lire le deuxième tiers', 'Terminer et noter l’essentiel'] }),
  t('cul', 'visite', 'Visiter un lieu culturel', 'Musée, exposition, bibliothèque ou monument que vous n’avez jamais vu.', 'exceptional', 120, 'normal', ['sortie']),

  // Économie & finances
  t('fin', 'depenses', 'Faire le point sur ses dépenses', 'Passer en revue les dépenses de la semaine : rien à juger, juste voir.', 'weekly', 20, 'easy', ['budget']),
  t('fin', 'budget', 'Mettre à jour son budget', 'Actualiser les montants et ajuster une catégorie si besoin.', 'weekly', 30, 'normal', ['budget']),
  t('fin', 'epargne', 'Vérifier son épargne', 'Consulter les soldes et comparer à votre objectif.', 'weekly', 10, 'easy', ['épargne']),
  t('fin', 'achat', 'Comparer une dépense importante avant achat', 'Trois offres, un tableau simple, une décision après une nuit de réflexion.', 'personal', 40, 'normal', ['achat']),
  t('fin', 'abonnements', 'Faire le tri dans ses abonnements', 'Lister, garder l’utile, résilier le reste.', 'personal', 45, 'normal', ['abonnements']),
  t('fin', 'documents', 'Classer ses documents administratifs', 'Ranger factures, contrats et papiers importants au même endroit.', 'personal', 60, 'normal', ['administratif']),
  t('fin', 'fonds', 'Constituer un fonds de sécurité', 'Avancer vers trois mois de charges mises de côté.', 'personal', 30, 'hard', ['épargne', 'progression'], { goalHint: 'Épargner trois mois de charges', steps: ['Calculer le montant visé', 'Programmer un virement mensuel', 'Atteindre la moitié du montant'] }),
  t('fin', 'revue-annuelle', 'Revue financière annuelle', 'Faire le bilan de l’année et fixer un cap pour la suivante.', 'exceptional', 90, 'hard', ['bilan']),

  // Développement personnel
  t('dev', 'reflexion', 'Faire une séance de réflexion personnelle', 'Un moment calme avec un carnet : où j’en suis, ce que je veux.', 'weekly', 25, 'easy', ['réflexion']),
  t('dev', 'competence', 'Travailler une compétence', 'Pratiquer volontairement quelque chose que vous voulez mieux maîtriser.', 'weekly', 30, 'normal', ['pratique']),
  t('dev', 'recul', 'Prendre du recul sur ses objectifs', 'Relire vos objectifs : qu’est-ce qui compte toujours, qu’est-ce qui a changé ?', 'weekly', 20, 'easy', ['objectifs']),
  t('dev', 'activite', 'Effectuer une activité de développement personnel', 'Méditation, écriture, atelier, exercice de gratitude : à votre choix.', 'weekly', 20, 'easy', ['bien-être']),
  t('dev', 'journal', 'Tenir un court journal', 'Trois lignes en fin de journée : ce qui s’est bien passé et ce que je retiens.', 'daily', 10, 'easy', ['écriture']),
  t('dev', 'zone-confort', 'Sortir de sa zone de confort', 'Un petit défi qui vous met un peu mal à l’aise, avec un objectif clair.', 'exceptional', 60, 'hard', ['défi']),
  t('dev', 'respiration', 'Prendre cinq minutes pour respirer', 'Une pause de respiration ou de cohérence cardiaque.', 'daily', 5, 'easy', ['calme']),
  t('dev', 'habitude', 'Mettre en place une nouvelle habitude', 'Choisir une habitude minuscule et la tenir une semaine.', 'personal', 30, 'normal', ['habitude', 'progression'], { steps: ['Choisir l’habitude et le moment', 'La tenir trois jours', 'La tenir sept jours'] }),

  // Social & relations
  t('soc', 'nouvelles', 'Prendre des nouvelles d’un proche', 'Un message ou un appel court, sans raison particulière.', 'weekly', 15, 'easy', ['proches']),
  t('soc', 'ami', 'Organiser un moment avec un ami', 'Proposer une date et un lieu, même simple.', 'weekly', 30, 'normal', ['amis']),
  t('soc', 'relation', 'Entretenir une relation importante', 'Un geste d’attention pour quelqu’un qui compte.', 'weekly', 20, 'easy', ['relations']),
  t('soc', 'activite-sociale', 'Prévoir une activité sociale', 'Une sortie, un repas ou un jeu à plusieurs dans le mois.', 'personal', 60, 'normal', ['sortie']),
  t('soc', 'remercier', 'Remercier quelqu’un', 'Dire merci pour quelque chose de précis.', 'personal', 10, 'easy', ['gratitude']),
  t('soc', 'reseau', 'Reprendre contact avec un ancien collègue', 'Un message sincère pour renouer le fil.', 'personal', 15, 'easy', ['réseau']),
  t('soc', 'repas', 'Partager un repas sans écran', 'Un repas avec quelqu’un, téléphone rangé.', 'weekly', 60, 'easy', ['famille']),
  t('soc', 'reunion', 'Organiser une rencontre de famille ou d’amis', 'Choisir la date, inviter, prévoir le programme.', 'exceptional', 120, 'normal', ['événement'], { steps: ['Fixer la date', 'Inviter', 'Préparer le lieu et le repas'] }),

  // Projets personnels
  t('prj', 'avancer', 'Avancer sur un projet personnel', 'Une session sur le projet qui vous tient à cœur.', 'weekly', 60, 'normal', ['projet']),
  t('prj', 'etape', 'Réaliser une étape importante', 'Choisir la prochaine étape clé d’un projet et la terminer.', 'personal', 90, 'hard', ['jalon']),
  t('prj', 'concentre', 'Consacrer une période de travail concentré', 'Un bloc sans interruption sur votre projet.', 'weekly', 90, 'normal', ['concentration']),
  t('prj', 'point', 'Faire un point sur l’avancement', 'Où en est le projet, qu’est-ce qui bloque, quelle est la suite ?', 'weekly', 20, 'easy', ['bilan']),
  t('prj', 'idee', 'Noter une idée de projet', 'Capturer l’idée avant qu’elle ne s’échappe.', 'personal', 10, 'easy', ['idée']),
  t('prj', 'lancer', 'Lancer un nouveau projet', 'Du flou à un premier plan d’action en trois étapes.', 'personal', 120, 'hard', ['lancement', 'progression'], { steps: ['Écrire l’objectif en une phrase', 'Lister les trois premières actions', 'Réaliser la première'] }),
  t('prj', 'ranger', 'Ranger son espace de travail', 'Un bureau dégagé aide à démarrer.', 'weekly', 20, 'easy', ['organisation']),
  t('prj', 'defi', 'Relever un défi créatif', 'Un petit projet à finir en un week-end.', 'exceptional', 180, 'hard', ['création']),

  // Hygiène de vie
  t('hyg', 'sommeil', 'Respecter une routine de sommeil', 'Se coucher à une heure raisonnable, écrans éteints.', 'daily', 20, 'normal', ['sommeil']),
  t('hyg', 'repas', 'Préparer ses repas', 'Cuisiner ou organiser les repas des prochains jours.', 'weekly', 60, 'normal', ['alimentation']),
  t('hyg', 'marche', 'Marcher quotidiennement', 'Vingt minutes de marche, à l’extérieur de préférence.', 'daily', 20, 'easy', ['marche', 'activité']),
  t('hyg', 'recuperer', 'Prendre du temps pour récupérer', 'Un vrai moment de repos : sieste, lecture, bain, silence.', 'weekly', 30, 'easy', ['repos']),
  t('hyg', 'eau', 'Boire suffisamment d’eau', 'Une bouteille d’eau à portée de main tout au long de la journée.', 'daily', 5, 'easy', ['hydratation']),
  t('hyg', 'etirements', 'Faire quelques étirements', 'Dix minutes de mobilité douce, matin ou soir.', 'daily', 10, 'easy', ['mobilité']),
  t('hyg', 'bilan-sante', 'Prendre un rendez-vous de santé', 'Médecin, dentiste, contrôle : celui que vous repoussez.', 'personal', 20, 'normal', ['santé']),
  t('hyg', 'nature', 'Passer une demi-journée dehors', 'Balade, parc ou forêt : se changer les idées.', 'exceptional', 180, 'normal', ['nature']),
]

/** Packs de démarrage : sélections cohérentes et légères (au plus trois quêtes quotidiennes par pack). Toujours facultatifs et modifiables avant l'ajout. */
export const QUEST_PACKS: QuestPack[] = [
  { id: 'pack.organisation-quotidienne', v: 1, name: 'Organisation quotidienne', description: 'Un fil rouge simple pour structurer vos journées sans les surcharger.', forWho: 'Pour démarrer avec une routine légère.',
    templateIds: ['life.pro.focus-block', 'life.hyg.marche', 'life.dev.journal', 'life.pro.priorites', 'life.prj.ranger'] },
  { id: 'pack.developpement-personnel', v: 1, name: 'Développement personnel', description: 'Prendre du recul, pratiquer et avancer sur soi à un rythme tranquille.', forWho: 'Pour prendre soin de votre progression intérieure.',
    templateIds: ['life.dev.respiration', 'life.dev.reflexion', 'life.dev.recul', 'life.dev.competence', 'life.dev.habitude'] },
  { id: 'pack.etudes-apprentissage', v: 1, name: 'Études et apprentissage', description: 'Lire, étudier et retenir avec régularité.', forWho: 'Pour apprendre de façon durable.',
    templateIds: ['life.cul.lecture', 'life.cul.etude', 'life.cul.notes', 'life.cul.ecoute', 'life.cul.approfondir'] },
  { id: 'pack.organisation-professionnelle', v: 1, name: 'Organisation professionnelle', description: 'Garder le cap sur l’essentiel au travail.', forWho: 'Pour un quotidien professionnel plus serein.',
    templateIds: ['life.pro.focus-block', 'life.pro.priorites', 'life.pro.dossier', 'life.pro.veille', 'life.pro.boite-mail'] },
  { id: 'pack.gestion-financiere', v: 1, name: 'Gestion financière', description: 'Voir clair dans son budget et construire une épargne de sécurité.', forWho: 'Pour reprendre la main sur ses finances.',
    templateIds: ['life.fin.depenses', 'life.fin.budget', 'life.fin.epargne', 'life.fin.abonnements', 'life.fin.fonds'] },
  { id: 'pack.equilibre-de-vie', v: 1, name: 'Équilibre de vie', description: 'Un peu de chaque domaine : corps, esprit, relations et projets.', forWho: 'Pour une vie plus équilibrée, sans objectif lourd.',
    templateIds: ['life.hyg.marche', 'life.hyg.sommeil', 'life.cul.lecture', 'life.soc.nouvelles', 'life.prj.avancer', 'life.hyg.recuperer'] },
]
