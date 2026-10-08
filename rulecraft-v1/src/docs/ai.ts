// Reads scanned or photographed invoices with Claude. The AI only transcribes what is printed; the
// deterministic rules decide pass/fail afterwards, and the user confirms every value first.
// Runs in the browser with the user's own API key; page images go straight to api.anthropic.com.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Field } from '../rules/engine'
import { DOC_REQUIRED } from './types'
import type { ExtractedInvoice } from './types'

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'แม่นที่สุด (ค่าเริ่มต้น)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'เร็วกว่า ราคาประมาณครึ่งหนึ่ง' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'เร็วและถูกที่สุด' },
] as const

const Line = z.object({ description: z.string(), quantity: z.string(), unit_price: z.string(), amount: z.string() })
const Doc = z.object({
  pages: z.array(z.number().int()).describe('page numbers (as labelled in the request) that belong to this document'),
  document_title: z.string(),
  invoice_number: z.string(),
  book_number: z.string(),
  issue_date: z.string(),
  seller_name: z.string(),
  seller_address: z.string(),
  seller_tax_id: z.string(),
  seller_branch: z.string(),
  buyer_name: z.string(),
  buyer_address: z.string(),
  buyer_tax_id: z.string(),
  buyer_branch: z.string(),
  lines: z.array(Line),
  amount_before_vat: z.string(),
  vat_amount: z.string(),
  grand_total: z.string(),
  reference_invoice_number: z.string().describe('credit/debit notes only: the original tax invoice number'),
  original_value: z.string().describe('credit/debit notes only'),
  correct_value: z.string().describe('credit/debit notes only'),
  reason: z.string().describe('credit/debit notes only'),
  handwritten_edits: z.boolean().describe('any printed value crossed out, overwritten or added by hand'),
  is_copy: z.boolean().describe('the page is a carbon copy or marked as a copy (สำเนา), not the original'),
  title_printed: z.boolean().describe('the words "ใบกำกับภาษี" (or the note title) are printed, not stamped or handwritten'),
  unclear_fields: z.array(z.string()).describe('names of fields above that were present but hard to read'),
})
const Out = z.object({ documents: z.array(Doc), skipped_pages: z.array(z.number().int()) })

const SYSTEM = `You transcribe Thai tax invoices (ใบกำกับภาษี), credit notes (ใบลดหนี้) and debit notes (ใบเพิ่มหนี้) from page images for a compliance checker.

Transcribe exactly what is printed. Never correct, complete, reformat or guess: the checker needs the document's real mistakes, such as a missing branch, a wrong tax ID digit or a wrong VAT amount. If a field is not on the document, return an empty string.

- Numbers: digits as printed, without thousands separators (7,400.00 -> 7400.00). Keep Thai digits if the document uses them.
- Dates: as printed (for example 02/09/2569 or 2 ก.ย. 2569).
- Tax IDs: the digits as printed, including dashes if printed. Do not fix the length or check digit.
- Branch: as printed, such as "สำนักงานใหญ่" or "สาขาที่ 00001". Empty if the document shows no branch for that party.
- Seller is the business that issued the document (usually at the top); buyer is the customer (ลูกค้า/ผู้ซื้อ).
- If a value was crossed out and rewritten by hand, return the handwritten value and set handwritten_edits to true.
- One entry per document. A document that continues over several pages lists all its page numbers. Pages that are not invoices or notes go in skipped_pages.`

export interface PageImage {
  file: string
  page: number
  dataUrl: string
}

export interface ReadResult {
  invoices: ExtractedInvoice[]
  skipped: PageImage[]
  usage: { input: number; output: number }
}

const BATCH = 4

/** Thai error text for the failures a user can act on. */
export function aiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'API key ไม่ถูกต้องหรือถูกยกเลิกแล้ว ตรวจ key ในหน้าตั้งค่า AI'
  if (e instanceof Anthropic.PermissionDeniedError) return 'key นี้ไม่มีสิทธิ์ใช้โมเดลที่เลือก ลองเลือกโมเดลอื่น'
  if (e instanceof Anthropic.RateLimitError) return 'ส่งคำขอถี่เกินไปหรือเครดิตไม่พอ รอสักครู่แล้วลองใหม่ หรือตรวจยอดเครดิตใน console.anthropic.com'
  if (e instanceof Anthropic.APIConnectionError) return 'เชื่อมต่อ Claude ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่'
  if (e instanceof Anthropic.APIError) return `Claude ตอบกลับว่ามีข้อผิดพลาด (${e.status ?? ''}) ${e.message}`
  return e instanceof Error ? e.message : 'อ่านด้วย Claude ไม่สำเร็จ'
}

const MAP: [keyof z.infer<typeof Doc>, Field][] = [
  ['document_title', 'doc_title'], ['invoice_number', 'invoice_no'], ['book_number', 'book_no'], ['issue_date', 'issue_date'],
  ['seller_name', 'seller_name'], ['seller_address', 'seller_address'], ['seller_tax_id', 'seller_tax_id'], ['seller_branch', 'seller_branch'],
  ['buyer_name', 'buyer_name'], ['buyer_address', 'buyer_address'], ['buyer_tax_id', 'buyer_tax_id'], ['buyer_branch', 'buyer_branch'],
  ['amount_before_vat', 'amount_ex_vat'], ['vat_amount', 'vat_amount'], ['grand_total', 'total'],
  ['reference_invoice_number', 'ref_invoice_no'], ['original_value', 'original_value'], ['correct_value', 'correct_value'], ['reason', 'reason'],
]

