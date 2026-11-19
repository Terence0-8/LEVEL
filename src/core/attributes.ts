import type { Attribute, AttributeId } from './types'

/** Attributs proposés aux catégories LIFE. Force, Endurance et Discipline sont transversaux (LIFE et SPORT). */
export const ATTRIBUTE_IDS: AttributeId[] = ['force', 'endurance', 'vitalite', 'discipline', 'intellect', 'prosperite']
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
