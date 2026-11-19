import type { Attribute, AttributeId } from './types'

export const ATTRIBUTE_IDS: AttributeId[] = ['force', 'endurance', 'vitalite', 'discipline', 'intellect', 'prosperite']

export const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  force: 'Force',
  endurance: 'Endurance',
  vitalite: 'Vitalité',
  discipline: 'Discipline',
  intellect: 'Intellect',
  prosperite: 'Prospérité',
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
  return ATTRIBUTE_IDS.map((id) => ({ id, label: ATTRIBUTE_LABELS[id], value: attributeValue(xpByAttribute[id] ?? 0) }))
}