export async function readWithClaude(opts: {
  apiKey: string; model: string; pages: PageImage[]; onProgress?: (done: number, total: number) => void; signal?: AbortSignal
}): Promise<ReadResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  const batches: PageImage[][] = []
  for (let i = 0; i < opts.pages.length; i += BATCH) batches.push(opts.pages.slice(i, i + BATCH))
  const usage = { input: 0, output: 0 }
  const results: ExtractedInvoice[][] = []
  const skipped: PageImage[] = []
  let done = 0
  opts.onProgress?.(0, opts.pages.length)

  // Up to three requests at a time; results are reassembled in page order.
  const run = async (batch: PageImage[], index: number) => {
    const content: Anthropic.ContentBlockParam[] = []
    batch.forEach((p, k) => {
      content.push({ type: 'text', text: `หน้า ${k + 1} (ไฟล์ ${p.file} หน้า ${p.page})` })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.dataUrl.replace(/^data:image\/\w+;base64,/, '') } })
    })
    content.push({ type: 'text', text: `Transcribe every document on these ${batch.length} page(s). Use the page numbers 1-${batch.length} as labelled above.` })
    const response = await client.messages.parse(
      {
        model: opts.model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(Out), ...(opts.model.includes('haiku') ? {} : { effort: 'medium' as const }) },
      },
      { signal: opts.signal },
    )
    usage.input += response.usage.input_tokens
    usage.output += response.usage.output_tokens
    if (response.stop_reason === 'refusal') throw new Error('Claude ปฏิเสธที่จะอ่านหน้านี้ ลองใช้โมเดลอื่น')
    if (response.stop_reason === 'max_tokens') throw new Error('เอกสารยาวเกินกว่าที่อ่านได้ในครั้งเดียว ลองแยกไฟล์ให้เล็กลง')
    const out = response.parsed_output
    if (!out) throw new Error('Claude ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง')
    const at = (n: number) => batch[Math.min(Math.max(n, 1), batch.length) - 1]
    for (const n of out.skipped_pages) if (batch[n - 1]) skipped.push(batch[n - 1])
    results[index] = out.documents.map((d) => {
      const fields: Partial<Record<Field, string>> = {}
      for (const [k, f] of MAP) { const v = String(d[k] ?? '').trim(); if (v) fields[f] = v }
      const first = at(d.pages[0] ?? 1)
      const unclear = new Set(d.unclear_fields.map((k) => MAP.find(([a]) => a === k)?.[1]).filter(Boolean) as Field[])
      return {
        source: 'ai' as const,
        file: first.file,
        pages: [...new Set(d.pages.map((n) => at(n).page))],
        fields,
        lines: d.lines.map((l) => ({ desc: l.description, qty: l.quantity, price: l.unit_price, amount: l.amount })),
        // A document without the title at all is TI-01's finding, not a printing question.
        flags: { handwritten: d.handwritten_edits, copy: d.is_copy, titleNotPrinted: !d.title_printed && /ใบกำกับภาษี|ใบลดหนี้|ใบเพิ่มหนี้/.test(d.document_title.replace(/\s/g, '')) },
        missing: [...new Set([...DOC_REQUIRED.filter((f) => !fields[f]), ...unclear])],
        thumb: first.dataUrl,
      }
    })
    done += batch.length
    opts.onProgress?.(done, opts.pages.length)
  }
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (next < batches.length) { const i = next++; await run(batches[i], i) }
  }))

  // A document split across two batches comes back twice: merge consecutive parts with the same number.
  const merged: ExtractedInvoice[] = []
  for (const inv of results.flat()) {
    const prev = merged[merged.length - 1]
    if (prev && prev.file === inv.file && inv.fields.invoice_no && prev.fields.invoice_no === inv.fields.invoice_no && inv.pages[0] === prev.pages[prev.pages.length - 1] + 1) {
      prev.pages.push(...inv.pages)
      prev.lines.push(...inv.lines)
      for (const [k, v] of Object.entries(inv.fields) as [Field, string][]) if (v && (['amount_ex_vat', 'vat_amount', 'total'].includes(k) || !prev.fields[k])) prev.fields[k] = v
      prev.missing = DOC_REQUIRED.filter((f) => !prev.fields[f])
    } else merged.push(inv)
  }
  return { invoices: merged, skipped, usage }
}

// ---- key and model settings (the key never leaves this browser except to api.anthropic.com) ----
const KEY = 'rulecraft.ai.key'
const PREFS = 'rulecraft.ai.prefs.v1'
export function loadAi(): { key: string; model: string; remember: boolean } {
  let prefs = { model: MODELS[0].id as string, remember: false }
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } } catch { /* defaults */ }
  let key = ''
  try { key = (prefs.remember ? localStorage.getItem(KEY) : sessionStorage.getItem(KEY)) ?? '' } catch { /* none */ }
  return { key, ...prefs }
}
export function saveAi(s: { key: string; model: string; remember: boolean }) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ model: s.model, remember: s.remember }))
    if (s.remember) { localStorage.setItem(KEY, s.key); sessionStorage.removeItem(KEY) } else { sessionStorage.setItem(KEY, s.key); localStorage.removeItem(KEY) }
  } catch { /* storage blocked: key lives only in memory for this page */ }
}
export function forgetKey() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) } catch { /* nothing stored */ }
}
