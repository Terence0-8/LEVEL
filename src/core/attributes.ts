import type { Attribute, AttributeId } from './types'

/** Attributs proposés aux catégories LIFE. Force, Endurance et Discipline sont transversaux (LIFE et SPORT). */
export const ATTRIBUTE_IDS: AttributeId[] = ['force', 'endurance', 'vitalite', 'discipline', 'intellect', 'prosperite', 'relations']
export const LIFE_ATTRIBUTE_IDS = ATTRIBUTE_IDS
/** Attributs SPORT. */
export const SPORT_ATTRIBUTE_IDS: AttributeId[] = ['force', 'endurance', 'discipline', 'mobilite', 'coordination', 'maitrise', 'resilience']
export const ALL_ATTRIBUTE_IDS: AttributeId[] = [...ATTRIBUTE_IDS, 'mobilite', 'coordination', 'maitrise', 'resilience']
/** Attributs partagés entre LIFE et SPORT : ils reçoivent l'XP des deux domaines. */
export const TRANSVERSAL_ATTRIBUTE_IDS: AttributeId[] = ['force', 'endurance', 'discipline']

export const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  force: 'Force',
  endurance: 'Endurance',
  vitalite: 'Vitalité',
  relations: 'Relations',
  discipline: 'Discipline',
  intellect: 'Intellect',
  prosperite: 'Prospérité',
  mobilite: 'Mobilité',
  coordination: 'Coordination',
  maitrise: 'Maîtrise technique',
  resilience: 'Résilience',
}

/**
 * Valeur d'attribut (0–100) à partir de l'XP cumulée dans cet attribut.
 * PROVISOIRE : courbe à saturation, à calibrer (voir PRODUCT_SPEC).
 */
export const ATTRIBUTE_SCALE_XP = 1500

export function attributeValue(xp: number): number {
  return Math.round(100 * (1 - Math.exp(-Math.max(0, xp) / ATTRIBUTE_SCALE_XP)))
}

export function buildAttributes(xpByAttribute: Partial<Record<AttributeId, number>>): Attribute[] {
  return ALL_ATTRIBUTE_IDS.map((id) => ({ id, label: ATTRIBUTE_LABELS[id], value: attributeValue(xpByAttribute[id] ?? 0) }))
}

/**
 * Audit des attributs LIFE (RPG V1.1) : sept catégories par défaut, sept attributs LIFE, un par catégorie.
 * Avant la V1.1, « Social & relations » nourrissait Vitalité (avec Hygiène de vie) : deux univers distincts mélangés.
 * Le nouvel attribut Relations lève cette ambiguïté ; aucun attribut n'est ajouté « pour le nombre ».
 * Les événements déjà inscrits conservent l'attribut qu'ils avaient (aucune réécriture) ; seules les prochaines validations en bénéficient.
 */
export const DEFAULT_CATEGORY_ATTRIBUTE: Record<string, AttributeId> = {
  'cat-pro': 'discipline', 'cat-culture': 'intellect', 'cat-finances': 'prosperite', 'cat-perso': 'endurance',
  'cat-social': 'relations', 'cat-projets': 'force', 'cat-hygiene': 'vitalite',
}

/** Ce qui fait évoluer chaque attribut (affiché dans l'espace RPG). */
export const ATTRIBUTE_HINTS: Record<AttributeId, string> = {
  force: 'Projets personnels (LIFE) et séances de musculation (SPORT).',
  endurance: 'Développement personnel (LIFE) et courses, circuits et efforts longs (SPORT).',
  vitalite: 'Hygiène de vie : sommeil, alimentation, soin de soi (LIFE).',
  discipline: 'Quêtes professionnelles (LIFE) et régularité des séances (SPORT).',
  intellect: 'Culture et connaissances : lecture, apprentissage (LIFE).',
  prosperite: 'Économie et finances : budget, épargne, démarches (LIFE).',
  relations: 'Social et relations : proches, réseau, vie collective (LIFE).',
  mobilite: 'Séances de mobilité et d’étirements (SPORT).',
  coordination: 'Circuits HIIT et exercices d’équilibre et de coordination (SPORT).',
  maitrise: 'Qualité technique : séries propres, records progressifs (SPORT).',
  resilience: 'Respect de la récupération et reprise après repos (SPORT).',
}
