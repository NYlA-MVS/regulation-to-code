// Red-pen audit: one invoice at a time, rebuilt as a document, failing fields circled
// with the rule cited in the margin.
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Verdict } from './rules/checks'
import { CLAUSES } from './rules/clauses'
import type { Clause } from './rules/clauses'
import type { Invoice, RowResults } from './rules/engine'
import { lineRange } from './io/report'
import { norm, parseAmount } from './rules/normalize'

type Mark = { n: number; clause: Clause; verdict: Verdict; evidence: string; fix?: string; line?: number }

const PROBLEM: Verdict[] = ['fail', 'needs_expert']
const isProblem = (r: RowResults) => Object.values(r).some((x) => x && PROBLEM.includes(x.verdict))

/** Numbered marks for this invoice, in the order fields appear on the document. */
function marksFor(res: RowResults): Mark[] {
  const order = ['TI-01', 'TI-04', 'TI-07', 'TI-02', 'TI-08', 'TI-03', 'TI-09', 'TI-10', 'TI-05', 'TI-06', 'TI-06b']
  const out: Mark[] = []
  for (const id of order) {
    const r = res[id as keyof RowResults]
    const clause = CLAUSES.find((c) => c.id === id)
    if (r && clause && PROBLEM.includes(r.verdict)) out.push({ n: out.length + 1, clause, verdict: r.verdict, evidence: r.evidence, fix: r.fix, line: r.line })
  }
  return out
}

// The field a clause's red-pen mark sits on, when it differs from all the fields the check reads.
const MARK_ON: Partial<Record<string, string[]>> = {
  'TI-06b': ['vat_amount'],
  'TI-09': ['buyer_tax_id'],
  'TI-10': ['buyer_branch'],
}

