/* Bill photos. Captured, shrunk on the phone, kept locally, and sent with the
   row only when the endpoint asks for it — a 4 MB camera JPEG over a village
   2G connection is how an offline queue stops draining. */

import { dbPut, dbGet, uid } from './db'

const MAX_EDGE = 1400
const QUALITY = 0.62

export interface StoredPhoto { id: string; data: string; created_at: string }

export async function capture(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const shot = await Camera.getPhoto({
      quality: 70, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt,
      correctOrientation: true, width: MAX_EDGE,
    })
    if (!shot.dataUrl) return null
    return await store(await shrink(shot.dataUrl))
  } catch {
    return await pickFromFile()
  }
}

function pickFromFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = 'image/*'
    el.capture = 'environment'
    el.onchange = () => {
      const f = el.files?.[0]
      if (!f) return resolve(null)
      const r = new FileReader()
      r.onload = async () => resolve(await store(await shrink(String(r.result))))
      r.onerror = () => resolve(null)
      r.readAsDataURL(f)
    }
    el.click()
  })
}

function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      if (!ctx) return resolve(dataUrl)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function store(data: string): Promise<string> {
  const id = uid()
  await dbPut('blobs', { id, data, created_at: new Date().toISOString() } as StoredPhoto)
  return id
}

export async function loadPhoto(id: string): Promise<string | null> {
  const row = await dbGet<StoredPhoto>('blobs', id)
  return row?.data || null
}
