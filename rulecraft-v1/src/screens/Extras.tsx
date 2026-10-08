// ภ.พ.30 summary, the printable report, and the manual checklist.
import { useState } from 'react'
import { branchLabel } from '../io/filing'
import type { FilingRow } from '../io/filing'
import type { Issue } from '../io/issues'
import type { Invoice } from '../rules/engine'
import { PACKS } from '../rules/clauses'
import { filingDeadlines, thaiDate, thaiMonth } from '../rules/rates'
import { Badge } from '../ui'
import { LEVEL, baht } from '../levels'

/** F-01: one line per premises and tax month, the way ภ.พ.30 is filed (ม.83 วรรคสี่). */
export function Filing({ rows, taxMonth, print = false }: { rows: FilingRow[]; taxMonth?: string; print?: boolean }) {
  if (rows.length === 0) return null
  const due = taxMonth ? filingDeadlines(taxMonth) : null
  const sellers = new Set(rows.map((r) => r.sellerTin)).size
  const inMonth = rows.filter((r) => !taxMonth || r.month === taxMonth)
  const vat = inMonth.reduce((n, r) => n + r.vat, 0)
  const amount = inMonth.reduce((n, r) => n + r.amount, 0)
  const note = 'ยอดจากไฟล์นี้เท่านั้น ใบลดหนี้หักออก ใบเพิ่มหนี้บวกเพิ่ม ใบที่ยกเลิกไม่นับ ยังไม่รวมยอดขายที่ออกใบกำกับภาษีอย่างย่อ และยังไม่หักภาษีซื้อ ยื่นแยกรายสถานประกอบการ เว้นแต่ได้รับอนุมัติให้ยื่นรวม (ม.83 วรรคสี่)'

  if (print)
    return (
      <section className="grid gap-1">
        <h2 className="text-[12pt] font-bold">สรุปสำหรับยื่น ภ.พ.30{taxMonth ? ` เดือนภาษี ${thaiMonth(taxMonth)}` : ''}</h2>
        {due && <p>ยื่นแบบกระดาษภายใน {thaiDate(due.paper)}{due.online ? ` · ยื่นออนไลน์ภายใน ${thaiDate(due.online)}` : ''}</p>}
        <table className="w-full border-collapse text-[9.5pt]">
          <thead><tr className="border-b text-left"><th className="p-1">สถานประกอบการ</th><th className="p-1">เดือนภาษี</th><th className="p-1 text-right">ใบ</th><th className="p-1 text-right">มูลค่า</th><th className="p-1 text-right">ภาษีขาย</th></tr></thead>
          <tbody>{rows.map((r, k) => (<tr key={k} className="border-b"><td className="p-1">{branchLabel(r.branch)}</td><td className="p-1">{r.month ? thaiMonth(r.month) : '-'}</td><td className="p-1 text-right">{r.invoices}</td><td className="p-1 text-right">{baht(r.amount)}</td><td className="p-1 text-right">{baht(r.vat)}</td></tr>))}</tbody>
        </table>
      </section>
    )

  return (
    <section className="grid gap-4" aria-labelledby="filing-title">
      <div className="card grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <h2 id="filing-title" className="text-[1.3125rem]">สรุปสำหรับยื่น ภ.พ.30</h2>
          {taxMonth && <p className="text-ink-2">เดือนภาษี {thaiMonth(taxMonth)}</p>}
        </div>
        {due && (
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[0.9375rem] sm:justify-items-end">
            <dt className="text-ink-3">ยื่นแบบกระดาษภายใน</dt><dd className="font-semibold">{thaiDate(due.paper)}</dd>
            <dt className="text-ink-3">ยื่นออนไลน์ภายใน</dt><dd className="font-semibold">{due.online ? thaiDate(due.online) : 'ยังไม่ยืนยันการขยายเวลา'}</dd>
          </dl>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
          <div className="rounded-xl bg-sunken p-4"><dt className="text-[0.875rem] text-ink-2">ภาษีขายของเดือน (บาท)</dt><dd className="num text-[2rem] leading-tight font-semibold">{baht(vat)}</dd></div>
          <div className="rounded-xl bg-sunken p-4"><dt className="text-[0.875rem] text-ink-2">มูลค่าขาย (บาท)</dt><dd className="num text-[1.5rem] leading-tight font-semibold">{baht(amount)}</dd></div>
          <div className="col-span-2 rounded-xl bg-sunken p-4 sm:col-span-1"><dt className="text-[0.875rem] text-ink-2">ภาษีที่ต้องชำระ</dt><dd className="text-[0.9375rem]">ภาษีขาย − ภาษีซื้อ ภาษีซื้อไม่ได้อยู่ในไฟล์นี้</dd></div>
        </dl>
      </div>

      <div className="card overflow-hidden">
        {/* desktop/tablet: table; phone: one card per premises */}
        <table className="hidden w-full border-collapse text-[0.9375rem] sm:table">
          <caption className="sr-only">ยอดแยกตามสถานประกอบการและเดือนภาษี</caption>
          <thead className="bg-sunken text-left text-[0.875rem] text-ink-2">
            <tr>
              {sellers > 1 && <th scope="col" className="px-4 py-3 font-semibold">ผู้ขาย</th>}
              <th scope="col" className="px-4 py-3 font-semibold">สถานประกอบการ</th>
              <th scope="col" className="px-4 py-3 font-semibold">เดือนภาษี</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">ใบ</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">มูลค่า (บาท)</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">ภาษีขาย (บาท)</th>
              <th scope="col" className="px-4 py-3 font-semibold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => {
              const other = taxMonth && r.month && r.month !== taxMonth
              return (
                <tr key={k} className="border-t border-line align-top">
                  {sellers > 1 && <td className="num px-4 py-3">{r.sellerTin || '(ไม่มีเลข)'}</td>}
                  <th scope="row" className="px-4 py-3 text-left font-medium">{branchLabel(r.branch)}</th>
                  <td className="px-4 py-3 whitespace-nowrap">{r.month ? thaiMonth(r.month) : '(อ่านวันที่ไม่ได้)'}{other && <div className="text-[0.875rem] text-warn">นอกเดือนที่กำลังยื่น</div>}</td>
                  <td className="num px-4 py-3 text-right">{r.invoices}{(r.notes > 0 || r.cancelled > 0) && <div className="text-[0.875rem] text-ink-3">{r.notes ? `ลด/เพิ่มหนี้ ${r.notes}` : ''}{r.notes && r.cancelled ? ' · ' : ''}{r.cancelled ? `ยกเลิก ${r.cancelled}` : ''}</div>}</td>
                  <td className="num px-4 py-3 text-right">{baht(r.amount)}</td>
                  <td className="num px-4 py-3 text-right font-semibold">{baht(r.vat)}</td>
                  <td className="px-4 py-3">{r.failing ? <Badge level="fail" compact>ต้องแก้ {r.failing} ใบ</Badge> : <Badge level="pass" compact>พร้อม</Badge>}{r.unreadable > 0 && <div className="mt-1 text-[0.875rem] text-warn">อ่านยอดไม่ได้ {r.unreadable} ใบ</div>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <ul className="divide-y divide-line sm:hidden">
          {rows.map((r, k) => (
            <li key={k} className="grid gap-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{branchLabel(r.branch)}</span>
                <span className="text-ink-2">{r.month ? thaiMonth(r.month) : '-'}</span>
              </div>
              <dl className="num grid grid-cols-[1fr_auto] gap-x-3 text-[0.9375rem]">
                <dt className="text-ink-2">ใบ</dt><dd className="text-right">{r.invoices}</dd>
                <dt className="text-ink-2">มูลค่า</dt><dd className="text-right">{baht(r.amount)}</dd>
                <dt className="text-ink-2">ภาษีขาย</dt><dd className="text-right font-semibold">{baht(r.vat)}</dd>
              </dl>
              <div>{r.failing ? <Badge level="fail" compact>ต้องแก้ {r.failing} ใบ</Badge> : <Badge level="pass" compact>พร้อม</Badge>}</div>
            </li>
          ))}
        </ul>
      </div>
      <p className="max-w-[80ch] text-[0.875rem] text-ink-3">{note} {due?.online && 'กำหนดยื่นออนไลน์ +8 วัน ตามประกาศกระทรวงการคลังที่ใช้กับแบบที่ครบกำหนดถึง 31 ม.ค. 2570'}</p>
    </section>
  )
}

export function PrintReport({ filing, taxMonth, name, vatPct, total, ready, issues, invoices }: {
  filing: FilingRow[]; taxMonth?: string; name: string; vatPct: number; total: number; ready: number; issues: Issue[]; invoices: Invoice[]
}) {
  const [checkedAt] = useState(() => new Date().toLocaleString('th-TH'))
  return (
    <div className="print-only text-[11pt]">
      <h1 className="text-[16pt] font-bold">รายงานตรวจใบกำกับภาษีขาย</h1>
      <p>ไฟล์: {name} · ตรวจเมื่อ {checkedAt} · อัตรา VAT {vatPct}% · {PACKS.v2026.note}</p>
      <p className="mt-1">ตรวจ {total} ใบ · พร้อมยื่น {ready} ใบ · พบ {issues.length} เรื่อง</p>
      <div className="mt-3"><Filing rows={filing} taxMonth={taxMonth} print /></div>
      {issues.map((x) => (
        <section key={x.id} className="mt-4 break-inside-avoid">
          <h2 className="text-[11.5pt] font-bold">[{LEVEL[x.level].label}] {x.title} · {x.hits.length} ใบ</h2>
          <p className="text-[9.5pt]">อ้างอิง: {x.clause.source} ({x.clause.id})</p>
          <table className="mt-1 w-full border-collapse text-[9.5pt]">
            <tbody>
              {x.hits.map((h, k) => (<tr key={k} className="border-b align-top"><td className="w-[7rem] p-1 whitespace-nowrap">{invoices[h.invoice]?.row.invoice_no}</td><td className="p-1">{h.evidence}</td><td className="w-[35%] p-1">{h.fix}</td></tr>))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mt-4 text-[9pt]">ผลตรวจเป็นการตรวจตัวเองเบื้องต้น ไม่ใช่คำวินิจฉัยของกรมสรรพากร ข้อความกฎหมายฉบับทางการ ผู้สอบบัญชี หรือที่ปรึกษาภาษีของคุณเป็นผู้ตัดสิน · สร้างโดย Rulecraft</p>
    </div>
  )
}

// What a file cannot show but still decides whether the customer can claim the VAT
// (ประกาศอธิบดีฯ ฉบับที่ 42 ข้อ 2, ป.86/2542, ป.46/2537, ประกาศอธิบดีฯ ฉบับที่ 15 และ 247).
const MANUAL = [
  ['คำว่า "ใบกำกับภาษี" ตีพิมพ์ไว้ หรือพิมพ์จากคอมพิวเตอร์ทั้งฉบับ ไม่ใช่ประทับตรายางหรือเขียนเอง', 'ประกาศฯ 42 ข้อ 2(5)'],
  ['ชื่อ ที่อยู่ และเลขผู้เสียภาษีของผู้ขาย ตีพิมพ์ไว้ หรือพิมพ์จากคอมพิวเตอร์ทั้งฉบับ', 'ประกาศฯ 42 ข้อ 2(12)'],
  ['ต้นฉบับไม่ใช่สำเนาคาร์บอน ถ้าออกเป็นชุดต้องมีข้อความ "เอกสารออกเป็นชุด"', 'ประกาศฯ 42 ข้อ 2(7)'],
  ['ไม่มีการแก้ไขด้วยมือ ยกเว้นที่อยู่หรือเลขผู้เสียภาษีที่ทางราชการเปลี่ยน ภายใน 1 ปี พร้อมลายมือชื่อ', 'ประกาศฯ 42 ข้อ 2(10), ป.46/2537'],
  ['ใบหลายแผ่น: ทุกแผ่นมีรายการครบ มี "แผ่นที่" และยอดรวมอยู่แผ่นสุดท้ายเท่านั้น', 'ป.86/2542 ข้อ 9'],
  ['สินค้าที่ได้รับยกเว้น VAT ในใบเดียวกัน ทำเครื่องหมายแยกให้เห็นชัด', 'ป.86/2542 ข้อ 4(5)'],
  ['ใบที่ยกเลิก: เรียกคืนต้นฉบับ ประทับ "ยกเลิก" เก็บรวมกับสำเนา และหมายเหตุในรายงานภาษีขาย', 'ป.86/2542 ข้อ 25'],
  ['ใบที่ส่งเป็น e-Tax Invoice แล้วพิมพ์เป็นกระดาษ มีข้อความ "เอกสารนี้ได้จัดทำและส่งข้อมูลให้แก่กรมสรรพากรด้วยวิธีการทางอิเล็กทรอนิกส์"', 'ประกาศฯ 15, ฉบับที่ 247'],
  ['เลขผู้เสียภาษีของผู้ขายและผู้ซื้อจดทะเบียน VAT จริง (ตรวจในระบบของกรมสรรพากร โปรแกรมนี้ตรวจได้แค่รูปแบบเลข)', 'ม.82/5'],
] as const

export function ManualChecklist({ fileName }: { fileName: string }) {
  const key = `rulecraft.manual.v1:${fileName}`
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  })
  const toggle = (i: number) => {
    const next = MANUAL.map((_, k) => (k === i ? !done[k] : !!done[k]))
    setDone(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* not remembered */
    }
  }
  const count = MANUAL.filter((_, i) => done[i]).length
  return (
    <details className="card p-5">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[1.0625rem] font-semibold">ตรวจด้วยตาก่อนส่งใบให้ลูกค้า</span>
        <span className="num text-ink-2">{count}/{MANUAL.length}</span>
        <span className="text-[0.9375rem] text-ink-3">เรื่องที่ไฟล์บอกไม่ได้ แต่ทำให้ลูกค้าใช้ภาษีซื้อไม่ได้</span>
      </summary>
      <ul className="mt-4 grid gap-1">
        {MANUAL.map(([text, src], i) => (
          <li key={i}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-sunken">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--action)]" checked={!!done[i]} onChange={() => toggle(i)} />
              <span className={done[i] ? 'text-ink-3 line-through' : ''}>{text} <span className="text-[0.875rem] text-ink-3 no-underline">· {src}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  )
}
