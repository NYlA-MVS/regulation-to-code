// Step 1. The "Choose file" button is the primary control; drag-and-drop is an extra on wide screens
// (DWP file-upload research). What the file needs and the privacy promise sit next to the button.
import { useState } from 'react'
import { ACCEPT } from '../io/table'

const LockIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="shrink-0"><rect x="4" y="9" width="12" height="9" rx="2" fill="currentColor" /><path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
)
const FileIcon = () => (
  <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M12 4h17l9 9v29a2 2 0 01-2 2H12a2 2 0 01-2-2V6a2 2 0 012-2z" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M29 4v9h9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 23h16M16 29h16M16 35h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
)

export function Upload({ onFile, onSample, onTemplate, onRules, busy, error, ruleCount }: {
  onFile: (f: File | undefined) => void; onSample: () => void; onTemplate: () => void; onRules: () => void
  busy: boolean; error: string | null; ruleCount: number
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div className="grid gap-8">
      <div className="grid max-w-[44rem] gap-2">
        <h1 className="text-[1.75rem] leading-[1.35] sm:text-[2rem]">ตรวจใบกำกับภาษีขาย ก่อนยื่น ภ.พ.30</h1>
        <p className="text-[1.0625rem] text-ink-2">รู้ภายในไม่กี่วินาทีว่าใบไหนขาดรายการที่กฎหมายกำหนด แก้อย่างไร และอ้างอิงข้อกฎหมายข้อใด ก่อนลูกค้าจะใช้ภาษีซื้อไม่ได้</p>
      </div>

      {error && (
        <div role="alert" tabIndex={-1} className="grid gap-1 rounded-xl border-2 border-fail bg-fail-bg p-4">
          <h2 className="text-[1.0625rem] text-fail">เปิดไฟล์ไม่ได้</h2>
          <p>{error}</p>
        </div>
      )}

      <div className="card grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]) }}
          className={`grid content-center justify-items-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-action bg-sunken' : 'border-line-strong'}`}>
          <span className="text-ink-3"><FileIcon /></span>
          <div className="grid gap-1">
            <p className="text-[1.125rem] font-semibold">{busy ? 'กำลังอ่านไฟล์…' : dragging ? 'ปล่อยเพื่อตรวจ' : 'เลือกไฟล์รายงานภาษีขาย'}</p>
            <p className="hidden text-ink-3 sm:block">หรือลากไฟล์มาวางในกรอบนี้</p>
          </div>
          <label className="btn btn-primary cursor-pointer px-6 text-[1rem]">
            เลือกไฟล์
            <input id="file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <p className="flex items-center gap-2 text-[0.9375rem] text-pass"><LockIcon /> ตรวจในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งไฟล์ออก</p>
        </div>

        <div className="grid content-start gap-4">
          <h2 className="text-[1.0625rem]">ไฟล์ที่ใช้ได้</h2>
          <ul className="grid gap-2 text-[0.9375rem] text-ink-2">
            <li className="flex gap-2"><Check />Excel (.xlsx, .xls) หรือ CSV ที่ส่งออกจากโปรแกรมบัญชี เช่น Express, FlowAccount, PEAK</li>
            <li className="flex gap-2"><Check />หนึ่งแถวต่อหนึ่งรายการสินค้า หรือหนึ่งแถวต่อหนึ่งใบก็ได้ มีชื่อรายงานอยู่ด้านบนก็ได้</li>
            <li className="flex gap-2"><Check />อย่างน้อยต้องมี เลขที่ใบกำกับ วันที่ เลขผู้เสียภาษีผู้ขาย ชื่อผู้ซื้อ มูลค่า และภาษี</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={onSample} className="btn btn-secondary">ลองด้วยไฟล์ตัวอย่าง</button>
            <button type="button" onClick={onTemplate} className="btn btn-secondary">ดาวน์โหลดแม่แบบ Excel</button>
          </div>
          <p className="text-[0.875rem] text-ink-3">ไฟล์ตัวอย่างคือรายงานภาษีขายของโรงงานสมมุติ 8 ใบ ที่ใส่จุดผิดไว้ให้ดู</p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['ตรวจ ' + ruleCount + ' ข้อจากกฎหมายจริง', 'มาตรา 86/4, 86/9, 86/10 ประกาศอธิบดีฯ ฉบับที่ 199 และคำสั่ง ป.86/2542 ทุกผลบอกที่มา'],
          ['บอกวิธีแก้ ไม่ใช่แค่บอกว่าผิด', 'เรียงจากเรื่องที่ต้องแก้ก่อน ส่งรายการให้ฝ่ายบัญชีเป็น Excel หรือพิมพ์เป็น PDF'],
          ['สรุปยอดสำหรับ ภ.พ.30', 'ภาษีขายแยกตามสาขาและเดือน พร้อมวันครบกำหนดยื่นแบบกระดาษและออนไลน์'],
        ].map(([t, d]) => (
          <div key={t} className="grid content-start gap-1">
            <h2 className="text-[1rem]">{t}</h2>
            <p className="text-[0.9375rem] text-ink-2">{d}</p>
          </div>
        ))}
      </section>
      <p><button type="button" className="link text-[0.9375rem]" onClick={onRules}>ดูข้อกำหนดทั้งหมดที่ตรวจ</button></p>
    </div>
  )
}

function Check() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="mt-1 shrink-0 text-pass"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
