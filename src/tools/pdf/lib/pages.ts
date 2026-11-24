import { PDFDocument, degrees, type PDFEmbeddedPage, type PDFPage } from 'pdf-lib'
import { PdfError } from './split'

/**
 * The PDF editor's document model. A document is a list of pages, each pointing at a page of one
 * of the PDFs that were opened (or a blank page), with an extra turn. Nothing is changed until the
 * result is assembled, so editing is instant and the originals are never touched.
 */
export interface SourceFile {
  id: string
  name: string
  bytes: Uint8Array
  pageCount: number
}

export type Turn = 0 | 90 | 180 | 270

export interface PageItem {
  id: string
  /** A SourceFile id, or 'blank'. */
  source: string
  /** Page number within the source, from 0. */
  index: number
  /** Extra clockwise turn, on top of whatever the page already has. */
  turn: Turn
}

export const BLANK = 'blank'
/** A4 in points, the size of a blank page when there is nothing to copy. */
const A4: [number, number] = [595.28, 841.89]

let counter = 0
export const newId = (prefix = 'p') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

export async function openSource(name: string, bytes: Uint8Array): Promise<SourceFile> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch {
    throw new PdfError(`${name} could not be read. It may be password-protected or damaged.`)
  }
  if (doc.getPageCount() === 0) throw new PdfError(`${name} has no pages.`)
  return { id: newId('s'), name, bytes, pageCount: doc.getPageCount() }
}

export const itemsFor = (source: SourceFile): PageItem[] =>
  Array.from({ length: source.pageCount }, (_, index) => ({ id: newId(), source: source.id, index, turn: 0 }))

export const blankItem = (): PageItem => ({ id: newId(), source: BLANK, index: 0, turn: 0 })

export const turnBy = (turn: Turn, by: 90 | -90): Turn => ((((turn + by) % 360) + 360) % 360) as Turn

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list]
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item!)
  return copy
}

/** Builds the edited PDF from the sources and the page list. */
export async function assemble(sources: Map<string, SourceFile>, items: readonly PageItem[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const loaded = new Map<string, PDFDocument>()
  let firstSize: [number, number] | undefined
  for (const item of items) {
    if (item.source === BLANK) {
      const page = out.addPage(firstSize ?? A4)
      if (item.turn) page.setRotation(degrees(item.turn))
      continue
    }
    const source = sources.get(item.source)
    if (!source) continue
    let doc = loaded.get(source.id)
    if (!doc) {
      doc = await PDFDocument.load(source.bytes, { updateMetadata: false })
      loaded.set(source.id, doc)
    }
    const [copy] = await out.copyPages(doc, [item.index])
    if (!copy) continue
    if (item.turn) copy.setRotation(degrees((copy.getRotation().angle + item.turn) % 360))
    out.addPage(copy)
    if (!firstSize) {
      const { width, height } = copy.getSize()
      firstSize = [width, height]
    }
  }
  return out.save()
}

// ── Booklets ────────────────────────────────────────────────────────────────

/** Which pages go on each side of each sheet for a folded booklet. `null` is a blank. */
export interface BookletPlan {
  /** Sheets of paper. */
  sheets: number
  /** Sides in printing order: front of sheet 1, back of sheet 1, front of sheet 2, … Each is [left, right]. */
  sides: [number | null, number | null][]
}

/**
 * The page order for a saddle-stitched booklet: sheets are stacked, folded in half and stapled in
 * the middle. The page count is rounded up to a multiple of 4 with blanks at the end. For right-to-left
 * reading (right binding) the two halves of each side swap.
 */
export function bookletPlan(pageCount: number, binding: 'left' | 'right' = 'left'): BookletPlan {
  const total = Math.ceil(Math.max(1, pageCount) / 4) * 4
  const sheets = total / 4
  const page = (i: number) => (i < pageCount ? i : null)
  const sides: [number | null, number | null][] = []
  for (let i = 0; i < sheets; i++) {
    sides.push([page(total - 1 - 2 * i), page(2 * i)])
    sides.push([page(2 * i + 1), page(total - 2 - 2 * i)])
  }
  return { sheets, sides: binding === 'right' ? sides.map(([l, r]) => [r, l] as [number | null, number | null]) : sides }
}

export type SheetSize = 'a4' | 'letter'
const SHEET: Record<SheetSize, [number, number]> = { a4: [841.89, 595.28], letter: [792, 612] }

/** Where a page of a given size goes in a box, filling it as far as it can when turned clockwise by `turn`. */
export function placement(box: { x: number; y: number; width: number; height: number }, page: { width: number; height: number }, turn: number) {
  const sideways = turn % 180 !== 0
  const shownWidth = sideways ? page.height : page.width
  const shownHeight = sideways ? page.width : page.height
  const scale = Math.min(box.width / shownWidth, box.height / shownHeight)
  const width = page.width * scale
  const height = page.height * scale
  // pdf-lib turns counter-clockwise about the point the page is drawn from, so a clockwise turn
  // of 90 swings the page down and to the right of that point, and so on.
  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2
  const [w, h] = sideways ? [height, width] : [width, height]
  const left = centreX - w / 2
  const bottom = centreY - h / 2
  if (turn === 90) return { x: left, y: bottom + h, width, height, angle: -90 }
  if (turn === 180) return { x: left + w, y: bottom + h, width, height, angle: -180 }
  if (turn === 270) return { x: left + w, y: bottom, width, height, angle: -270 }
  return { x: left, y: bottom, width, height, angle: 0 }
}

/** Lays a PDF's pages out two to a landscape sheet, in booklet order. Print it double-sided, flipping on the short edge. */
export async function makeBooklet(edited: Uint8Array, options: { binding: 'left' | 'right'; sheet: SheetSize; margin?: number }): Promise<Uint8Array> {
  const source = await PDFDocument.load(edited, { updateMetadata: false })
  const count = source.getPageCount()
  const plan = bookletPlan(count, options.binding)
  const out = await PDFDocument.create()
  // A page with nothing on it (a blank page) has no content to copy, so it is simply left empty.
  const embedded: (PDFEmbeddedPage | null)[] = []
  for (const page of source.getPages()) embedded.push(page.node.Contents() ? await out.embedPage(page) : null)
  const angles = source.getPages().map((p: PDFPage) => p.getRotation().angle % 360)
  const [sheetWidth, sheetHeight] = SHEET[options.sheet]
  const margin = options.margin ?? 14
  for (const [left, right] of plan.sides) {
    const sheet = out.addPage([sheetWidth, sheetHeight])
    const half = sheetWidth / 2
    for (const [index, x] of [[left, 0], [right, half]] as const) {
      if (index === null) continue
      const page = embedded[index]
      if (!page) continue
      const spot = placement({ x: x + margin, y: margin, width: half - margin * 2, height: sheetHeight - margin * 2 }, { width: page.width, height: page.height }, angles[index] ?? 0)
      sheet.drawPage(page, { x: spot.x, y: spot.y, width: spot.width, height: spot.height, rotate: degrees(spot.angle) })
    }
  }
  return out.save()
}
