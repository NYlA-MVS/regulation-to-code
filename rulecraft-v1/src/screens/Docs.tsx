// Step 2 for PDFs and images: what was read, where it was read (this browser vs Claude), and every
// value side by side with the page so the user can confirm or fix it before the rules run.
import { useState } from 'react'
import { MODELS } from '../docs/ai'
import { DOC_REQUIRED } from '../docs/types'
import type { ExtractedInvoice } from '../docs/types'
import { FIELD_LABEL } from '../rules/engine'
import type { Field } from '../rules/engine'
import { Badge, StatusIcon } from '../ui'

export interface PendingPage { file: string; page: number; reason: 'scan' | 'image' | 'retry' }
export interface AiSettings { key: string; model: string; remember: boolean }

const EDIT: Field[] = ['doc_title', 'invoice_no', 'issue_date', 'seller_name', 'seller_tax_id', 'seller_branch', 'buyer_name', 'buyer_tax_id', 'buyer_branch', 'amount_ex_vat', 'vat_amount', 'total']
const MORE: Field[] = ['seller_address', 'buyer_address', 'book_no', 'ref_invoice_no', 'original_value', 'correct_value', 'reason']
const COST: Record<string, string> = { 'claude-opus-5-5': 'ประมาณ $0.04 ต่อหน้า', 'claude-sonnet-5-5': 'ประมาณ $0.02 ต่อหน้า', 'claude-haiku-5-5': 'ถูกกว่า Sonnet' }

