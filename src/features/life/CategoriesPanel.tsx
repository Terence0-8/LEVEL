import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Field, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS } from '@/core/attributes'
import type { Category } from '@/core/quest'
import type { AttributeId } from '@/core/types'
import { questService } from '@/data/questService'
import { useQuestViews } from './useQuestViews'
import s from './life.module.css'

export function CategoriesPanel() {
  const { categories } = useAppState()
  const views = useQuestViews()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const count = (id: string) => views.filter((v) => v.quest.categoryId === id && !v.quest.archived).length

  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Catégories LIFE" aside={<button className={s.act} onClick={() => setEditing('new')}>+ Ajouter</button>} />
        <p className={s.desc}>Chaque catégorie nourrit un attribut RPG. Renommez-les, changez l'attribut ou ajoutez les vôtres. Les catégories s'archivent plutôt que de se supprimer, pour préserver l'historique.</p>
        <ul className={s.catList}>
          {categories.map((c) => (
            <li key={c.id} className={c.archived ? s.questArchived : ''}>
              <div><b>{c.name}</b><small>{count(c.id)} quête(s) active(s)</small></div>
              <Badge tone="gold">{ATTRIBUTE_LABELS[c.attribute]}</Badge>
              <button className={s.act} onClick={() => setEditing(c)} aria-label={`Modifier ${c.name}`}>Modifier</button>
            </li>
          ))}
        </ul>
      </Card>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvelle catégorie' : 'Modifier la catégorie'}>
        {editing ? <CategoryForm category={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  )
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [attribute, setAttribute] = useState<AttributeId>(category?.attribute ?? 'discipline')
  const [archived, setArchived] = useState(category?.archived ?? false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (category) await questService.updateCategory(category.id, { name, attribute, archived })
      else await questService.addCategory(name, attribute)
      onDone()
    } catch {
      setError('Donnez un nom de 40 caractères maximum.')
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Nom" htmlFor="c-name"><input id="c-name" className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus required /></Field>
      <Field label="Attribut nourri" htmlFor="c-attr" hint="Les XP gagnées dans cette catégorie font progresser cet attribut. Le changement s'applique aux prochains gains.">
        <select id="c-attr" className={inputClass} value={attribute} onChange={(e) => setAttribute(e.target.value as AttributeId)}>
          {ATTRIBUTE_IDS.map((a) => <option key={a} value={a}>{ATTRIBUTE_LABELS[a]}</option>)}
        </select>
      </Field>
      {category ? (
        <label className={s.checkLine}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archiver (masquée des nouvelles quêtes)</label>
      ) : null}
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary}>Enregistrer</button>
      </div>
    </form>
  )
}
