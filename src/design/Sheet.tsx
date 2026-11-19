import { useEffect, useRef, type ReactNode } from 'react'
import s from './sheet.module.css'

/**
 * Feuille modale accessible (élément <dialog> natif : focus piégé, Échap, rôle).
 * Mobile : feuille ancrée en bas. Desktop : boîte centrée.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={s.dialog} aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open ? (
        <div className={s.panel}>
          <div className={s.grip} aria-hidden="true" />
          <header className={s.head}>
            <h2>{title}</h2>
            <button type="button" className={s.close} onClick={onClose} aria-label="Fermer">×</button>
          </header>
          <div className={s.body}>{children}</div>
          {footer ? <footer className={s.foot}>{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}
      footer={<>
        <button type="button" className={s.btnGhost} onClick={onCancel}>Annuler</button>
        <button type="button" className={danger ? s.btnDanger : s.btnPrimary} onClick={onConfirm} autoFocus>{confirmLabel}</button>
      </>}>
      <div className={s.confirm}>{children}</div>
    </Sheet>
  )
}
