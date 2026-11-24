/** Saves bytes as a file download. */
export function downloadBytes(bytes: Uint8Array | Blob, name: string, type = 'application/octet-stream'): void {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function readFile(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

/**
 * Prints a PDF made in the browser: it is opened in a hidden frame and the print dialog is
 * shown, so the file doesn't have to be opened first. `done` is called when printing finishes
 * (or is cancelled); `failed` if the browser won't print from a frame.
 */
export function printPdf(bytes: Uint8Array, callbacks: { done?: () => void; failed?: () => void } = {}): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.title = 'PDF to print'
  const style: Record<string, string> = { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', 'pointer-events': 'none' }
  for (const [key, value] of Object.entries(style)) frame.style.setProperty(key, value)
  let finished = false
  const finish = (ok: boolean) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    frame.remove()
    URL.revokeObjectURL(url)
    if (ok) callbacks.done?.()
    else callbacks.failed?.()
  }
  // Safety net if the browser never reports finishing.
  const timer = setTimeout(() => finish(true), 10 * 60 * 1000)
  frame.addEventListener(
    'load',
    () => {
      try {
        const target = frame.contentWindow
        if (!target) throw new Error('no window')
        target.focus()
        target.addEventListener('afterprint', () => finish(true), { once: true })
        target.print()
        // Browsers that print without telling us: let go after a moment.
        setTimeout(() => callbacks.done?.(), 4000)
      } catch {
        finish(false)
      }
    },
    { once: true }
  )
  frame.addEventListener('error', () => finish(false), { once: true })
  frame.src = url
  document.body.append(frame)
}
