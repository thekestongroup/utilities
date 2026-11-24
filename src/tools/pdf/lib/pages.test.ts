import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { assemble, blankItem, bookletPlan, BLANK, itemsFor, makeBooklet, move, openSource, placement, turnBy, type SourceFile } from './pages'

/** A PDF whose page i is (100 + i) points wide, so pages can be told apart. */
async function sample(pages: number, base = 100): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage([base + i, 200])
  return doc.save()
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()))
const angles = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle)

describe('editing', () => {
  it('moves, and turns a quarter at a time', () => {
    expect(move(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(move(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
    expect(turnBy(270, 90)).toBe(0)
    expect(turnBy(0, -90)).toBe(270)
  })

  it('assembles pages from several PDFs in the order given, with turns and blanks', async () => {
    const a = await openSource('a.pdf', await sample(3, 100))
    const b = await openSource('b.pdf', await sample(2, 300))
    const sources = new Map<string, SourceFile>([[a.id, a], [b.id, b]])
    const itemsA = itemsFor(a)
    const itemsB = itemsFor(b)
    const turned = { ...itemsA[0]!, turn: 90 as const }
    const result = await assemble(sources, [itemsB[1]!, turned, blankItem(), itemsA[2]!])
    expect(await widths(result)).toEqual([302, 101, 302, 103]) // the blank takes the size of the first page
    expect(await angles(result)).toEqual([0, 90, 0, 0])
  })

  it('leaves out a page that is not in the list (deleting)', async () => {
    const a = await openSource('a.pdf', await sample(4))
    const items = itemsFor(a).filter((_, i) => i !== 1)
    expect(await widths(await assemble(new Map([[a.id, a]]), items))).toEqual([101, 103, 104])
  })

  it('refuses files that are not PDFs, without echoing them', async () => {
    await expect(openSource('x.pdf', new TextEncoder().encode('SECRET'))).rejects.toThrow(/could not be read/)
  })
})

describe('bookletPlan', () => {
  const oneBased = (n: number, binding: 'left' | 'right' = 'left') => bookletPlan(n, binding).sides.map((s) => s.map((p) => (p === null ? null : p + 1)))
  it('puts 8 pages on 2 sheets in the classic order', () => {
    expect(oneBased(8)).toEqual([[8, 1], [2, 7], [6, 3], [4, 5]])
  })
  it('pads to a multiple of four with blanks at the end', () => {
    const plan = bookletPlan(5)
    expect(plan.sheets).toBe(2)
    expect(oneBased(5)).toEqual([[null, 1], [2, null], [null, 3], [4, 5]])
  })
  it('handles one page, and every page appears exactly once', () => {
    expect(bookletPlan(1).sheets).toBe(1)
    for (const n of [1, 2, 3, 4, 7, 12, 13]) {
      const used = bookletPlan(n).sides.flat().filter((p): p is number => p !== null)
      expect(used.sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i))
    }
  })
  it('swaps the halves for right-to-left binding', () => {
    expect(oneBased(8, 'right')).toEqual([[1, 8], [7, 2], [3, 6], [5, 4]])
  })
})

describe('placement', () => {
  const box = { x: 0, y: 0, width: 400, height: 500 }
  it('fits a page in the box, centred', () => {
    const spot = placement(box, { width: 200, height: 200 }, 0)
    expect(spot.width).toBeCloseTo(400)
    expect(spot.x).toBeCloseTo(0)
    expect(spot.y).toBeCloseTo(50)
  })
  it('turns a page sideways to fit, and keeps it inside the box', () => {
    for (const turn of [0, 90, 180, 270]) {
      const spot = placement(box, { width: 300, height: 100 }, turn)
      const sideways = turn % 180 !== 0
      const [w, h] = sideways ? [spot.height, spot.width] : [spot.width, spot.height]
      expect(w).toBeLessThanOrEqual(box.width + 1e-6)
      expect(h).toBeLessThanOrEqual(box.height + 1e-6)
      expect(spot.angle + turn).toBe(0)
    }
  })
})

describe('makeBooklet', () => {
  it('makes one landscape A4 side per pair of pages: 8 pages is 4 sides', async () => {
    const result = await makeBooklet(await sample(8), { binding: 'left', sheet: 'a4' })
    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(4)
    expect(Math.round(doc.getPage(0).getWidth())).toBe(842)
    expect(Math.round(doc.getPage(0).getHeight())).toBe(595)
  })
  it('rounds up with blanks, and works for a single page', async () => {
    expect((await PDFDocument.load(await makeBooklet(await sample(5), { binding: 'left', sheet: 'letter' }))).getPageCount()).toBe(4)
    expect((await PDFDocument.load(await makeBooklet(await sample(1), { binding: 'right', sheet: 'a4' }))).getPageCount()).toBe(2)
  })
  it('keeps the BLANK marker out of the way of sources', () => {
    expect(BLANK).toBe('blank')
  })
})
