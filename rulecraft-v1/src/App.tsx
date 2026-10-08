import { useMemo, useState } from 'react'
import { buildIssues } from './io/issues'
import { filingSummary, likelyTaxMonth } from './io/filing'
import { download, downloadAnnotated, downloadTemplate, fixListCsv } from './io/report'
import { numberGaps } from './io/sequence'
import { detectHeaderRow, parseCsv, readFile, toTable } from './io/table'
import type { Sheet } from './io/table'
import { CLAUSES } from './rules/clauses'
import { applyMapping, autoMap, EXTRA_FIELDS, FIELDS, groupInvoices, runInvoices } from './rules/engine'
import type { Field } from './rules/engine'
import factoryCsv from './samples/factory.csv?raw'
import { PrintReport } from './screens/Extras'
import { RECOMMENDED, REQUIRED } from './fields'
import type { MatchKind } from './fields'
import { Mapping } from './screens/Mapping'
import { HelpPage, RulesPage } from './screens/Pages'
import { Results } from './screens/Results'
import type { Tab } from './screens/Results'
import { Upload } from './screens/Upload'
import { worst } from './levels'

const PACK = 'v2026' as const

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
const FLOW: { id: Step; label: string }[] = [
  { id: 'upload', label: 'เลือกไฟล์' },
  { id: 'map', label: 'ตรวจคอลัมน์' },
  { id: 'results', label: 'ผลตรวจ' },
]

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [source, setSource] = useState<{ name: string; sheets: Sheet[] } | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [vatPct, setVatPct] = useState(7)
  const [taxMonthPick, setTaxMonthPick] = useState<string | null>(null)
  const [edits, setEdits] = useState<{ key: string; m: Partial<Record<Field, string>>; touched: Field[] } | null>(null)
  const [tab, setTab] = useState<Tab>('issues')
  const [invoiceIdx, setInvoiceIdx] = useState(0)
  const [autoMapped, setAutoMapped] = useState(false)

  const sheet = source?.sheets[sheetIdx]
  const cells = useMemo(() => sheet?.cells ?? [], [sheet])
  const autoHeader = useMemo(() => detectHeaderRow(cells), [cells])
  const table = useMemo(() => toTable(cells, headerRow ?? autoHeader), [cells, headerRow, autoHeader])
  const headersKey = table.headers.join('\u0001')
  const saved = useMemo(() => loadMapping(table.headers), [table.headers])
  const auto = useMemo(() => autoMap(table.headers), [table.headers])
  // User edits belong to one header layout; a new layout starts from what was saved for it.
  const mappingEdits = edits?.key === headersKey ? edits.m : saved
  const touched = edits?.key === headersKey ? edits.touched : []
  const mapping = useMemo(() => ({ ...auto, ...mappingEdits }) as Record<Field, string>, [auto, mappingEdits])
  const setField = (f: Field, h: string) => setEdits({ key: headersKey, m: { ...mappingEdits, [f]: h }, touched: [...touched, f] })
  const match = (f: Field): MatchKind => (touched.includes(f) ? (mapping[f] ? 'manual' : 'none') : saved[f] !== undefined && saved[f] === mapping[f] ? 'saved' : mapping[f] ? 'auto' : 'none')

  const vatRate = vatPct / 100
  const rows = useMemo(() => applyMapping(table.records, mapping), [table, mapping])
  const invoices = useMemo(() => groupInvoices(rows, vatRate, table.lineNos), [rows, vatRate, table.lineNos])
  const taxMonth = taxMonthPick ?? likelyTaxMonth(invoices) ?? undefined
  const results = useMemo(() => runInvoices(invoices, PACK, vatRate, { taxMonth }), [invoices, vatRate, taxMonth])
  const issues = useMemo(() => buildIssues(results), [results])
  const filing = useMemo(() => filingSummary(invoices, results), [invoices, results])
  const gaps = useMemo(() => numberGaps(invoices), [invoices])
  const unknownBuyerVat = invoices.filter((x) => !x.row.buyer_is_vat_registrant?.trim() && !x.row.buyer_tax_id?.trim()).length
  const ready = results.filter((r) => !['fail', 'warn', 'needs_expert'].includes(worst(Object.values(r).map((x) => x?.verdict)))).length
  const coreFields = FIELDS.filter((f) => !EXTRA_FIELDS.includes(f))
  const matchedCount = coreFields.filter((f) => mapping[f]).length

  const open = (name: string, sheets: Sheet[]) => {
    const idx = Math.max(0, sheets.findIndex((s) => s.cells.some((r) => r.some((v) => v.trim()))))
    // Skip the mapping step when every required and recommended field matched on its own (Dromo, OneSchema).
    const t = toTable(sheets[idx]?.cells ?? [])
    const m = { ...autoMap(t.headers), ...loadMapping(t.headers) }
    const complete = [...REQUIRED, ...RECOMMENDED].every((f) => m[f]) && t.records.length > 0
    setSource({ name, sheets })
    setSheetIdx(idx)
    setHeaderRow(null)
    setTaxMonthPick(null)
    setEdits(null)
    setInvoiceIdx(0)
    setTab('issues')
    setError(null)
    setAutoMapped(complete)
    setStep(complete ? 'results' : 'map')
    window.scrollTo({ top: 0 })
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const sheets = await readFile(file)
      if (!sheets.some((s) => s.cells.some((r) => r.some((v) => v.trim())))) throw new Error('ไฟล์ที่เลือกว่างเปล่า ไม่มีข้อมูลให้ตรวจ')
      open(file.name, sheets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อ่านไฟล์ไม่ได้ ลองเลือกไฟล์ใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }
  const toResults = () => {
    saveMapping(table.headers, mappingEdits)
    setAutoMapped(false)
    setStep('results')
    window.scrollTo({ top: 0 })
  }
  const go = (s: Step) => { setStep(s); window.scrollTo({ top: 0 }) }

  const flowIndex = FLOW.findIndex((f) => f.id === step)
  const readInfo = `อ่าน ${table.records.length} แถวจาก${source && source.sheets.length > 1 ? `ชีต "${sheet?.name}"` : 'ไฟล์'} · หัวคอลัมน์แถวที่ ${table.headerLine} · ${autoMapped ? 'จับคู่คอลัมน์อัตโนมัติ' : 'จับคู่คอลัมน์'} ${matchedCount} จาก ${coreFields.length} ช่อง`

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">ข้ามไปเนื้อหา</a>
      <header className="screen-only border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => go(source ? 'results' : 'upload')} className="flex items-center gap-2.5 rounded-lg text-left">
            <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--action)" /><path d="M9 8h10l4 4v12a1 1 0 01-1 1H9a1 1 0 01-1-1V9a1 1 0 011-1z" fill="var(--on-action)" /><path d="M11.5 17.5l3 3 6-6.5" stroke="var(--action)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="grid leading-tight"><span className="font-semibold">Rulecraft</span><span className="text-[0.875rem] text-ink-3">ตรวจใบกำกับภาษีขาย</span></span>
          </button>
          <nav aria-label="เมนูหลัก" className="flex items-center gap-1">
            {([['upload', 'ตรวจไฟล์'], ['rules', 'ข้อกำหนดที่ตรวจ'], ['help', 'วิธีใช้']] as const).map(([id, label]) => {
              const on = id === 'upload' ? flowIndex >= 0 : step === id
              return (
                <button key={id} type="button" aria-current={on ? 'page' : undefined} onClick={() => go(id === 'upload' ? (source ? 'results' : 'upload') : id)}
                  className={`min-h-11 rounded-lg px-3 text-[0.9375rem] ${on ? 'bg-sunken font-semibold text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>{label}</button>
              )
            })}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-[72rem] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {flowIndex >= 0 && (
          <nav aria-label="ขั้นตอน" className="screen-only">
            <ol className="flex items-center gap-1 text-[0.9375rem] sm:gap-2">
              {FLOW.map((f, i) => {
                const done = i < flowIndex
                const current = i === flowIndex
                const enabled = f.id === 'upload' || !!source
                return (
                  <li key={f.id} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true" className="h-px w-3 bg-line-strong sm:w-8" />}
                    <button type="button" disabled={!enabled || current} aria-current={current ? 'step' : undefined}
                      onClick={() => (f.id === 'results' ? toResults() : go(f.id))}
                      className={`flex min-h-11 items-center gap-1.5 rounded-full pr-1 pl-0.5 whitespace-nowrap sm:gap-2 sm:pr-3 sm:pl-1 ${current ? 'font-semibold text-ink' : enabled ? 'text-ink-2 hover:text-ink' : 'text-ink-3'}`}>
                      <span className={`num grid size-7 place-items-center rounded-full text-[0.875rem] font-semibold ${current ? 'bg-action text-on-action' : done ? 'bg-pass-bg text-pass' : 'border border-line-strong text-ink-3'}`}>
                        {done ? <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
                      </span>
                      <span className={current ? '' : 'sr-only sm:not-sr-only'}>{f.label}</span>{done && <span className="sr-only"> (เสร็จแล้ว)</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        )}

        <div className="screen-only">
          {step === 'upload' && (
            <Upload busy={busy} error={error} ruleCount={CLAUSES.length} onFile={onFile} onTemplate={downloadTemplate} onRules={() => go('rules')}
              onSample={() => open('โรงงานตัวอย่าง.csv', [{ name: 'ตัวอย่าง', cells: parseCsv(factoryCsv) }])} />
          )}
          {step === 'map' && source && (
            <Mapping fileName={source.name} sheets={source.sheets.map((s) => s.name)} sheetIdx={sheetIdx} setSheetIdx={(i) => { setSheetIdx(i); setHeaderRow(null) }}
              headerRow={headerRow ?? autoHeader} maxRow={cells.length} setHeaderRow={setHeaderRow}
              taxMonth={taxMonth} setTaxMonth={setTaxMonthPick} vatPct={vatPct} setVatPct={setVatPct}
              headers={table.headers} mapping={mapping} match={match} setField={setField}
              rows={rows} recordCount={table.records.length} invoiceCount={invoices.length} onContinue={toResults} onBack={() => go('upload')} />
          )}
          {step === 'results' && source && (
            <Results fileName={source.name} invoices={invoices} results={results} issues={issues} filing={filing} taxMonth={taxMonth} vatPct={vatPct}
              gaps={gaps} unknownBuyerVat={unknownBuyerVat} readInfo={readInfo} ruleCount={CLAUSES.length}
              tab={tab} setTab={setTab} invoiceIdx={invoiceIdx} setInvoiceIdx={setInvoiceIdx}
              onMapping={() => go('map')} onPrint={() => window.print()}
              onFixList={() => download(`รายการต้องแก้-${source.name.replace(/\.[^.]+$/, '')}.csv`, fixListCsv(invoices, results))}
              onAnnotated={() => downloadAnnotated(source.name, table.headers, table.records, table.lineNos, invoices, results)} />
          )}
          {step === 'rules' && <RulesPage />}
          {step === 'help' && <HelpPage />}
        </div>

        {step === 'results' && source && (
          <PrintReport filing={filing} taxMonth={taxMonth} name={source.name} vatPct={vatPct} total={invoices.length} ready={ready} issues={issues} invoices={invoices} />
        )}
      </main>

      <footer className="screen-only border-t border-line">
        <p className="mx-auto max-w-[72rem] px-4 py-5 text-[0.875rem] text-ink-3 sm:px-6">
          Rulecraft ช่วยตรวจตัวเองเบื้องต้น ไม่ใช่คำวินิจฉัยของกรมสรรพากร ข้อความกฎหมายฉบับทางการ ผู้สอบบัญชี หรือที่ปรึกษาภาษีของคุณเป็นผู้ตัดสิน · ไฟล์ของคุณไม่ถูกส่งออกจากเบราว์เซอร์นี้
        </p>
      </footer>
    </div>
  )
}
