import { frDate, type ReportDoc } from './index'
import { TAG_LABEL } from '../narration'

/**
 * Écrivain PDF minimal, sans dépendance, 100 % hors ligne. Polices standard (Helvetica, jeu WinAnsi) : aucun fichier de police à embarquer,
 * les accents français sont conservés. Les caractères hors WinAnsi sont remplacés par un équivalent lisible.
 * Un PDF de bilan est un document à lire : il ne contient AUCUNE donnée de restauration et n'a rien à voir avec une sauvegarde.
 */

const W = 595.28
const H = 841.89
const M = 48

// Largeurs Helvetica (1/1000 em) pour ASCII 32–126 ; les lettres accentuées prennent la largeur de leur lettre de base.
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]

const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f }
const FALLBACK: Record<string, string> = { '→': '->', '←': '<-', '≈': '~', 'ᵉ': 'e', '≥': '>=', '≤': '<=', '×': 'x', ' ': ' ', ' ': ' ' }

/** Texte → chaîne d'octets WinAnsi (un caractère = un octet). */
export function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const rep = FALLBACK[ch]
    if (rep !== undefined) { out += rep; continue }
    const code = ch.codePointAt(0)!
    if (code === 0x09 || code === 0x0a) out += ' '
    else if (code >= 0x20 && code < 0x7f) out += ch
    else if (code >= 0xa0 && code <= 0xff) out += ch
    else if (CP1252[ch] !== undefined) out += String.fromCharCode(CP1252[ch])
    else out += '?'
  }
  return out
}

const baseChar = (ch: string) => (ch.charCodeAt(0) < 0x7f ? ch : ch.normalize('NFD')[0] ?? ch)
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0
  for (const ch of s) {
    const b = baseChar(ch)
    const code = b.charCodeAt(0)
    w += code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556
  }
  return ((w * (bold ? 1.06 : 1)) / 1000) * size
}

function wrap(text: string, size: number, maxW: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (textWidth(test, size, bold) <= maxW) cur = test
    else { if (cur) lines.push(cur); cur = word }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

const esc = (s: string) => toWinAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
const num = (n: number) => (Math.round(n * 100) / 100).toString()

interface Page { ops: string[] }

export function renderReportPdf(doc: ReportDoc): Uint8Array {
  const pages: Page[] = []
  let page: Page = { ops: [] }
  let y = H - M
  const newPage = () => { page = { ops: [] }; pages.push(page); y = H - M }
  pages.push(page)

  const text = (s: string, x: number, size: number, bold = false, gray = 0.1) => {
    page.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} ${gray} ${gray} rg ${num(x)} ${num(y)} Td (${esc(s)}) Tj ET`)
  }
  const rule = (gray = 0.8) => page.ops.push(`${gray} G 0.6 w ${M} ${num(y)} m ${num(W - M)} ${num(y)} l S`)
  const need = (h: number) => { if (y - h < M + 28) newPage() }

  // En-tête
  text('LEVEL', M, 9, true, 0.45); y -= 22
  text(doc.title, M, 22, true); y -= 20
  text(doc.subtitle.charAt(0).toUpperCase() + doc.subtitle.slice(1), M, 12, false, 0.3); y -= 10
  rule(0.6); y -= 20

  for (const sec of doc.sections) {
    need(60)
    text(sec.title, M, 13, true)
    if (sec.tag) text(`(${TAG_LABEL[sec.tag]})`, M + textWidth(sec.title, 13, true) + 8, 9, false, 0.5)
    y -= 17
    for (const p of sec.tagged ?? []) {
      const label = `[${TAG_LABEL[p.tag]}] `
      const ls = wrap(label + p.text, 10, W - 2 * M - 14)
      need(ls.length * 14)
      text('\u2022', M, 10)
      ls.forEach((l) => { text(l, M + 14, 10, false, p.tag === 'recommendation' ? 0.05 : 0.15); y -= 14 })
    }
    const hasContent = Boolean(sec.stats?.length || sec.table?.rows.length || sec.lines?.length || sec.tagged?.length)
    if (!hasContent) {
      for (const l of wrap(sec.empty ?? 'Rien à signaler.', 10, W - 2 * M)) { need(14); text(l, M, 10, false, 0.45); y -= 14 }
    }
    for (const st of sec.stats ?? []) {
      need(16)
      text(st.label, M, 10, false, 0.35)
      text(st.value, M + 190, 10, true)
      y -= 14
      if (st.hint) for (const l of wrap(st.hint, 8.5, W - 2 * M - 190)) { need(12); text(l, M + 190, 8.5, false, 0.45); y -= 12 }
    }
    if (sec.table?.rows.length) {
      const cols = sec.table.head.length
      const colW = (W - 2 * M) / cols
      need(18)
      sec.table.head.forEach((h, c) => text(h, M + c * colW, 9, true, 0.35))
      y -= 5; rule(0.75); y -= 11
      for (const row of sec.table.rows) {
        need(15)
        row.forEach((cell, c) => text(cell, M + c * colW, 10, c === cols - 1 && cols > 1))
        y -= 14
      }
    }
    for (const line of sec.lines ?? []) {
      const ls = wrap(line, 10, W - 2 * M - 14)
      need(ls.length * 14)
      text('•', M, 10)
      ls.forEach((l) => { text(l, M + 14, 10); y -= 14 })
    }
    y -= 10
  }

  need(60)
  rule(0.8); y -= 14
  for (const l of wrap(doc.note, 8.5, W - 2 * M)) { need(12); text(l, M, 8.5, false, 0.4); y -= 12 }
  y -= 4
  const gen = new Date(doc.generatedAt)
  for (const l of wrap(`Document de bilan généré le ${frDate(`${gen.getFullYear()}-${String(gen.getMonth() + 1).padStart(2, '0')}-${String(gen.getDate()).padStart(2, '0')}`)} sur cet appareil. Ce n’est pas une sauvegarde : il ne permet pas de restaurer vos données.`, 8.5, W - 2 * M)) { need(12); text(l, M, 8.5, false, 0.4); y -= 12 }

  // Numérotation
  pages.forEach((p, i) => {
    const label = `Level · ${doc.title} · page ${i + 1} / ${pages.length}`
    p.ops.push(`BT /F1 8 Tf 0.5 0.5 0.5 rg ${num(W - M - textWidth(label, 8))} ${M - 22} Td (${esc(label)}) Tj ET`)
  })

  // Assemblage : 1 catalogue, 2 pages, 3 police, 4 police grasse, 5 info, puis (page, contenu) par page
  const objs: string[] = []
  const pageObjIds = pages.map((_, i) => 6 + i * 2)
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  objs[5] = `<< /Title (${esc(`${doc.title} - ${doc.subtitle}`)}) /Creator (Level) /Producer (Level) >>`
  pages.forEach((p, i) => {
    const content = p.ops.join('\n')
    objs[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`
    objs[7 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  })

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  for (let id = 1; id < objs.length; id++) { offsets[id] = out.length; out += `${id} 0 obj\n${objs[id]}\nendobj\n` }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}