/** A field on the paper. Circled in red pen when one of its clauses has a mark. */
function Field({ field, marks, line, children, className = '' }: { field: string | string[]; marks: Mark[]; line?: number; children: ReactNode; className?: string }) {
  const fields = Array.isArray(field) ? field : [field]
  const hit = marks.filter((m) => (m.line === undefined || line === undefined || m.line === line) && (MARK_ON[m.clause.id] ?? m.clause.fields).some((f) => fields.includes(f)))
  const expertOnly = hit.length > 0 && hit.every((m) => m.verdict === 'needs_expert')
  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      {hit.length > 0 && (
        <>
          <span className={`pen pointer-events-none absolute -inset-x-2.5 -inset-y-1.5 rounded-[50%] border-[1.6px] ${expertOnly ? 'border-dashed border-[var(--expert-pen)]' : 'border-[var(--redpen)]'}`} aria-hidden="true" />
          <span className="absolute -top-3 -right-4 flex gap-0.5">
            {hit.map((m) => (
              <a key={m.n} href={`#note-${m.n}`} className={`grid size-5 place-items-center rounded-full font-sans text-[0.6875rem] font-bold text-white no-underline ${m.verdict === 'fail' ? 'bg-[var(--redpen)]' : 'bg-[var(--expert-pen)]'}`} aria-label={`ดูหมายเหตุข้อ ${m.n}`}>
                {m.n}
              </a>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

const blank = (v: string) => (norm(v) === '' ? <span className="text-[var(--paper-muted)] italic">(ว่าง)</span> : v)
const money = (v: string) => {
  const n = parseAmount(v)
  return n === null ? blank(v) : n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function Audit({
  invoices,
  results,
  index,
  setIndex,
  vatPct,
  onMatrix,
}: {
  invoices: Invoice[]
  results: RowResults[]
  index: number
  setIndex: (i: number) => void
  vatPct: number
  onMatrix: () => void
}) {
  const rows = invoices
  const i = Math.min(Math.max(index, 0), Math.max(rows.length - 1, 0))
  const inv = invoices[i]
  const row = inv?.row
  const marks = useMemo(() => marksFor(results[i] ?? {}), [results, i])
  const problemRows = useMemo(() => results.map((r, k) => (isProblem(r) ? k : -1)).filter((k) => k >= 0), [results])
  const nextProblem = problemRows.find((k) => k > i) ?? problemRows[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea')) return
      if (e.key === 'ArrowRight') setIndex(Math.min(i + 1, rows.length - 1))
      if (e.key === 'ArrowLeft') setIndex(Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, rows.length, setIndex])

  if (!row)
    return (
      <div className="grid justify-items-start gap-2 rounded-lg border border-line bg-surface p-6">
        <h3 className="font-semibold">ไฟล์นี้ไม่มีแถวข้อมูล</h3>
        <p className="text-muted">ตรวจว่าไฟล์มีหัวคอลัมน์และมีอย่างน้อยหนึ่งแถวใต้หัวคอลัมน์ หรือกลับไปเลือกไฟล์ใหม่</p>
      </div>
    )

  const failCount = problemRows.length
  return (
    <div className="grid grid-cols-1 gap-4">
      <p className="text-[1.0625rem]">
        <span className="num font-semibold text-[var(--redpen-text)]">{failCount}</span> จาก <span className="num font-semibold">{rows.length}</span> ใบ มีจุดที่ต้องแก้หรือต้องถามผู้เชี่ยวชาญ
      </p>

      {/* invoice strip: every invoice, status at a glance */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="เลือกใบกำกับภาษี" className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {results.map((r, k) => {
            const bad = Object.values(r).some((x) => x?.verdict === 'fail')
            const ask = !bad && Object.values(r).some((x) => x?.verdict === 'needs_expert')
            return (
              <button key={k} type="button" onClick={() => setIndex(k)} aria-current={k === i ? 'true' : undefined}
                aria-label={`ใบที่ ${k + 1}${bad ? ' มีข้อไม่ผ่าน' : ask ? ' ต้องถามผู้เชี่ยวชาญ' : ' ผ่าน'}`}
                className={`num relative grid h-8 min-w-8 shrink-0 place-items-center rounded-md border text-[0.75rem] ${k === i ? 'border-action bg-action text-on-action' : 'border-line bg-surface hover:border-ink'}`}>
                {k + 1}
                {(bad || ask) && <span className={`absolute -top-1 -right-1 size-2 rounded-full ${bad ? 'bg-[var(--redpen)]' : 'bg-[var(--expert-pen)]'}`} />}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" disabled={i === 0} onClick={() => setIndex(i - 1)} className="h-9 rounded-md border border-line bg-surface px-3 text-[0.875rem] disabled:opacity-40">← ก่อนหน้า</button>
          <span className="num px-2 text-[0.875rem] text-muted">ใบที่ {i + 1} / {rows.length}</span>
          <button type="button" disabled={i >= rows.length - 1} onClick={() => setIndex(i + 1)} className="h-9 rounded-md border border-line bg-surface px-3 text-[0.875rem] disabled:opacity-40">ถัดไป →</button>
        </div>
        <div className="flex gap-2">
          {nextProblem !== undefined && nextProblem !== i && (
            <button type="button" onClick={() => setIndex(nextProblem)} className="h-9 rounded-md bg-action px-3 text-[0.875rem] font-medium text-on-action">ไปใบถัดไปที่มีปัญหา</button>
          )}
          <button type="button" onClick={onMatrix} className="h-9 rounded-md border border-line bg-surface px-3 text-[0.875rem]">ดูภาพรวมทุกใบ</button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* the paper */}
        <article aria-label={`ใบกำกับภาษี ${row.invoice_no || `ใบที่ ${i + 1}`}`} className="paper grid gap-5 rounded-sm px-5 py-6 sm:px-9 sm:py-8" key={i}>
          <header className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="grid gap-1">
              <Field field="doc_title" marks={marks} className="justify-self-start">
                <h3 className="text-[1.5rem] leading-tight font-bold">{blank(row.doc_title)}</h3>
              </Field>
              <span className="text-[0.75rem] text-[var(--paper-muted)]">จัดหน้าใหม่จากข้อมูลในไฟล์ · แถว {lineRange(inv.lineNos)}{inv.lines.length > 1 ? ` · ${inv.lines.length} รายการ` : ''}</span>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[0.9375rem] sm:justify-items-end">
              <dt className="text-[var(--paper-muted)]">เลขที่</dt>
              <dd><Field field="invoice_no" marks={marks}><span className="num">{blank(row.invoice_no)}</span></Field></dd>
              <dt className="text-[var(--paper-muted)]">วันที่</dt>
              <dd><Field field="issue_date" marks={marks}><span className="num">{blank(row.issue_date)}</span></Field></dd>
            </dl>
          </header>

          <div className="grid gap-5 border-y border-[var(--paper-rule)] py-4 sm:grid-cols-2">
            <section className="grid content-start gap-1">
              <h4 className="text-[0.75rem] font-semibold tracking-[0.04em] text-[var(--paper-muted)]">ผู้ขาย</h4>
              <Field field={['seller_name', 'seller_address', 'seller_tax_id']} marks={marks} className="justify-self-start">
                <span className="block font-semibold">{blank(row.seller_name)}</span>
                <span className="block text-[0.9375rem]">{blank(row.seller_address)}</span>
                <span className="num block text-[0.9375rem]">เลขผู้เสียภาษี {blank(row.seller_tax_id)}</span>
              </Field>
              <Field field="seller_branch" marks={marks} className="justify-self-start text-[0.9375rem]">{blank(row.seller_branch)}</Field>
            </section>
            <section className="grid content-start gap-1">
              <h4 className="text-[0.75rem] font-semibold tracking-[0.04em] text-[var(--paper-muted)]">ผู้ซื้อ</h4>
              <Field field={['buyer_name', 'buyer_address']} marks={marks} className="justify-self-start">
                <span className="block font-semibold">{blank(row.buyer_name)}</span>
                <span className="block text-[0.9375rem]">{blank(row.buyer_address)}</span>
              </Field>
              <Field field="buyer_tax_id" marks={marks} className="justify-self-start text-[0.9375rem]">
                <span className="num">เลขผู้เสียภาษี {norm(row.buyer_is_vat_registrant).toUpperCase() === 'N' && norm(row.buyer_tax_id) === '' ? '— (ผู้ซื้อไม่ได้จด VAT)' : blank(row.buyer_tax_id)}</span>
              </Field>
              {norm(row.buyer_is_vat_registrant).toUpperCase() !== 'N' && (
                <Field field="buyer_branch" marks={marks} className="justify-self-start text-[0.9375rem]">{blank(row.buyer_branch)}</Field>
              )}
            </section>
          </div>

          <div className="grid gap-3 border-b border-[var(--paper-rule)] pb-4 text-[0.9375rem] sm:hidden">
            {inv.lines.map((l, k) => (
              <dl key={k} className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="text-[var(--paper-muted)]">รายการ</dt>
                <dd><Field field="item_desc" marks={marks} line={k}>{blank(l.item_desc)}</Field></dd>
                <dt className="text-[var(--paper-muted)]">จำนวน</dt>
                <dd className="num"><Field field="qty" marks={marks} line={k}>{blank(l.qty)}</Field></dd>
                <dt className="text-[var(--paper-muted)]">ราคาต่อหน่วย</dt>
                <dd className="num">{money(l.unit_price)}</dd>
                <dt className="text-[var(--paper-muted)]">มูลค่า</dt>
                <dd className="num"><Field field="amount_ex_vat" marks={marks} line={k}>{money(l.amount_ex_vat)}</Field></dd>
              </dl>
            ))}
          </div>
          <div className="hidden pt-2 pr-5 sm:block">
            <table className="w-full border-collapse text-[0.9375rem]">
              <thead>
                <tr className="border-b border-[var(--paper-rule)] text-left text-[0.75rem] text-[var(--paper-muted)]">
                  <th className="py-1.5 font-semibold">รายการ</th>
                  <th className="py-1.5 text-right font-semibold">จำนวน</th>
                  <th className="py-1.5 text-right font-semibold">ราคาต่อหน่วย</th>
                  <th className="py-1.5 text-right font-semibold">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l, k) => (
                  <tr key={k} className="border-b border-[var(--paper-rule)]">
                    <td className="py-3 pr-3"><Field field="item_desc" marks={marks} line={k}>{blank(l.item_desc)}</Field></td>
                    <td className="num py-3 text-right"><Field field="qty" marks={marks} line={k}>{blank(l.qty)}</Field></td>
                    <td className="num py-3 text-right">{money(l.unit_price)}</td>
                    <td className="num py-3 text-right"><Field field="amount_ex_vat" marks={marks} line={k}>{money(l.amount_ex_vat)}</Field></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="num grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 justify-self-end text-[0.9375rem]">
            <dt className="text-[var(--paper-muted)]">มูลค่าก่อนภาษี</dt>
            <dd className="text-right">{money(row.amount_ex_vat)}</dd>
            <dt className="text-[var(--paper-muted)]">ภาษีมูลค่าเพิ่ม {vatPct}%</dt>
            <dd className="text-right"><Field field="vat_amount" marks={marks}>{money(row.vat_amount)}</Field></dd>
            <dt className="border-t border-[var(--paper-rule)] pt-1 font-semibold">รวมทั้งสิ้น</dt>
            <dd className="border-t border-[var(--paper-rule)] pt-1 text-right font-semibold">{money(row.total)}</dd>
          </dl>
        </article>

        {/* the margin */}
        <aside aria-label="หมายเหตุจากการตรวจ" className="grid content-start gap-3 lg:sticky lg:top-4" aria-live="polite">
          {marks.length === 0 ? (
            <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
              <span className="font-semibold text-pass">ใบนี้ผ่านทุกข้อในชุดกฎนี้</span>
              <span className="text-[0.875rem] text-muted">ไม่มีจุดที่ต้องแก้ ข้อที่ไม่เกี่ยวกับใบนี้ (เช่น ผู้ซื้อไม่ได้จด VAT) ถูกข้ามไป</span>
            </div>
          ) : (
            marks.map((m) => (
              <section id={`note-${m.n}`} key={m.n} className={`note grid gap-2 rounded-lg border bg-surface p-4 ${m.verdict === 'fail' ? 'border-[var(--redpen-line)]' : 'border-[var(--expert-line)]'}`}>
                <header className="flex items-baseline gap-2">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold text-white ${m.verdict === 'fail' ? 'bg-[var(--redpen)]' : 'bg-[var(--expert-pen)]'}`}>{m.n}</span>
                  <span className={`font-semibold ${m.verdict === 'fail' ? 'text-[var(--redpen-text)]' : 'text-expert'}`}>{m.verdict === 'fail' ? 'ต้องแก้' : 'ถามผู้เชี่ยวชาญ'}</span>
                  <span className="num text-[0.8125rem] text-muted">{m.clause.id}</span>
                </header>
                <p className="text-[0.9375rem]">{m.evidence}</p>
                {m.fix && <p className="text-[0.875rem] text-muted"><span className="font-semibold text-ink">วิธีแก้</span> {m.fix}</p>}
                <details className="text-[0.8125rem]">
                  <summary className="cursor-pointer text-muted">{m.clause.source}</summary>
                  <blockquote className="mt-1 border-l-2 border-line pl-3">“{m.clause.quote}”</blockquote>
                </details>
              </section>
            ))
          )}
          <p className="text-[0.75rem] text-muted">ใช้ปุ่มลูกศร ← → บนคีย์บอร์ดเพื่อเปลี่ยนใบได้</p>
        </aside>
      </div>
    </div>
  )
}
