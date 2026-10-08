import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Audit } from './Audit'
import { ACCEPT, detectHeaderRow, parseCsv, readFile, toTable } from './io/table'
import type { Sheet } from './io/table'
import { download, downloadTemplate, fixListCsv, lineRange, problems } from './io/report'
import { branchLabel, filingSummary, likelyTaxMonth } from './io/filing'
import { numberGaps } from './io/sequence'
import type { FilingRow } from './io/filing'
import { filingDeadlines, thaiDate, thaiMonth } from './rules/rates'
import checksSource from './rules/checks.ts?raw'
import type { Verdict } from './rules/checks'
import { CLAUSES, PACKS } from './rules/clauses'
import type { ClauseId } from './rules/clauses'
import { applyMapping, autoMap, FIELD_LABEL, FIELDS, groupInvoices, runInvoices, summary } from './rules/engine'
import type { Field } from './rules/engine'
import factoryCsv from './samples/factory.csv?raw'

const PACK = 'v2026' as const

const V: Record<Verdict, { label: string; short: string; cls: string }> = {
  pass: { label: 'ผ่าน', short: '✓', cls: 'bg-pass-bg text-pass' },
  fail: { label: 'ต้องแก้', short: '✗', cls: 'bg-fail-bg text-fail' },
  'n/a': { label: 'ไม่เกี่ยว', short: '–', cls: 'bg-na-bg text-na' },
  needs_expert: { label: 'ถามผู้เชี่ยวชาญ', short: '?', cls: 'bg-expert-bg text-expert' },
  warn: { label: 'ควรตรวจสอบ', short: '!', cls: 'bg-expert-bg text-expert' },
}
const STATUS: Record<string, string> = { checkable: 'ตรวจด้วยข้อมูลได้', partial: 'ตรวจได้บางส่วน', needs_expert: 'บางกรณีต้องให้ผู้เชี่ยวชาญยืนยัน' }
/** Fields an invoice cannot be checked without. Others fall back to n/a or fail visibly. */
const KEY_FIELDS: Field[] = ['invoice_no', 'issue_date', 'seller_tax_id', 'buyer_name', 'amount_ex_vat', 'vat_amount']
const OPTIONAL: Field[] = ['book_no', 'unit_price', 'total']

/** The source of one clause's check, cut from checks.ts for display. */
function codeFor(id: ClauseId): string {
  const start = checksSource.indexOf(`'${id}':`)
  if (start < 0) return ''
  const rest = checksSource.slice(start + 1)
  const next = rest.search(/\n {2}'TI-\d+b?':/)
  return checksSource.slice(start, next < 0 ? checksSource.lastIndexOf('}') : start + 1 + next).trimEnd()
}

// Column mappings are remembered per header layout, so next month's export maps itself.
const MAP_KEY = (headers: string[]) => `rulecraft.mapping.v1:${headers.join('\u0001')}`
function loadMapping(headers: string[]): Partial<Record<Field, string>> {
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_KEY(headers)) ?? '{}') as Partial<Record<Field, string>>
    return Object.fromEntries(Object.entries(saved).filter(([, h]) => h === '' || headers.includes(h as string)))
  } catch {
    return {}
  }
}
function saveMapping(headers: string[], m: Partial<Record<Field, string>>) {
  try {
    localStorage.setItem(MAP_KEY(headers), JSON.stringify(m))
  } catch {
    /* storage unavailable: the mapping just isn't remembered */
  }
}

type Step = 'upload' | 'map' | 'results' | 'rules' | 'help'
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: '1 · เลือกไฟล์' },
  { id: 'map', label: '2 · จับคู่คอลัมน์' },
  { id: 'results', label: '3 · ผลตรวจ' },
]
const isFlow = (s: Step) => s === 'upload' || s === 'map' || s === 'results'
const PROBLEM: Verdict[] = ['fail', 'needs_expert', 'warn']
const hasProblem = (r: Record<string, { verdict: Verdict } | undefined>) => Object.values(r).some((x) => x && PROBLEM.includes(x.verdict))

