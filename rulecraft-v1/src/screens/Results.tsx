// Step 3. A one-line verdict and an issue summary first (GOV.UK error summary, NN/g "lead with the
// remedy"), then one workspace with tabs: issues grouped by rule, the invoice list, one invoice on paper,
// and the ภ.พ.30 summary. Rule codes stay out of the way; legal text sits behind "ทำไม".
import { useEffect, useRef, useState } from 'react'
import { Audit } from '../Audit'
import type { FilingRow } from '../io/filing'
import type { Gap } from '../io/sequence'
import { questionFor } from '../io/issues'
import type { Issue } from '../io/issues'
import { lineRange } from '../io/report'
import type { Invoice, RowResults } from '../rules/engine'
import { parseAmount } from '../rules/normalize'
import { filingDeadlines, thaiDate, thaiMonth } from '../rules/rates'
import { Badge, StatusIcon } from '../ui'
import { LEVEL, PROBLEM_LEVELS, baht, worst } from '../levels'
import type { Level } from '../levels'
import { Filing, ManualChecklist } from './Extras'

export type Tab = 'issues' | 'list' | 'invoice' | 'filing'

export function Results(p: {
  fileName: string; invoices: Invoice[]; results: RowResults[]; issues: Issue[]; filing: FilingRow[]; taxMonth?: string; vatPct: number
  gaps: Gap[]; unknownBuyerVat: number; readInfo: string; ruleCount: number
  tab: Tab; setTab: (t: Tab) => void; invoiceIdx: number; setInvoiceIdx: (i: number) => void
  onMapping: () => void; onFixList: () => void; onAnnotated: () => void; onPrint: () => void
}) {
  const { invoices, results, issues } = p
  const levels = results.map((r) => worst(Object.values(r).map((x) => x?.verdict)))
  const count = (l: Level) => levels.filter((x) => x === l).length
  const nFailInv = count('fail')
  const byLevel = (l: Issue['level']) => issues.filter((x) => x.level === l)
  const due = p.taxMonth ? filingDeadlines(p.taxMonth) : null
  const vatMonth = p.filing.filter((r) => !p.taxMonth || r.month === p.taxMonth).reduce((n, r) => n + r.vat, 0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])

  const openInvoice = (i: number) => { p.setInvoiceIdx(i); p.setTab('invoice'); window.scrollTo({ top: 0 }) }
  const goIssue = (id: string) => {
    p.setTab('issues')
    requestAnimationFrame(() => { const el = document.getElementById(`issue-${id}`); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }) })
  }

  const fail = byLevel('fail'), warn = byLevel('warn'), expert = byLevel('needs_expert')
  const verdictLevel: Level = fail.length ? 'fail' : warn.length ? 'warn' : expert.length ? 'needs_expert' : 'pass'
  const title = fail.length
    ? `ต้องแก้ ${fail.length} เรื่อง ใน ${nFailInv} ใบ ก่อนยื่น ภ.พ.30`
    : warn.length || expert.length
      ? `ไม่มีเรื่องที่ต้องแก้ · ควรตรวจสอบ ${warn.length + expert.length} เรื่อง`
      : `ทั้ง ${invoices.length} ใบผ่านทุกข้อตรวจ`

  return (
    <div className="grid gap-6">
      <p className="sr-only" aria-live="polite">ตรวจเสร็จ ต้องแก้ {fail.length} เรื่อง ควรตรวจสอบ {warn.length} เรื่อง ถามผู้เชี่ยวชาญ {expert.length} เรื่อง</p>

      {/* Verdict + issue summary */}
      <section className={`card grid gap-5 border-l-[6px] p-5 sm:p-6 ${verdictLevel === 'fail' ? 'border-l-fail' : verdictLevel === 'pass' ? 'border-l-pass' : 'border-l-warn'}`} aria-labelledby="verdict">
        <div className="grid gap-2">
          <h1 id="verdict" ref={heading} tabIndex={-1} className={`flex items-start gap-3 text-[1.5rem] leading-[1.4] outline-none sm:text-[1.75rem] ${LEVEL[verdictLevel].text}`}>
            <StatusIcon level={verdictLevel} size={30} className="mt-1" />
            <span>{title}</span>
          </h1>
          <p className="text-ink-2">
            ตรวจ {invoices.length} ใบจาก {p.fileName}
            {p.taxMonth && <> · ภาษีขายเดือน {thaiMonth(p.taxMonth)} <span className="num font-semibold text-ink">{baht(vatMonth)}</span> บาท</>}
            {due && <> · ยื่นภายใน {thaiDate(due.paper)}{due.online ? ` (ออนไลน์ ${thaiDate(due.online)})` : ''}</>}
          </p>
        </div>

        {issues.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="จำนวนเรื่องตามระดับ">
            {([['fail', fail], ['warn', warn], ['needs_expert', expert]] as const).map(([l, list]) => (
              <li key={l}>
                <button type="button" disabled={!list.length} onClick={() => list.length && goIssue(list[0].id)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold ${list.length ? `${LEVEL[l].border} ${LEVEL[l].bg} ${LEVEL[l].text} hover:brightness-95` : 'border-line text-ink-3'}`}>
                  <StatusIcon level={l} size={18} />{LEVEL[l].label}<span className="num">{list.length} เรื่อง</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">ผ่านทั้ง {p.ruleCount} ข้อตรวจ ทั้งรายการที่มาตรา 86/4 กำหนด สาขาตามประกาศฯ ฉบับที่ 199 ยอดเงิน อัตราภาษี และวันที่ ยังควรดู “ตรวจด้วยตา” ด้านล่างก่อนส่งใบ</p>
        )}

        <div className="flex flex-wrap gap-2">
          {fail.length > 0 && <button type="button" className="btn btn-primary" onClick={() => goIssue(fail[0].id)}>เริ่มแก้เรื่องแรก</button>}
          <button type="button" className={`btn ${fail.length ? 'btn-secondary' : 'btn-primary'}`} onClick={p.onFixList} disabled={issues.length === 0}>ดาวน์โหลดรายการที่ต้องแก้</button>
          <button type="button" className="btn btn-secondary" onClick={p.onAnnotated}>ไฟล์เดิมพร้อมผลตรวจ (.xlsx)</button>
          <button type="button" className="btn btn-secondary" onClick={p.onPrint}>พิมพ์ / PDF</button>
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-3">
        <span>{p.readInfo}</span>
        <button type="button" onClick={p.onMapping} className="link">ตรวจการจับคู่คอลัมน์</button>
      </p>

      {/* Workspace tabs */}
      <div role="tablist" aria-label="มุมมองผลตรวจ" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {([
          ['issues', 'เรื่องที่ต้องดู', issues.length],
          ['list', 'รายการใบ', invoices.length],
          ['invoice', 'ดูทีละใบ', null],
          ['filing', 'สรุป ภ.พ.30', null],
        ] as const).map(([id, label, n]) => (
          <button key={id} role="tab" type="button" id={`tab-${id}`} aria-selected={p.tab === id} aria-controls={`panel-${id}`} onClick={() => p.setTab(id)}
            className={`relative flex min-h-12 shrink-0 items-center gap-2 px-3 font-medium whitespace-nowrap ${p.tab === id ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
            {label}{n !== null && <span className="num rounded-full bg-sunken px-2 text-[0.875rem]">{n}</span>}
            {p.tab === id && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-action" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${p.tab}`} aria-labelledby={`tab-${p.tab}`} className="grid gap-5">
        {p.tab === 'issues' && (
          <>
            {p.unknownBuyerVat > 0 && (
              <Note level="warn" title={`${p.unknownBuyerVat} ใบไม่บอกว่าผู้ซื้อจด VAT หรือไม่`}>
                ใบเหล่านี้ไม่มีทั้งช่อง “ผู้ซื้อจด VAT” และเลขผู้เสียภาษีผู้ซื้อ จึงตรวจเรื่องเลขและสาขาของผู้ซื้อไม่ได้ ถ้าผู้ซื้อจด VAT ใบนั้นต้องมีเลขผู้เสียภาษีและสาขาของผู้ซื้อ (ประกาศฯ ฉบับที่ 199) แนะนำให้เพิ่มคอลัมน์ “ผู้ซื้อจด VAT” ในไฟล์
              </Note>
            )}
            {issues.map((x) => <IssueCard key={x.id} issue={x} invoices={invoices} onOpen={openInvoice} />)}
            {issues.length === 0 && <Note level="pass" title="ไม่พบเรื่องที่ต้องแก้หรือต้องตรวจสอบ">ทุกใบในไฟล์ผ่านข้อตรวจที่เกี่ยวข้องทั้งหมด</Note>}
            {p.gaps.length > 0 && (
              <details className="card p-5">
                <summary className="cursor-pointer font-semibold">เลขที่ใบกำกับภาษีข้ามไป {p.gaps.reduce((n, g) => n + g.missing.length + g.more, 0)} เลข <span className="font-normal text-ink-3">ข้อมูลเท่านั้น ไม่ใช่ความผิด</span></summary>
                <ul className="mt-3 grid gap-1 text-ink-2">{p.gaps.map((g) => (<li key={g.series}><span className="num">{g.series}</span>: {g.missing.join(', ')}{g.more ? ` และอีก ${g.more} เลข` : ''}</li>))}</ul>
                <p className="mt-2 text-[0.875rem] text-ink-3">กฎหมายไม่ได้บังคับให้เลขที่ต่อเนื่อง และใช้หลายชุดพร้อมกันได้ ควรตรวจว่าเลขที่หายไปเป็นใบที่ยกเลิก หรือเป็นใบที่ไม่ได้อยู่ในไฟล์นี้</p>
              </details>
            )}
            <ManualChecklist fileName={p.fileName} />
          </>
        )}
        {p.tab === 'list' && <InvoiceList invoices={invoices} results={results} levels={levels} onOpen={openInvoice} />}
        {p.tab === 'invoice' && <Audit invoices={invoices} results={results} index={p.invoiceIdx} setIndex={p.setInvoiceIdx} vatPct={p.vatPct} onMatrix={() => p.setTab('list')} />}
        {p.tab === 'filing' && <Filing rows={p.filing} taxMonth={p.taxMonth} />}
      </div>
    </div>
  )
}

function Note({ level, title, children }: { level: Level; title: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${LEVEL[level].border} ${LEVEL[level].bg}`}>
      <StatusIcon level={level} size={20} className={`mt-0.5 ${LEVEL[level].text}`} />
      <div className="grid gap-1"><p className="font-semibold">{title}</p><p className="text-[0.9375rem] text-ink-2">{children}</p></div>
    </div>
  )
}

const SHOW = 5

function IssueCard({ issue, invoices, onOpen }: { issue: Issue; invoices: Invoice[]; onOpen: (i: number) => void }) {
  const [all, setAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const fixes = [...new Set(issue.hits.map((h) => h.fix).filter(Boolean))]
  const hits = all ? issue.hits : issue.hits.slice(0, SHOW)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questionFor(issue, invoices))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <article id={`issue-${issue.id}`} tabIndex={-1} className={`issue card grid gap-4 border-l-[5px] p-5 outline-none ${issue.level === 'fail' ? 'border-l-fail' : issue.level === 'warn' ? 'border-l-warn' : 'border-l-expert'}`}>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge level={issue.level} />
          <span className="text-[0.9375rem] text-ink-2">พบใน {issue.hits.length} ใบ</span>
        </div>
        <h2 className="text-[1.1875rem] leading-[1.45]">{issue.title}</h2>
      </div>
      {fixes.length > 0 && (
        <div className="grid gap-1 rounded-lg bg-sunken px-4 py-3">
          <span className="text-[0.875rem] font-semibold text-ink-2">วิธีแก้</span>
          {fixes.slice(0, 3).map((f) => (<p key={f}>{f}</p>))}
        </div>
      )}
      <ul className="grid divide-y divide-line rounded-lg border border-line">
        {hits.map((h, k) => {
          const inv = invoices[h.invoice]
          return (
            <li key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <span className="num font-semibold">{inv?.row.invoice_no || `ใบที่ ${h.invoice + 1}`}</span>
              <span className="text-[0.9375rem] text-ink-2">{h.evidence}<span className="text-ink-3"> · แถว {inv ? lineRange(inv.lineNos) : '-'}</span></span>
              <button type="button" onClick={() => onOpen(h.invoice)} className="btn btn-quiet justify-self-start sm:justify-self-end">ดูใบนี้</button>
            </li>
          )
        })}
      </ul>
      {issue.hits.length > SHOW && (
        <button type="button" onClick={() => setAll(!all)} className="btn btn-quiet justify-self-start">{all ? 'แสดงน้อยลง' : `แสดงอีก ${issue.hits.length - SHOW} ใบ`}</button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-[0.9375rem] text-action">ทำไมต้องแก้ · {issue.clause.source}</summary>
          <div className="mt-2 grid gap-2">
            <blockquote className="border-l-[3px] border-line-strong pl-3 font-[family-name:var(--font-doc)] text-[1.0625rem] leading-[1.75]">“{issue.clause.quote}”</blockquote>
            <p className="text-[0.875rem] text-ink-3">ข้อตรวจ <span lang="en">{issue.clause.id}</span> · ผลตรวจเป็นการตรวจตัวเองเบื้องต้น ไม่ใช่คำวินิจฉัยของกรมสรรพากร</p>
          </div>
        </details>
        {issue.level === 'needs_expert' && (
          <button type="button" onClick={copy} className="btn btn-secondary">{copied ? 'คัดลอกแล้ว' : 'คัดลอกคำถามถึงนักบัญชี'}</button>
        )}
      </div>
    </article>
  )
}

const FILTERS: (Level | 'all')[] = ['all', 'fail', 'warn', 'needs_expert', 'pass']

function InvoiceList({ invoices, results, levels, onOpen }: { invoices: Invoice[]; results: RowResults[]; levels: Level[]; onOpen: (i: number) => void }) {
  const [filter, setFilter] = useState<Level | 'all'>('all')
  const shown = invoices.map((x, i) => ({ x, i, l: levels[i] })).filter(({ l }) => filter === 'all' || l === filter || (filter === 'pass' && l === 'n/a'))
  const counts = (r: RowResults) => PROBLEM_LEVELS.map((l) => [l, Object.values(r).filter((v) => v?.verdict === l).length] as const).filter(([, n]) => n > 0)
  const money = (v: string) => { const n = parseAmount(v); return n === null ? v || '–' : baht(n) }
  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="กรองตามผลตรวจ" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f === 'all' ? invoices.length : levels.filter((l) => l === f || (f === 'pass' && l === 'n/a')).length
          const on = filter === f
          return (
            <button key={f} type="button" role="radio" aria-checked={on} onClick={() => setFilter(f)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-medium ${on ? 'border-action bg-action text-on-action' : 'border-line-strong bg-surface hover:bg-sunken'}`}>
              {f !== 'all' && <StatusIcon level={f} size={16} className={on ? '' : LEVEL[f].text} />}
              {f === 'all' ? 'ทั้งหมด' : LEVEL[f].label}<span className="num">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="card overflow-hidden">
        <table className="hidden w-full border-collapse text-[0.9375rem] md:table">
          <caption className="sr-only">ใบกำกับภาษีในไฟล์และผลตรวจ</caption>
          <thead className="bg-sunken text-left text-[0.875rem] text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">ผลตรวจ</th>
              <th scope="col" className="px-4 py-3 font-semibold">เลขที่</th>
              <th scope="col" className="px-4 py-3 font-semibold">วันที่</th>
              <th scope="col" className="px-4 py-3 font-semibold">ผู้ซื้อ</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">มูลค่า (บาท)</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">ภาษี (บาท)</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">เปิด</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ x, i, l }) => (
              <tr key={i} className="border-t border-line hover:bg-sunken">
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{l === 'pass' || l === 'n/a' ? <Badge level="pass" compact /> : counts(results[i]).map(([lv, n]) => <Badge key={lv} level={lv} compact>{LEVEL[lv].label} {n}</Badge>)}</div></td>
                <th scope="row" className="num px-4 py-3 text-left font-semibold">{x.row.invoice_no || '–'}</th>
                <td className="num px-4 py-3 whitespace-nowrap">{x.row.issue_date || '–'}</td>
                <td className="max-w-[16rem] truncate px-4 py-3" title={x.row.buyer_name}>{x.row.buyer_name || '–'}</td>
                <td className="num px-4 py-3 text-right">{money(x.row.amount_ex_vat)}</td>
                <td className="num px-4 py-3 text-right">{money(x.row.vat_amount)}</td>
                <td className="px-4 py-3 text-right"><button type="button" onClick={() => onOpen(i)} className="btn btn-quiet" aria-label={`ดูใบ ${x.row.invoice_no || i + 1}`}>ดูใบนี้</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-line md:hidden">
          {shown.map(({ x, i, l }) => (
            <li key={i}>
              <button type="button" onClick={() => onOpen(i)} className="grid w-full gap-1 px-4 py-3 text-left hover:bg-sunken">
                <span className="flex items-center justify-between gap-2"><span className="num font-semibold">{x.row.invoice_no || `ใบที่ ${i + 1}`}</span><span className="num text-ink-2">{money(x.row.amount_ex_vat)}</span></span>
                <span className="truncate text-[0.9375rem] text-ink-2">{x.row.issue_date} · {x.row.buyer_name}</span>
                <span className="flex flex-wrap gap-1">{l === 'pass' || l === 'n/a' ? <Badge level="pass" compact /> : counts(results[i]).map(([lv, n]) => <Badge key={lv} level={lv} compact>{LEVEL[lv].label} {n}</Badge>)}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="p-6 text-center text-ink-2">ไม่มีใบในกลุ่มนี้</p>}
      </div>
    </div>
  )
}
