// Photos are resized in the browser before upload. A phone photo is 3-12 MB;
// at 2560 px on the long edge it is a few hundred KB and still sharp on any
// screen or printed page. That keeps a Raspberry Pi's SD card, the nightly
// backups, and the PDFs a sensible size. Re-encoding also drops the photo's
// EXIF data, including the GPS position, which otherwise travels into shared
// build sheets.
//
// Anything that isn't a decodable image (PDFs, HEIC in browsers that can't
// read it) is uploaded unchanged. Owners can keep full-size photos on a
// device from Settings -> General.

const KEEP_KEY = 'raptortracker.keepFullSizePhotos'

export const PHOTO = { maxEdge: 2560, quality: 0.85 }
// Receipts and document scans stay a little larger so small print stays legible.
export const SCAN = { maxEdge: 3000, quality: 0.88 }

export function keepFullSize() {
  try { return localStorage.getItem(KEEP_KEY) === 'true' } catch { return false }
}
export function setKeepFullSize(on) {
  try { localStorage.setItem(KEEP_KEY, on ? 'true' : 'false') } catch { /* private mode: setting just won't stick */ }
}

export async function shrinkImage(file, { maxEdge = PHOTO.maxEdge, quality = PHOTO.quality, force = false } = {}) {
  if ((keepFullSize() && !force) || !file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    // A small PNG (a screenshot) is better left as it is.
    if (scale === 1 && file.type === 'image/png') { bitmap.close?.(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

/** One at a time: a phone decoding several 12 MP photos at once can run out of memory. */
export async function shrinkAll(files, opts) {
  const out = []
  for (const f of files) out.push(await shrinkImage(f, opts))
  return out
}