function Chip({ v, title }: { v: Verdict; title?: string }) {
  return (
    <span title={title ?? V[v].label} className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[0.8125rem] font-semibold ${V[v].cls}`}>
      {V[v].short}
    </span>
  )
}
function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[1.25rem] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
const btn = 'inline-flex h-10 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium'
const btnPrimary = `${btn} bg-action text-on-action`
const btnGhost = `${btn} border border-line bg-raise hover:border-ink`

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [source, setSource] = useState<{ name: string; sheets: Sheet[] } | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [vatPct, setVatPct] = useState(7)
  const [taxMonthPick, setTaxMonthPick] = useState<string | null>(null)
  const [edits, setEdits] = useState<{ key: string; m: Partial<Record<Field, string>> } | null>(null)
  const [view, setView] = useState<'audit' | 'matrix'>('audit')
  const [onlyProblems, setOnlyProblems] = useState(true)
  const [invoiceIdx, setInvoiceIdx] = useState(0)
  const [cell, setCell] = useState<{ inv: number; clause: ClauseId } | null>(null)

  const sheet = source?.sheets[sheetIdx]
  const cells = useMemo(() => sheet?.cells ?? [], [sheet])
  const autoHeader = useMemo(() => detectHeaderRow(cells), [cells])
  const table = useMemo(() => toTable(cells, headerRow ?? autoHeader), [cells, headerRow, autoHeader])
  const headersKey = table.headers.join('\u0001')
  // User edits belong to one header layout; a new layout starts from what was saved for it.
  const mappingEdits = useMemo(() => (edits?.key === headersKey ? edits.m : loadMapping(table.headers)), [edits, headersKey, table.headers])
  const setMappingEdits = (m: Partial<Record<Field, string>>) => setEdits({ key: headersKey, m })
  const mapping = useMemo(() => ({ ...autoMap(table.headers), ...mappingEdits }) as Record<Field, string>, [table.headers, mappingEdits])
  const vatRate = vatPct / 100
  const rows = useMemo(() => applyMapping(table.records, mapping), [table, mapping])
  const invoices = useMemo(() => groupInvoices(rows, vatRate, table.lineNos), [rows, vatRate, table.lineNos])
  const taxMonth = taxMonthPick ?? likelyTaxMonth(invoices) ?? undefined
  const results = useMemo(() => runInvoices(invoices, PACK, vatRate, { taxMonth }), [invoices, vatRate, taxMonth])
  const filing = useMemo(() => filingSummary(invoices, results), [invoices, results])
  const gaps = useMemo(() => numberGaps(invoices), [invoices])
  const sum = useMemo(() => summary(results), [results])
  const probs = useMemo(() => problems(results), [results])
  const activeClauses = CLAUSES.filter((c) => (PACKS[PACK].clauses as readonly string[]).includes(c.id))
  const unmappedKey = KEY_FIELDS.filter((f) => !mapping[f])
  const unmappedOther = FIELDS.filter((f) => !mapping[f] && !KEY_FIELDS.includes(f) && !OPTIONAL.includes(f))
  const passCount = sum.rows - results.filter(hasProblem).length
  // Without a VAT-registrant column or buyer TIN, TI-09/TI-10 cannot apply to those invoices; say so once for the file.
  const unknownBuyerVat = invoices.filter((x) => !x.row.buyer_is_vat_registrant?.trim() && !x.row.buyer_tax_id?.trim()).length

  const open = (name: string, sheets: Sheet[]) => {
    setSource({ name, sheets })
    setSheetIdx(Math.max(0, sheets.findIndex((s) => s.cells.some((r) => r.some((v) => v.trim())))))
    setHeaderRow(null)
    setTaxMonthPick(null)
    setInvoiceIdx(0)
    setCell(null)
    setView('audit')
    setError(null)
    setStep('map')
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      open(file.name, await readFile(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อ่านไฟล์ไม่ได้ ลองเลือกไฟล์ใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }
  const toResults = () => {
    saveMapping(table.headers, mappingEdits)
    setStep('results')
  }

  const visible = results.map((r, i) => ({ r, i })).filter(({ r }) => !onlyProblems || hasProblem(r))
  const selected = cell ? results[cell.inv]?.[cell.clause] : undefined
  const selectedClause = cell ? CLAUSES.find((c) => c.id === cell.clause) : undefined
  const baseName = (source?.name ?? 'ผลตรวจ').replace(/\.[^.]+$/, '')
  const menu = (id: Step | 'flow', label: string) => {
    const on = id === 'flow' ? isFlow(step) : step === id
    return (
      <button type="button" onClick={() => setStep(id === 'flow' ? (source ? 'map' : 'upload') : id)} aria-current={on ? 'page' : undefined}
        className={`h-9 rounded-md px-3 ${on ? 'bg-panel font-medium' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
    )
  }

  return (
    <div className="mx-auto grid max-w-[78rem] grid-cols-1 gap-6 px-4 py-6 sm:px-6">
      <header className="screen-only flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-[1.5rem] font-bold tracking-[-0.01em]">Rulecraft</h1>
            <span className="text-ink-2">ตรวจใบกำกับภาษีขายก่อนยื่นภาษี</span>
          </div>
          <p className="text-[0.8125rem] text-ink-3">ไฟล์ของคุณถูกตรวจในเบราว์เซอร์นี้เท่านั้น ไม่มีการอัปโหลดไปที่ใด</p>
        </div>
        <nav aria-label="เมนู" className="flex gap-1 text-[0.875rem]">
          {menu('flow', 'ตรวจไฟล์')}
          {menu('rules', 'ข้อกำหนดที่ตรวจ')}
          {menu('help', 'วิธีใช้')}
        </nav>
      </header>

      {isFlow(step) && (
        <nav aria-label="ขั้นตอน" className="screen-only flex gap-1 overflow-x-auto border-b border-line">
          {STEPS.map((t) => (
            <button key={t.id} type="button" disabled={t.id !== 'upload' && !source} aria-current={step === t.id ? 'step' : undefined}
              onClick={() => (t.id === 'results' ? toResults() : setStep(t.id))}
              className={`relative h-11 shrink-0 px-3 text-[0.9375rem] font-medium whitespace-nowrap disabled:opacity-40 ${step === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
              {t.label}
              {step === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] bg-accent" />}
            </button>
          ))}
        </nav>
      )}

      {step === 'upload' && (
        <div className="screen-only grid gap-6">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]) }}
            className={`grid cursor-pointer justify-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center ${dragging ? 'border-action bg-panel' : 'border-line bg-raise hover:border-ink'}`}>
            <span className="text-[1.25rem] font-semibold">{busy ? 'กำลังอ่านไฟล์…' : 'ลากไฟล์รายงานภาษีขายมาวางที่นี่'}</span>
            <span className="max-w-[56ch] text-ink-2">หรือกดเพื่อเลือกไฟล์ รองรับ Excel (.xlsx, .xls) และ CSV ที่ส่งออกจากโปรแกรมบัญชี เช่น Express, FlowAccount, PEAK หรือไฟล์ที่ทำเอง</span>
            <span className={btnPrimary}>เลือกไฟล์</span>
            <input id="file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {error && <p role="alert" className="rounded-lg bg-fail-bg px-3 py-2 text-[0.9375rem] text-fail">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid content-start gap-2 rounded-xl border border-line bg-raise p-4">
              <span className="font-semibold">ยังไม่มีไฟล์?</span>
              <span className="text-[0.875rem] text-ink-2">ลองกับรายงานภาษีขายของโรงงานตัวอย่าง 8 ใบ ที่ใส่จุดผิดไว้ให้ดู</span>
              <button type="button" onClick={() => open('โรงงานตัวอย่าง.csv', [{ name: 'ตัวอย่าง', cells: parseCsv(factoryCsv) }])} className={`${btnGhost} justify-self-start`}>ลองด้วยไฟล์ตัวอย่าง</button>
            </div>
            <div className="grid content-start gap-2 rounded-xl border border-line bg-raise p-4">
              <span className="font-semibold">ทำไฟล์เอง</span>
              <span className="text-[0.875rem] text-ink-2">ดาวน์โหลดแม่แบบ Excel ที่มีหัวคอลัมน์ครบ หนึ่งแถวต่อหนึ่งรายการสินค้า</span>
              <button type="button" onClick={downloadTemplate} className={`${btnGhost} justify-self-start`}>ดาวน์โหลดแม่แบบ</button>
            </div>
            <div className="grid content-start gap-2 rounded-xl border border-line bg-raise p-4">
              <span className="font-semibold">ตรวจอะไรบ้าง</span>
              <span className="text-[0.875rem] text-ink-2">รายการที่ต้องมีบนใบกำกับภาษีเต็มรูปตามมาตรา 86/4 และประกาศอธิบดีฯ ฉบับที่ 199 รวม {activeClauses.length} ข้อ</span>
              <button type="button" onClick={() => setStep('rules')} className={`${btnGhost} justify-self-start`}>ดูข้อกำหนด</button>
            </div>
          </div>
        </div>
      )}

      {step === 'map' && source && (
        <Section title="จับคู่คอลัมน์" aside={<span className="text-[0.8125rem] text-ink-3">{source.name} · {table.records.length} แถว · {invoices.length} ใบ</span>}>
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-raise p-4">
            {source.sheets.length > 1 && (
              <label className="grid gap-1">
                <span className="text-[0.8125rem] font-semibold text-ink-2">ชีต</span>
                <select id="sheet" value={sheetIdx} onChange={(e) => { setSheetIdx(Number(e.target.value)); setHeaderRow(null) }} className="h-9 rounded-lg border border-line bg-paper px-2">
                  {source.sheets.map((s, k) => (<option key={k} value={k}>{s.name}</option>))}
                </select>
              </label>
            )}
            <label className="grid gap-1">
              <span className="text-[0.8125rem] font-semibold text-ink-2">หัวคอลัมน์อยู่แถวที่</span>
              <input id="header-row" type="number" min={1} max={Math.max(cells.length, 1)} value={(headerRow ?? autoHeader) + 1}
                onChange={(e) => setHeaderRow(Math.min(Math.max((Number(e.target.value) || 1) - 1, 0), Math.max(cells.length - 1, 0)))}
                className="num h-9 w-20 rounded-lg border border-line bg-paper px-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.8125rem] font-semibold text-ink-2">เดือนภาษีที่จะยื่น</span>
              <input id="tax-month" type="month" value={taxMonth ?? ''} onChange={(e) => setTaxMonthPick(e.target.value || null)}
                className="num h-9 rounded-lg border border-line bg-paper px-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.8125rem] font-semibold text-ink-2">อัตรา VAT (%)</span>
              <input id="vat" type="number" min={0} max={20} step={0.5} value={vatPct} onChange={(e) => setVatPct(Number(e.target.value) || 0)}
                className="num h-9 w-20 rounded-lg border border-line bg-paper px-2" />
            </label>
            <p className="min-w-[16rem] flex-1 text-[0.8125rem] text-ink-3">ระบบเดาว่าคอลัมน์ไหนคือข้อมูลอะไร แก้ได้ถ้าเดาผิด และจะจำไว้ใช้กับไฟล์หน้าตาเดียวกันครั้งหน้า แถวที่มีเลขที่ใบกำกับและรายละเอียดหัวใบเหมือนกันจะรวมเป็นใบเดียว</p>
          </div>
          {unmappedKey.length > 0 && (
            <p role="alert" className="rounded-lg bg-fail-bg px-3 py-2 text-[0.875rem] text-fail">ยังไม่ได้จับคู่ช่องสำคัญ: {unmappedKey.map((f) => FIELD_LABEL[f]).join(', ')} ใบส่วนใหญ่จะไม่ผ่านจนกว่าจะจับคู่</p>
          )}
          {unmappedOther.length > 0 && (
            <p className="rounded-lg bg-expert-bg px-3 py-2 text-[0.875rem] text-expert">ไม่มีในไฟล์ {unmappedOther.length} ช่อง: {unmappedOther.map((f) => FIELD_LABEL[f]).join(', ')} ข้อที่ใช้ช่องเหล่านี้จะได้ผล “ต้องแก้” หรือ “ไม่เกี่ยว” ไม่มีทางผ่านเงียบๆ</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f} className="grid min-w-0 gap-1 rounded-lg border border-line bg-raise p-3">
                <span className="flex items-baseline justify-between gap-2 text-[0.8125rem] font-semibold">
                  {FIELD_LABEL[f]}
                  {OPTIONAL.includes(f) && <span className="font-normal text-ink-3">ไม่บังคับ</span>}
                </span>
                <select id={`map-${f}`} value={mapping[f]} onChange={(e) => setMappingEdits({ ...mappingEdits, [f]: e.target.value })} className="h-9 min-w-0 rounded-lg border border-line bg-paper px-2 text-[0.875rem]">
                  <option value="">ไม่มีในไฟล์</option>
                  {table.headers.map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
                <span className="truncate text-[0.75rem] text-ink-3" title={rows[0]?.[f]}>{mapping[f] ? `เช่น ${rows[0]?.[f] || '(ว่าง)'}` : ' '}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={toResults} className={btnPrimary}>ตรวจ {invoices.length} ใบ</button>
            <button type="button" onClick={() => setStep('upload')} className={btnGhost}>เลือกไฟล์อื่น</button>
          </div>
        </Section>
      )}

      {step === 'results' && source && (
        <>
          <div className="screen-only grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat n={sum.rows} label="ใบทั้งหมด" />
              <Stat n={passCount} label="ผ่านทุกข้อ" cls="text-pass" />
              <Stat n={sum.rowsWithFail} label="มีจุดต้องแก้" cls="text-fail" />
              <Stat n={sum.rowsNeedExpert} label="ควรตรวจสอบเพิ่ม" cls="text-expert" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={probs.length === 0} onClick={() => download(`รายการต้องแก้-${baseName}.csv`, fixListCsv(invoices, results))} className={`${btnPrimary} disabled:opacity-40`}>ดาวน์โหลดรายการที่ต้องแก้ (Excel)</button>
              <button type="button" onClick={() => window.print()} className={btnGhost}>พิมพ์ / บันทึกเป็น PDF</button>
              <span className="text-[0.8125rem] text-ink-3">{probs.length} จุด จาก {source.name}</span>
            </div>
            {unknownBuyerVat > 0 && (
              <p className="rounded-lg bg-expert-bg px-3 py-2 text-[0.875rem] text-expert">{unknownBuyerVat} ใบไม่มีทั้งข้อมูลว่าผู้ซื้อจด VAT และเลขผู้เสียภาษีผู้ซื้อ จึงยังไม่ได้ตรวจ TI-09 และ TI-10 ถ้าผู้ซื้อรายใดจด VAT ใบนั้นต้องมีเลขผู้เสียภาษีและสาขาของผู้ซื้อ (ประกาศอธิบดีฯ ฉบับที่ 199) แนะนำให้เพิ่มคอลัมน์ “ผู้ซื้อจด VAT” ในไฟล์</p>
            )}
            {gaps.length > 0 && (
              <details className="rounded-lg border border-line bg-raise px-3 py-2 text-[0.875rem]">
                <summary className="cursor-pointer">เลขที่ใบกำกับภาษีข้ามไป {gaps.reduce((n, g) => n + g.missing.length + g.more, 0)} เลข (ข้อมูลเท่านั้น ไม่ใช่ความผิด)</summary>
                <ul className="mt-2 grid gap-1 text-ink-2">
                  {gaps.map((g) => (<li key={g.series}><span className="num">{g.series}</span>: {g.missing.join(', ')}{g.more ? ` และอีก ${g.more} เลข` : ''}</li>))}
                </ul>
                <p className="mt-2 text-[0.8125rem] text-ink-3">กฎหมายไม่ได้บังคับให้เลขที่ต่อเนื่อง และใช้หลายชุดพร้อมกันได้ ควรตรวจว่าเลขที่หายไปเป็นใบที่ยกเลิก หรือเป็นใบที่ไม่ได้อยู่ในไฟล์นี้</p>
              </details>
            )}
            {sum.rows > 0 && (
              <div className="flex flex-wrap gap-2">
                {sum.byClause.filter((b) => b.active && (b.counts.fail || b.counts.needs_expert || b.counts.warn)).sort((a, b) => b.counts.fail - a.counts.fail).map(({ clause, counts }) => (
                  <span key={clause.id} className="rounded-lg border border-line bg-raise px-3 py-1.5 text-[0.8125rem]">
                    <span className="num font-semibold">{clause.id}</span> {clause.plain}
                    {counts.fail > 0 && <span className="num text-fail"> · {counts.fail} ใบ</span>}
                    {counts.needs_expert + counts.warn > 0 && <span className="num text-expert"> · ตรวจสอบ {counts.needs_expert + counts.warn}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          <Filing rows={filing} taxMonth={taxMonth} />

          <div className="screen-only">
            {view === 'audit' ? (
              <Audit invoices={invoices} results={results} index={invoiceIdx} setIndex={setInvoiceIdx} vatPct={vatPct} onMatrix={() => setView('matrix')} />
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-[0.875rem]">
                    <input id="only" type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> แสดงเฉพาะใบที่มีปัญหา
                  </label>
                  <button type="button" onClick={() => setView('audit')} className="h-9 rounded-md bg-action px-3 text-[0.875rem] font-medium text-on-action">กลับไปดูทีละใบ</button>
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="overflow-x-auto rounded-xl border border-line bg-raise">
                    <table className="w-full border-collapse text-[0.875rem]">
                      <thead>
                        <tr className="border-b border-line text-left">
                          <th className="sticky left-0 bg-raise p-2 font-semibold">ใบที่ / เลขที่</th>
                          {activeClauses.map((c) => (<th key={c.id} className="num p-2 text-center font-semibold" title={c.plain}>{c.id.replace('TI-', '')}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(({ r, i }) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            <th scope="row" className="num sticky left-0 bg-raise p-2 text-left font-normal whitespace-nowrap">
                              <button type="button" className="hover:underline" onClick={() => { setInvoiceIdx(i); setView('audit') }} title="เปิดใบนี้แบบเอกสาร">
                                <span className="text-ink-3">{i + 1}</span> {invoices[i].row.invoice_no || <em className="text-ink-3">(ไม่มีเลขที่)</em>}
                              </button>
                            </th>
                            {activeClauses.map((c) => {
                              const res = r[c.id]
                              const on = cell?.inv === i && cell.clause === c.id
                              return (
                                <td key={c.id} className="p-1 text-center">
                                  {res && (
                                    <button type="button" onClick={() => setCell({ inv: i, clause: c.id })} aria-label={`ใบที่ ${i + 1} ${c.id} ${V[res.verdict].label}`} className={`rounded-md ${on ? 'ring-2 ring-ink ring-offset-1 ring-offset-raise' : ''}`}>
                                      <Chip v={res.verdict} title={res.evidence} />
                                    </button>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visible.length === 0 && <p className="p-6 text-center text-ink-2">ไม่มีใบที่มีปัญหา ทุกใบผ่านทุกข้อ</p>}
                  </div>
                  <aside className="grid content-start gap-3 rounded-xl border border-line bg-raise p-4 lg:sticky lg:top-4" aria-live="polite">
                    {selected && selectedClause && cell ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Chip v={selected.verdict} />
                          <span className="font-semibold">{V[selected.verdict].label}</span>
                          <span className="num text-ink-3">· ใบที่ {cell.inv + 1} · {selectedClause.id}</span>
                        </div>
                        <p className="text-[0.9375rem]">{selected.evidence}</p>
                        {selected.fix && <p className="rounded-lg bg-panel p-3 text-[0.875rem]"><span className="font-semibold">วิธีแก้: </span>{selected.fix}</p>}
                        <p className="text-[0.8125rem] text-ink-3">แถว {lineRange(invoices[cell.inv].lineNos)} ในไฟล์</p>
                        <button type="button" onClick={() => { setInvoiceIdx(cell.inv); setView('audit') }} className="justify-self-start text-[0.875rem] font-medium text-accent underline">เปิดใบนี้แบบเอกสาร</button>
                        <div className="grid gap-1 border-t border-line pt-3 text-[0.8125rem]">
                          <span className="text-ink-3">{selectedClause.source}</span>
                          <blockquote className="border-l-2 border-line pl-3">“{selectedClause.quote}”</blockquote>
                        </div>
                      </>
                    ) : (
                      <p className="text-ink-2">กดช่องผลตรวจในตารางเพื่อดูเหตุผล ข้อความกฎหมาย และวิธีแก้</p>
                    )}
                    <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-[0.75rem] text-ink-2">
                      {(Object.keys(V) as Verdict[]).map((v) => (<span key={v} className="inline-flex items-center gap-1"><Chip v={v} /> {V[v].label}</span>))}
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </div>

          <PrintReport filing={filing} taxMonth={taxMonth} name={source.name} vatPct={vatPct} total={sum.rows} pass={passCount} fail={sum.rowsWithFail} expert={sum.rowsNeedExpert}
            items={probs.map((p) => ({ ...p, no: invoices[p.invoice].row.invoice_no, lines: lineRange(invoices[p.invoice].lineNos) }))} />
        </>
      )}

      {step === 'rules' && (
        <Section title="ข้อกำหนดที่ตรวจ" aside={<span className="text-[0.8125rem] text-ink-3">{PACKS[PACK].note}</span>}>
          <p className="max-w-[75ch] text-ink-2">แต่ละข้อมาจากข้อความกฎหมายจริง แปลเป็นโค้ดตรวจที่ให้ผลเหมือนเดิมทุกครั้ง ไม่มี AI ตัดสินผลตอนตรวจ กดแต่ละข้อเพื่อดูข้อความกฎหมายและโค้ดที่ใช้ตรวจ</p>
          <div className="grid gap-3">
            {activeClauses.map((c) => (
              <details key={c.id} className="rounded-xl border border-line bg-raise p-4">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num font-semibold">{c.id}</span>
                  <span className="font-medium">{c.plain}</span>
                  <span className={`rounded-md px-2 text-[0.75rem] leading-6 font-medium ${c.status === 'checkable' ? 'bg-pass-bg text-pass' : c.status === 'partial' ? 'bg-na-bg text-ink-2' : 'bg-expert-bg text-expert'}`}>{STATUS[c.status]}</span>
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="grid content-start gap-1 text-[0.875rem]">
                    <span className="text-ink-3">{c.source}</span>
                    <blockquote className="border-l-2 border-line pl-3">“{c.quote}”</blockquote>
                    <span className="text-ink-3">ช่องที่ใช้: {c.fields.map((f) => FIELD_LABEL[f as Field] ?? f).join(', ')}</span>
                  </div>
                  <details className="min-w-0 text-[0.8125rem]">
                    <summary className="cursor-pointer text-ink-3">ดูโค้ดที่ใช้ตรวจ</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-panel p-3 font-mono text-[0.75rem] leading-relaxed">{codeFor(c.id)}</pre>
                  </details>
                </div>
              </details>
            ))}
          </div>
          <p className="text-[0.8125rem] text-ink-3">ข้อความทางการ: <a className="underline" href="https://www.rd.go.th/5208.html" target="_blank" rel="noreferrer">มาตรา 86/4 ประมวลรัษฎากร</a> และ <a className="underline" href="https://rd.go.th/27982.html" target="_blank" rel="noreferrer">ประกาศอธิบดีกรมสรรพากรฯ ฉบับที่ 199</a></p>
        </Section>
      )}

      {step === 'help' && <Help />}

      <footer className="screen-only border-t border-line pt-4 text-[0.75rem] text-ink-3">
        ผลตรวจเป็นการตรวจตัวเองเบื้องต้น ไม่ใช่คำแนะนำทางกฎหมายหรือภาษี ข้อความกฎหมายฉบับทางการ ผู้สอบบัญชี หรือที่ปรึกษาภาษีของคุณเป็นผู้ตัดสิน
      </footer>
    </div>
  )
}

function Stat({ n, label, cls = '' }: { n: number; label: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-line bg-raise p-4">
      <div className={`num text-[1.75rem] leading-tight font-semibold ${cls}`}>{n.toLocaleString('th-TH')}</div>
      <div className="text-[0.875rem] text-ink-2">{label}</div>
    </div>
  )
}

function Help() {
  return (
    <div className="grid max-w-[75ch] gap-6">
      <Section title="วิธีใช้">
        <ol className="grid list-decimal gap-2 pl-5 text-ink-2">
          <li>ส่งออกรายงานภาษีขาย หรือรายการใบกำกับภาษีที่ออก จากโปรแกรมบัญชีเป็น Excel หรือ CSV จะเป็นหนึ่งแถวต่อหนึ่งรายการสินค้า หรือหนึ่งแถวต่อหนึ่งใบก็ได้</li>
          <li>ลากไฟล์มาวาง ระบบหาหัวคอลัมน์ให้เองแม้มีชื่อรายงานอยู่ด้านบน</li>
          <li>ตรวจการจับคู่คอลัมน์ แก้ถ้าเดาผิด ครั้งหน้าระบบจะจำให้</li>
          <li>ดูผลทีละใบหรือดูภาพรวมทุกใบ แล้วดาวน์โหลดรายการที่ต้องแก้ส่งให้ฝ่ายบัญชี</li>
        </ol>
      </Section>
      <Section title="ตรวจได้ และยังตรวจไม่ได้">
        <ul className="grid list-disc gap-2 pl-5 text-ink-2">
          <li>ตรวจว่ารายการที่กฎหมายกำหนดมีครบและถูกรูปแบบ เช่น เลขผู้เสียภาษี 13 หลักพร้อมเลขตรวจสอบ วันที่ที่มีอยู่จริง เลขที่ไม่ซ้ำ ยอดภาษีตรงกับอัตรา และสาขาตามประกาศฉบับที่ 199</li>
          <li>ไม่ได้ตรวจว่าเลขผู้เสียภาษีจดทะเบียน VAT จริง ให้ค้นในระบบของกรมสรรพากรเพิ่มเติม</li>
          <li>ยังไม่รองรับใบลดหนี้ ใบเพิ่มหนี้ ใบกำกับภาษีอย่างย่อ ใบกำกับภาษีอิเล็กทรอนิกส์ (e-Tax Invoice XML) และการขายอัตราภาษี 0% เช่นการส่งออก</li>
          <li>ตรวจจากข้อมูลในไฟล์ ไม่ได้ตรวจหน้าตาเอกสารจริง เช่น คำว่า “ใบกำกับภาษี” เห็นเด่นชัดหรือไม่</li>
          <li>ข้อที่ตีความได้หลายทางจะขึ้น “ถามผู้เชี่ยวชาญ” แทนการเดา</li>
        </ul>
      </Section>
      <Section title="ความเป็นส่วนตัว">
        <p className="text-ink-2">ไฟล์ถูกเปิดและตรวจในเบราว์เซอร์ของคุณเท่านั้น ไม่มีเซิร์ฟเวอร์ ไม่มีการส่งข้อมูลออก สิ่งเดียวที่เก็บไว้ในเครื่องคือการจับคู่คอลัมน์ เพื่อให้ไฟล์เดือนถัดไปจับคู่ได้เอง</p>
      </Section>
    </div>
  )
}

function PrintReport({ filing, taxMonth, name, vatPct, total, pass, fail, expert, items }: {
  filing: FilingRow[]; taxMonth?: string; name: string; vatPct: number; total: number; pass: number; fail: number; expert: number
  items: { invoice: number; no: string; lines: string; clauseId: string; verdict: 'fail' | 'needs_expert' | 'warn'; evidence: string; fix: string }[]
}) {
  const [checkedAt] = useState(() => new Date().toLocaleString('th-TH'))
  return (
    <div className="print-only text-[11pt]">
      <h1 className="text-[16pt] font-bold">รายงานตรวจใบกำกับภาษีขาย</h1>
      <p>ไฟล์: {name} · ตรวจเมื่อ {checkedAt} · อัตรา VAT {vatPct}% · {PACKS[PACK].note}</p>
      <div className="mt-3"><Filing rows={filing} taxMonth={taxMonth} print /></div>
      <p className="mt-2">ทั้งหมด {total} ใบ · ผ่านทุกข้อ {pass} ใบ · มีจุดต้องแก้ {fail} ใบ · ควรตรวจสอบเพิ่ม {expert} ใบ</p>
      {items.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[9.5pt]">
          <thead>
            <tr className="border-b text-left"><th className="p-1">ใบที่</th><th className="p-1">เลขที่</th><th className="p-1">แถว</th><th className="p-1">ข้อ</th><th className="p-1">ผล</th><th className="p-1">ปัญหา</th><th className="p-1">วิธีแก้</th></tr>
          </thead>
          <tbody>
            {items.map((x, k) => (
              <tr key={k} className="border-b align-top"><td className="p-1">{x.invoice + 1}</td><td className="p-1 whitespace-nowrap">{x.no}</td><td className="p-1 whitespace-nowrap">{x.lines}</td><td className="p-1 whitespace-nowrap">{x.clauseId}</td><td className="p-1 whitespace-nowrap">{V[x.verdict].label}</td><td className="p-1">{x.evidence}</td><td className="p-1">{x.fix}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-[9pt]">ผลตรวจเป็นการตรวจตัวเองเบื้องต้น ไม่ใช่คำแนะนำทางกฎหมายหรือภาษี สร้างโดย Rulecraft</p>
    </div>
  )
}

const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** F-01: what goes on each ภ.พ.30, one per seller premises and tax month, with due dates. */
function Filing({ rows, taxMonth, print = false }: { rows: FilingRow[]; taxMonth?: string; print?: boolean }) {
  if (rows.length === 0) return null
  const due = taxMonth ? filingDeadlines(taxMonth) : null
  const sellers = new Set(rows.map((r) => r.sellerTin)).size
  return (
    <section className={print ? 'grid gap-1' : 'screen-only grid gap-3 rounded-xl border border-line bg-raise p-4'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={print ? 'text-[12pt] font-bold' : 'text-[1.0625rem] font-semibold'}>สรุปสำหรับยื่น ภ.พ.30</h2>
        {taxMonth && due && (
          <span className="text-[0.875rem]">
            เดือนภาษี {thaiMonth(taxMonth)} · ยื่นแบบกระดาษภายใน <b>{thaiDate(due.paper)}</b>
            {due.online ? <> · ยื่นออนไลน์ภายใน <b>{thaiDate(due.online)}</b></> : ' · ยังไม่ยืนยันว่ามีการขยายเวลายื่นออนไลน์สำหรับงวดนี้'}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.875rem]">
          <thead>
            <tr className="border-b border-line text-left">
              {sellers > 1 && <th className="p-2 font-semibold">ผู้ขาย</th>}
              <th className="p-2 font-semibold">สถานประกอบการ</th><th className="p-2 font-semibold">เดือนภาษี</th>
              <th className="p-2 text-right font-semibold">ใบ</th><th className="p-2 text-right font-semibold">มูลค่า</th>
              <th className="p-2 text-right font-semibold">ภาษีขาย</th><th className="p-2 text-right font-semibold">มีจุดต้องแก้</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => {
              const other = taxMonth && r.month && r.month !== taxMonth
              return (
                <tr key={k} className="border-b border-line last:border-0">
                  {sellers > 1 && <td className="num p-2">{r.sellerTin || '(ไม่มีเลข)'}</td>}
                  <td className="p-2">{branchLabel(r.branch)}</td>
                  <td className={`p-2 whitespace-nowrap ${other ? 'text-expert' : ''}`}>{r.month ? thaiMonth(r.month) : '(อ่านวันที่ไม่ได้)'}{other ? ' · นอกเดือนที่ยื่น' : ''}</td>
                  <td className="num p-2 text-right">{r.invoices}</td>
                  <td className="num p-2 text-right">{baht(r.amount)}</td>
                  <td className="num p-2 text-right">{baht(r.vat)}</td>
                  <td className={`num p-2 text-right ${r.failing ? 'text-fail' : ''}`}>{r.failing}{r.unreadable ? ` · ${r.unreadable} ใบอ่านยอดไม่ได้` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[0.75rem] text-ink-3">ยอดจากไฟล์นี้เท่านั้น ยังไม่รวมใบเพิ่มหนี้ ใบลดหนี้ และยอดขายที่ออกใบกำกับภาษีอย่างย่อ ยื่นแยกรายสถานประกอบการ เว้นแต่ได้รับอนุมัติให้ยื่นรวม (ม.83 วรรคสี่) กำหนดยื่นออนไลน์ +8 วันตามประกาศกระทรวงการคลังที่ใช้กับแบบที่ครบกำหนดถึง 31 ม.ค. 2570</p>
    </section>
  )
}
