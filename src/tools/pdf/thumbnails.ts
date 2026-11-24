import type { PDFDocumentProxy } from 'pdfjs-dist'

type LoadingTask = ReturnType<(typeof import('pdfjs-dist'))['getDocument']>

/**
 * Page previews, drawn with pdf.js. It is loaded (with its worker, from this site's own files) only
 * when the editor opens. Under the site's security policy there is no network and no font loading from
 * data, so pdf.js is told not to use them: previews of PDFs that depend on fetched fonts
 * or images may look plainer than the real thing, but the PDF itself is never altered by them.
 */
let loaded: Promise<typeof import('pdfjs-dist')> | undefined

function pdfjs() {
  loaded ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })()
  return loaded
}

export class Thumbnails {
  private document?: Promise<PDFDocumentProxy>
  private task?: LoadingTask
  private cache = new Map<string, Promise<ImageBitmap | null>>()
  /** Pages are drawn one at a time, so a long document doesn't flood the worker. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private bytes: Uint8Array) {}

  private open(): Promise<PDFDocumentProxy> {
    // pdf.js takes ownership of the data it is given, so it gets a copy.
    this.document ??= pdfjs().then((lib) => {
      this.task = lib.getDocument({ data: this.bytes.slice(), disableFontFace: true, useWorkerFetch: false, verbosity: 0 })
      return this.task.promise
    })
    return this.document
  }

  /** The page as an image `width` pixels wide, or null if it can't be drawn. */
  render(index: number, width = 240): Promise<ImageBitmap | null> {
    const key = `${index}:${width}`
    let result = this.cache.get(key)
    if (!result) {
      result = this.queue.then(async () => {
        try {
          const document = await this.open()
          const page = await document.getPage(index + 1)
          const natural = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / natural.width })
          const canvas = window.document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) return null
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          page.cleanup()
          return await createImageBitmap(canvas)
        } catch {
          return null
        }
      })
      this.queue = result
      this.cache.set(key, result)
    }
    return result
  }

  async destroy() {
    await this.document?.catch(() => undefined)
    await this.task?.destroy()
    for (const bitmap of this.cache.values()) void bitmap.then((b) => b?.close())
    this.cache.clear()
  }
}
