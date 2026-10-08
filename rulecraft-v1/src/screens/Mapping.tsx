// Step 2. Required fields first, match status in words (not percentages), real sample values on every
// row, optional fields behind a disclosure, and "Check" blocked until required fields are matched
// (Flatfile automap tiers, Friedman bulk UX, GOV.UK error summary).
import type { Row } from '../rules/checks'
import { EXTRA_FIELDS, FIELD_LABEL, FIELDS } from '../rules/engine'
import { RECOMMENDED, REQUIRED } from '../fields'
import type { MatchKind } from '../fields'
import type { Field } from '../rules/engine'
import { Badge } from '../ui'

export function Mapping(p: {
  fileName: string; sheets: string[]; sheetIdx: number; setSheetIdx: (i: number) => void
  headerRow: number; maxRow: number; setHeaderRow: (i: number) => void
  taxMonth?: string; setTaxMonth: (m: string | null) => void; vatPct: number; setVatPct: (n: number) => void
  headers: string[]; mapping: Record<Field, string>; match: (f: Field) => MatchKind; setField: (f: Field, h: string) => void
  rows: Row[]; recordCount: number; invoiceCount: number; onContinue: () => void; onBack: () => void
}) {
  const missing = REQUIRED.filter((f) => !p.mapping[f])
  const matched = FIELDS.filter((f) => !EXTRA_FIELDS.includes(f) && p.mapping[f]).length
  const coreTotal = FIELDS.length - EXTRA_FIELDS.length
  const samples = (f: Field) => [...new Set(p.rows.map((r) => (r[f] ?? '').trim()).filter(Boolean))].slice(0, 3)

  const row = (f: Field) => {
    const m = p.match(f)
    const need = REQUIRED.includes(f)
    return (
      <li key={f} className={`grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,16rem)_minmax(0,1fr)] sm:items-center sm:gap-4 ${need && !p.mapping[f] ? 'bg-fail-bg' : ''}`}>
        <label htmlFor={`map-${f}`} className="grid gap-0.5">
          <span className="font-medium">{FIELD_LABEL[f]}</span>
          <span className="text-[0.875rem]">
            {need && <span className="text-ink-2">จำเป็น · </span>}
            {m === 'saved' && <span className="text-pass">จำได้จากครั้งก่อน{p.mapping[f] ? '' : ' (ไม่มีในไฟล์)'}</span>}
            {m === 'auto' && <span className="text-pass">ตรงกับชื่อคอลัมน์</span>}
            {m === 'manual' && <span className="text-action">เลือกเอง</span>}
            {m === 'none' && <span className={need ? 'font-semibold text-fail' : 'text-ink-3'}>ยังไม่ได้จับคู่</span>}
          </span>
        </label>
        <select id={`map-${f}`} value={p.mapping[f]} onChange={(e) => p.setField(f, e.target.value)} className="field w-full">
          <option value="">ไม่มีในไฟล์</option>
          {p.headers.map((h) => (<option key={h} value={h}>{h}</option>))}
        </select>
        <span className="truncate text-[0.875rem] text-ink-3" title={samples(f).join(' · ')}>
          {p.mapping[f] ? (samples(f).length ? <>เช่น <span className="text-ink-2">{samples(f).join(' · ')}</span></> : 'คอลัมน์นี้ว่างทั้งหมด') : ''}
        </span>
      </li>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[1.625rem]">ตรวจการจับคู่คอลัมน์</h1>
        <p className="text-ink-2">{p.fileName} · อ่านได้ {p.recordCount} แถว รวมเป็น {p.invoiceCount} ใบ · จับคู่แล้ว {matched} จาก {coreTotal} ช่อง ระบบจะจำการจับคู่นี้ไว้ใช้กับไฟล์หน้าตาเดียวกันครั้งหน้า</p>
      </div>

      {missing.length > 0 && (
        <div role="alert" className="grid gap-2 rounded-xl border-2 border-fail bg-surface p-4">
          <h2 className="text-[1.0625rem] text-fail">ยังขาดช่องจำเป็น {missing.length} ช่อง</h2>
          <ul className="grid gap-1">
            {missing.map((f) => (<li key={f}><a className="link" href={`#map-${f}`}>เลือกคอลัมน์ของ “{FIELD_LABEL[f]}” หรือตรวจว่าหัวคอลัมน์อยู่แถวที่ถูกต้อง</a></li>))}
          </ul>
        </div>
      )}

      <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="ตั้งค่าการอ่านไฟล์">
        {p.sheets.length > 1 && (
          <label className="grid gap-1">
            <span className="text-[0.875rem] font-medium text-ink-2">ชีต</span>
            <select id="sheet" value={p.sheetIdx} onChange={(e) => p.setSheetIdx(Number(e.target.value))} className="field">
              {p.sheets.map((s, k) => (<option key={k} value={k}>{s}</option>))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          <span className="text-[0.875rem] font-medium text-ink-2">หัวคอลัมน์อยู่แถวที่</span>
          <input id="header-row" type="number" min={1} max={Math.max(p.maxRow, 1)} value={p.headerRow + 1}
            onChange={(e) => p.setHeaderRow(Math.min(Math.max((Number(e.target.value) || 1) - 1, 0), Math.max(p.maxRow - 1, 0)))} className="field num w-full" />
        </label>
        <label className="grid gap-1">
          <span className="text-[0.875rem] font-medium text-ink-2">เดือนภาษีที่จะยื่น</span>
          <input id="tax-month" type="month" value={p.taxMonth ?? ''} onChange={(e) => p.setTaxMonth(e.target.value || null)} className="field num w-full" />
        </label>
        <label className="grid gap-1">
          <span className="text-[0.875rem] font-medium text-ink-2">อัตรา VAT (%)</span>
          <input id="vat" type="number" min={0} max={20} step={0.5} value={p.vatPct} onChange={(e) => p.setVatPct(Number(e.target.value) || 0)} className="field num w-full" />
        </label>
      </section>

      <section className="grid gap-2" aria-labelledby="req-title">
        <h2 id="req-title" className="text-[1.125rem]">ช่องจำเป็น</h2>
        <ul className="card divide-y divide-line overflow-hidden">{REQUIRED.map(row)}</ul>
      </section>
      <section className="grid gap-2" aria-labelledby="rec-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rec-title" className="text-[1.125rem]">ช่องที่ควรมี</h2>
          <span className="text-[0.875rem] text-ink-3">ถ้าไม่มี ข้อที่ใช้ช่องนั้นจะขึ้นว่าต้องแก้หรือไม่เกี่ยว ไม่มีทางผ่านเงียบๆ</span>
        </div>
        <ul className="card divide-y divide-line overflow-hidden">{RECOMMENDED.map(row)}{['book_no', 'unit_price', 'total'].map((f) => row(f as Field))}</ul>
      </section>
      <details open={EXTRA_FIELDS.some((f) => p.mapping[f])} className="grid gap-2">
        <summary className="cursor-pointer py-1 text-[1.125rem] font-semibold">ช่องเพิ่มเติม (ไม่บังคับ) <span className="text-[0.9375rem] font-normal text-ink-3">ใบเพิ่มหนี้/ใบลดหนี้ ใบยกเลิก สกุลเงิน อัตรา 0%/ยกเว้น วันส่งมอบ</span></summary>
        <ul className="card mt-2 divide-y divide-line overflow-hidden">{EXTRA_FIELDS.map(row)}</ul>
      </details>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <button type="button" onClick={p.onContinue} disabled={missing.length > 0} className="btn btn-primary">ตรวจ {p.invoiceCount} ใบ</button>
        <button type="button" onClick={p.onBack} className="btn btn-secondary">เลือกไฟล์อื่น</button>
        {missing.length > 0 ? <Badge level="fail" compact>ขาดช่องจำเป็น {missing.length} ช่อง</Badge> : <span className="text-[0.875rem] text-ink-3">ตรวจได้เลย แก้การจับคู่ภายหลังได้</span>}
      </div>
    </div>
  )
}
