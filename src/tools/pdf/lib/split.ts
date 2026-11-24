import { PDFDocument, PDFPage, degrees } from 'pdf-lib'

export interface PdfInfo {
  pages: number
  /** Whether the pages read landscape (taking page rotation into account). */
  landscape: boolean
}

function isLandscape(page: PDFPage): boolean {
  const { width, height } = page.getSize()
  const turned = Math.abs(page.getRotation().angle) % 180 === 90
  return turned ? height > width : width > height
}

export class PdfError extends Error {}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes)
  } catch {
    // Encrypted or damaged files land here. Nothing from the file goes in the message.
    throw new PdfError('This file could not be read. It may be password-protected or damaged.')
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await load(bytes)
  const pages = doc.getPageCount()
  if (pages === 0) throw new PdfError('This PDF has no pages.')
  return { pages, landscape: isLandscape(doc.getPage(0)) }
}

export interface SplitOptions {
  /** Turn every back page 180° (for short-edge flips of portrait pages, and long-edge flips of landscape ones). */
  rotateBacks: boolean
  /** Put the back pages in reverse order (for printers that pick up the stack from the other end). */
  reverseBacks: boolean
}

export interface SplitResult {
  /** Pages 1, 3, 5, ... */
  fronts: Uint8Array
  /** Pages 2, 4, 6, ..., with a blank at the end when the page count is odd. */
  backs: Uint8Array
  pages: number
  /** Sheets of paper needed. */
  sheets: number
  /** A blank page was added so the last sheet has a back. */
  addedBlank: boolean
}

/** Splits a PDF into the pages to print first (fronts) and second (backs). */
export async function splitForDuplex(bytes: Uint8Array, options: SplitOptions): Promise<SplitResult> {
  const source = await load(bytes)
  const pages = source.getPageCount()
  if (pages === 0) throw new PdfError('This PDF has no pages.')
  const sheets = Math.ceil(pages / 2)

  const frontIndexes: number[] = []
  const backIndexes: number[] = []
  for (let i = 0; i < pages; i++) (i % 2 === 0 ? frontIndexes : backIndexes).push(i)
  const addedBlank = pages % 2 === 1

  const fronts = await PDFDocument.create()
  for (const page of await fronts.copyPages(source, frontIndexes)) fronts.addPage(page)

  const backs = await PDFDocument.create()
  const backPages = await backs.copyPages(source, backIndexes)
  if (addedBlank) {
    const last = source.getPage(pages - 1)
    const { width, height } = last.getSize()
    const blank = PDFPage.create(backs)
    blank.setSize(width, height)
    blank.setRotation(last.getRotation())
    backPages.push(blank)
  }
  // The blank page for an odd count belongs at the end of the sequence (before any reversing).
  const ordered = options.reverseBacks ? [...backPages].reverse() : backPages
  for (const page of ordered) {
    if (options.rotateBacks) page.setRotation(degrees((page.getRotation().angle + 180) % 360))
    backs.addPage(page)
  }

  return { fronts: await fronts.save(), backs: await backs.save(), pages, sheets, addedBlank }
}