export function Docs(p: {
  files: string[]; invoices: ExtractedInvoice[]; pending: PendingPage[]; busy: string | null; error: string | null; progress: [number, number] | null
  ai: AiSettings; setAi: (a: AiSettings) => void; lastUsage: { input: number; output: number } | null
  onRead: () => void; onCancel: () => void; onRetry: (i: number) => void; onEdit: (i: number, f: Field, v: string) => void; onRemove: (i: number) => void
  onCheck: () => void; onBack: () => void
}) {
  const [showKey, setShowKey] = useState(false)
  const local = p.invoices.filter((x) => x.source === 'text').length
  const byAi = p.invoices.length - local
  const needs = p.invoices.filter((x) => x.missing.length || x.garbled).length
  const pagesWaiting = p.pending.length
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[1.625rem]">ตรวจข้อมูลที่อ่านได้</h1>
        <p className="text-ink-2">{p.files.join(', ')} · อ่านได้ {p.invoices.length} ใบ{local ? ` (${local} ใบอ่านจากข้อความในไฟล์ PDF ในเครื่องนี้` : ''}{local && byAi ? `, ${byAi} ใบอ่านโดย Claude)` : local ? ')' : byAi ? ` (อ่านโดย Claude)` : ''} ตรวจและแก้ค่าที่ไม่ตรงกับเอกสารก่อนกดตรวจ</p>
      </div>

      {p.error && (
        <div role="alert" className="grid gap-1 rounded-xl border-2 border-fail bg-fail-bg p-4"><p className="font-semibold text-fail">อ่านเอกสารไม่สำเร็จ</p><p>{p.error}</p></div>
      )}

      {pagesWaiting > 0 && (
        <section className="card grid gap-4 border-l-[5px] border-l-expert p-5" aria-labelledby="ai-title">
          <div className="grid gap-1">
            <h2 id="ai-title" className="flex items-center gap-2 text-[1.1875rem]"><StatusIcon level="needs_expert" className="text-expert" />{pagesWaiting} หน้าต้องให้ Claude อ่าน</h2>
            <p className="text-ink-2">{p.pending.some((x) => x.reason === 'scan') ? 'หน้าที่เป็นภาพสแกนไม่มีข้อความในไฟล์ ' : ''}{p.pending.some((x) => x.reason === 'image') ? 'รูปถ่ายต้องอ่านจากภาพ ' : ''}{p.pending.some((x) => x.reason === 'retry') ? 'หน้าที่คุณเลือกให้อ่านใหม่ ' : ''}ภาพหน้าเหล่านี้จะถูกส่งไปที่ Claude ของ Anthropic ด้วย API key ของคุณ เพื่ออ่านข้อความออกมาเท่านั้น ผลผ่านหรือไม่ผ่านยังตัดสินด้วยข้อตรวจในเครื่องนี้เหมือนเดิม</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <label className="grid gap-1">
              <span className="text-[0.875rem] font-medium text-ink-2">Anthropic API key</span>
              <span className="flex gap-2">
                <input id="ai-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={p.ai.key}
                  onChange={(e) => p.setAi({ ...p.ai, key: e.target.value.trim() })} className="field num w-full" />
                <button type="button" className="btn btn-secondary px-3" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'ซ่อน key' : 'แสดง key'}>{showKey ? 'ซ่อน' : 'แสดง'}</button>
              </span>
            </label>
            <label className="grid gap-1">
              <span className="text-[0.875rem] font-medium text-ink-2">โมเดล</span>
              <select id="ai-model" value={p.ai.model} onChange={(e) => p.setAi({ ...p.ai, model: e.target.value })} className="field">
                {MODELS.map((m) => (<option key={m.id} value={m.id}>{m.label} · {m.note}</option>))}
              </select>
            </label>
          </div>
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--action)]" checked={p.ai.remember} onChange={(e) => p.setAi({ ...p.ai, remember: e.target.checked })} />
            <span>จำ key ไว้ในเบราว์เซอร์นี้ <span className="text-ink-3">(ถ้าไม่ติ๊ก key จะหายเมื่อปิดแท็บ ไม่ควรติ๊กบนเครื่องที่ใช้ร่วมกับคนอื่น)</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={!p.ai.key || !!p.busy} onClick={p.onRead}>
              {p.busy ? 'กำลังอ่าน…' : `ส่ง ${pagesWaiting} หน้าให้ Claude อ่าน`}
            </button>
            {p.busy && <button type="button" className="btn btn-secondary" onClick={p.onCancel}>หยุด</button>}
            <span className="text-[0.875rem] text-ink-3">{COST[p.ai.model] ?? ''} · คิดเงินจากบัญชี Anthropic ของ key นี้ · ไม่มี key? สร้างได้ที่ <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a></span>
          </div>
          {p.progress && (
            <div className="grid gap-1" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-action transition-all" style={{ width: `${(100 * p.progress[0]) / Math.max(p.progress[1], 1)}%` }} /></div>
              <span className="text-[0.875rem] text-ink-3">{p.busy} {p.progress[0]}/{p.progress[1]} หน้า</span>
            </div>
          )}
        </section>
      )}

      {p.lastUsage && <p className="text-[0.875rem] text-ink-3">การอ่านครั้งล่าสุดใช้ {p.lastUsage.input.toLocaleString('th-TH')} + {p.lastUsage.output.toLocaleString('th-TH')} token</p>}

      {needs > 0 && (
        <div className="flex gap-3 rounded-xl border border-warn-line bg-warn-bg p-4">
          <StatusIcon level="warn" size={20} className="mt-0.5 text-warn" />
          <p><span className="font-semibold">{needs} ใบมีช่องที่อ่านไม่ได้หรือไม่พบ</span> <span className="text-ink-2">ช่องที่มีกรอบแดงว่างอยู่หรืออ่านไม่ชัด กรอกตามเอกสาร หรือถ้าเอกสารไม่มีจริง ปล่อยว่างไว้ แล้วข้อตรวจจะรายงานเป็นปัญหา</span></p>
        </div>
      )}

      <ol className="grid gap-4">
        {p.invoices.map((inv, i) => (
          <li key={i} className="card grid gap-4 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-5">
            <div className="grid content-start gap-2">
              {inv.thumb ? (
                <a href={inv.thumb} target="_blank" rel="noreferrer" title="เปิดภาพขนาดเต็ม"><img src={inv.thumb} alt={`หน้า ${inv.pages.join(', ')} ของ ${inv.file}`} className="w-full rounded-lg border border-line bg-white" /></a>
              ) : <div className="grid aspect-[3/4] place-items-center rounded-lg border border-line bg-sunken text-[0.875rem] text-ink-3">ไม่มีภาพ</div>}
              <span className="text-[0.875rem] text-ink-3">{inv.file} · หน้า {inv.pages.join(', ')}</span>
              <span className="flex flex-wrap gap-1">
                {inv.source === 'text' ? <Badge level="pass" compact>อ่านในเครื่อง</Badge> : <Badge level="needs_expert" compact>อ่านโดย Claude</Badge>}
                {inv.garbled && <Badge level="warn" compact>ตัวอักษรเพี้ยนบางตัว</Badge>}
              </span>
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[1.0625rem]">{inv.fields.doc_title || 'เอกสาร'} {inv.fields.invoice_no || `ใบที่ ${i + 1}`}</h2>
                <span className="flex gap-1">
                  {inv.source === 'text' && <button type="button" className="btn btn-quiet" onClick={() => p.onRetry(i)}>ให้ Claude อ่านใบนี้แทน</button>}
                  <button type="button" className="btn btn-quiet" onClick={() => p.onRemove(i)}>ไม่ตรวจใบนี้</button>
                </span>
              </div>
              {inv.flags && (inv.flags.handwritten || inv.flags.copy || inv.flags.titleNotPrinted) && (
                <p className="flex flex-wrap gap-1">
                  {inv.flags.handwritten && <Badge level="warn" compact>เห็นรอยแก้ด้วยมือ</Badge>}
                  {inv.flags.copy && <Badge level="warn" compact>ดูเหมือนสำเนา</Badge>}
                  {inv.flags.titleNotPrinted && <Badge level="warn" compact>คำว่าใบกำกับภาษีไม่ได้ตีพิมพ์</Badge>}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {EDIT.map((f) => <FieldBox key={f} id={`doc-${i}-${f}`} f={f} inv={inv} onEdit={(v) => p.onEdit(i, f, v)} />)}
              </div>
              <details>
                <summary className="cursor-pointer text-[0.9375rem] text-action">ที่อยู่ เล่มที่ ข้อมูลใบลดหนี้/เพิ่มหนี้ และรายการสินค้า {inv.lines.length} รายการ</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {MORE.map((f) => <FieldBox key={f} id={`doc-${i}-${f}`} f={f} inv={inv} onEdit={(v) => p.onEdit(i, f, v)} />)}
                </div>
                {inv.lines.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-[0.875rem]">
                      <thead className="bg-sunken text-left text-ink-2"><tr><th className="px-3 py-2">รายการ</th><th className="px-3 py-2 text-right">จำนวน</th><th className="px-3 py-2 text-right">ราคาต่อหน่วย</th><th className="px-3 py-2 text-right">มูลค่า</th></tr></thead>
                      <tbody>{inv.lines.map((l, k) => (<tr key={k} className="border-t border-line"><td className="px-3 py-1.5">{l.desc}</td><td className="num px-3 py-1.5 text-right">{l.qty}</td><td className="num px-3 py-1.5 text-right">{l.price}</td><td className="num px-3 py-1.5 text-right">{l.amount}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </details>
            </div>
          </li>
        ))}
      </ol>
      {p.invoices.length === 0 && !pagesWaiting && <p className="card p-6 text-center text-ink-2">ไม่พบใบกำกับภาษีในไฟล์นี้</p>}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <button type="button" className="btn btn-primary" disabled={!p.invoices.length || !!p.busy} onClick={p.onCheck}>ตรวจ {p.invoices.length} ใบ</button>
        <button type="button" className="btn btn-secondary" onClick={p.onBack}>เลือกไฟล์อื่น</button>
        {pagesWaiting > 0 && <span className="text-[0.875rem] text-ink-3">ยังมี {pagesWaiting} หน้าที่ยังไม่ได้อ่าน จะไม่ถูกตรวจ</span>}
      </div>
    </div>
  )
}

function FieldBox({ id, f, inv, onEdit }: { id: string; f: Field; inv: ExtractedInvoice; onEdit: (v: string) => void }) {
  const v = inv.fields[f] ?? ''
  const flagged = inv.missing.includes(f) && (DOC_REQUIRED.includes(f) || !!v)
  return (
    <label htmlFor={id} className="grid min-w-0 gap-1">
      <span className="flex items-baseline justify-between gap-2 text-[0.875rem] text-ink-2">
        {FIELD_LABEL[f]}
        {flagged && <span className="font-semibold text-fail">{v ? 'อ่านไม่ชัด' : 'ไม่พบ'}</span>}
      </span>
      <input id={id} value={v} onChange={(e) => onEdit(e.target.value)} className={`field w-full ${flagged ? 'border-2 border-fail' : ''}`} />
    </label>
  )
}
