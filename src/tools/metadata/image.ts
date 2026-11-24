/**
 * Cleans a photo by drawing it again: the new file holds only the pixels, with no EXIF, XMP,
 * colour profile or thumbnails. The browser applies the photo's rotation first, so it stays upright.
 */
export async function cleanImage(file: Blob, mime: string, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    if (mime === 'image/jpeg') {
      // JPEG has no transparency: put it on white.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
    if (!blob) throw new Error('could not encode')
    return blob
  } finally {
    bitmap.close()
  }
}

export const MIME: Record<'jpeg' | 'png' | 'webp', string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const EXTENSION: Record<'jpeg' | 'png' | 'webp' | 'pdf', string> = { jpeg: 'jpg', png: 'png', webp: 'webp', pdf: 'pdf' }
