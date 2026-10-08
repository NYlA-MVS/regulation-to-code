// PDF and image handling in the browser: text layer for local reading, page images for the AI reader.
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import { toLines } from './textInvoice'
import type { Line, TextRun } from './textInvoice'

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()
  workerReady = true
}

export async function openPdf(buf: ArrayBuffer): Promise<PDFDocumentProxy> {
  ensureWorker()
  try {
    return await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  } catch (e) {
    if (e instanceof Error && /password/i.test(e.name + e.message)) throw new Error('ไฟล์ PDF นี้มีรหัสผ่าน ให้ปลดรหัสผ่านก่อนแล้วลองใหม่')
    throw new Error('เปิดไฟล์ PDF นี้ไม่ได้ ไฟล์อาจเสียหาย')
  }
}

export async function pageLines(doc: PDFDocumentProxy, n: number): Promise<Line[]> {
  const tc = await (await doc.getPage(n)).getTextContent()
  const runs: TextRun[] = tc.items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }] : []))
  return toLines(runs)
}

/** Claude reads images best at up to about 1568 px on the long side. */
const MAX_SIDE = 1568

export async function renderPage(doc: PDFDocumentProxy, n: number, maxSide = MAX_SIDE, quality = 0.85): Promise<string> {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(3, maxSide / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', quality)
}

export const IMAGE_TYPES = /\.(jpe?g|png|webp|gif)$/i

/** Photos are scaled down to the size Claude reads best; EXIF orientation is applied by the browser. */
export async function imageToDataUrl(file: File, maxSide = MAX_SIDE, quality = 0.85): Promise<string> {
  if (/\.(heic|heif)$/i.test(file.name)) throw new Error('ยังไม่รองรับไฟล์ HEIC จาก iPhone ให้ส่งออกเป็น JPG ก่อน (ตั้งค่า > กล้อง > รูปแบบ > เข้ากันได้มากที่สุด)')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error(`เปิดรูป ${file.name} ไม่ได้`)
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** A small preview for the review screen. */
export async function thumbFrom(dataUrl: string, maxSide = 360): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}
