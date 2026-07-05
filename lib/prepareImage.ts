// Prepare a photo for upload: bake in the correct EXIF orientation (so a photo
// taken in portrait OR landscape always displays and OCRs upright) and shrink it
// to a sane size. Handwriting stays legible at ~1600px, and Claude's vision model
// downscales to ~1568px internally anyway — so this doesn't hurt OCR, it just
// makes uploads far faster.
export async function prepareImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  try {
    // imageOrientation: 'from-image' applies the EXIF rotation, giving an upright
    // bitmap regardless of how the phone was held.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
