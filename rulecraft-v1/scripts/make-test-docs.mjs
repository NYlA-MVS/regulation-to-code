// Generates trial documents (PDF with text, scanned PDF, photos) in test-files/ using headless Chrome.
// All data is fictional. Run after `npm install`: node scripts/make-test-docs.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const OUT = 'test-files'
mkdirSync(OUT, { recursive: true })
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const tin = (p12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(p12[i]) * (13 - i); return p12 + ((11 - (s % 11)) % 10) }
const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round((n + 1e-9) * 100) / 100

const SELLER = { name: 'บริษัท ไทยเมทัล พาร์ท จำกัด', addr: '99/1 ม.2 ถ.เทพารักษ์ ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570', tin: tin('010555901234'), branch: 'สำนักงานใหญ่' }
const BUYERS = {
  siam: { name: 'บริษัท สยามออโต้ พาร์ท จำกัด', addr: '700/12 นิคมอุตสาหกรรมอมตะนคร ต.บ้านเก่า อ.พานทอง จ.ชลบุรี 20160', tin: tin('010554512345'), branch: 'สำนักงานใหญ่' },
  east: { name: 'บริษัท อีสเทิร์น ซีบอร์ด แมชชีนเนอรี่ จำกัด', addr: '64/9 ม.4 ต.ปลวกแดง อ.ปลวกแดง จ.ระยอง 21140', tin: tin('021555600712'), branch: 'สาขาที่ 00002' },
  food: { name: 'บริษัท กรุงเทพ ฟู้ด แพ็ค จำกัด (มหาชน)', addr: '1 ถ.พระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150', tin: tin('010753700456'), branch: 'สำนักงานใหญ่' },
  korat: { name: 'บริษัท โคราช อินดัสตรี้ จำกัด', addr: '88 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.นครราชสีมา 30000', tin: tin('030555100987'), branch: 'สาขาที่ 00001' },
}

/** One invoice as HTML pages. Long item lists continue on a second page with "แผ่นที่". */
function invoiceHtml(inv, { perPage = 12 } = {}) {
  const amount = r2(inv.items.reduce((n, it) => n + r2(it.qty * it.price), 0))
  const vat = inv.vat ?? r2(amount * 0.07)
  const total = inv.total ?? r2(amount + vat)
  const chunks = []
  for (let i = 0; i < inv.items.length; i += perPage) chunks.push(inv.items.slice(i, i + perPage))
  return chunks.map((items, p) => {
    const last = p === chunks.length - 1
    return `<section class="page">
  <div class="head">
    <div><div class="co">${SELLER.name}</div><div>${SELLER.addr}</div><div>เลขประจำตัวผู้เสียภาษี ${SELLER.tin} &nbsp; ${inv.sellerBranch ?? SELLER.branch}</div></div>
    <div class="title"><div class="t">${inv.title ?? 'ใบกำกับภาษี/ใบส่งของ'}</div><div>ต้นฉบับ</div></div>
  </div>
  <div class="meta">
    <div class="box"><div>ลูกค้า: ${inv.buyer.name}</div><div>ที่อยู่: ${inv.buyer.addr}</div><div>เลขประจำตัวผู้เสียภาษี ${inv.buyer.tin} &nbsp; ${inv.buyer.branch}</div></div>
    <div class="box right"><div>เลขที่ ${inv.no}</div><div>วันที่ ${inv.date}</div>${chunks.length > 1 ? `<div>แผ่นที่ ${p + 1}/${chunks.length}</div>` : ''}</div>
  </div>
  <table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th></tr></thead><tbody>
  ${items.map((it, k) => `<tr><td>${p * perPage + k + 1}</td><td class="l">${it.desc}</td><td>${it.qty.toLocaleString('en-US')}</td><td>${fmt(it.price)}</td><td>${fmt(r2(it.qty * it.price))}</td></tr>`).join('')}
  </tbody></table>
  ${last ? `<div class="sum"><div><span>รวมเงิน</span><span>${fmt(amount)}</span></div><div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>${fmt(vat)}</span></div><div class="g"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${fmt(total)}</span></div></div>` : '<div class="cont">มีต่อแผ่นถัดไป</div>'}
  <div class="sign"><div>ผู้รับสินค้า ..................</div><div>ผู้มีอำนาจลงนาม ..................</div></div>
  ${inv.overlay && p === 0 ? inv.overlay : ''}
</section>`
  }).join('\n')
}

const CSS = `
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: 'Sarabun', sans-serif; font-size: 13.5px; color: #111 }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm; position: relative; page-break-after: always; background: #fff }
.head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #222; padding-bottom: 8px }
.co { font-size: 18px; font-weight: 700 }
.title { text-align: right } .title .t { font-size: 22px; font-weight: 700 }
.meta { display: flex; gap: 10px; margin: 10px 0 }
.box { border: 1px solid #555; border-radius: 6px; padding: 8px 10px; flex: 1 } .box.right { flex: 0 0 52mm }
table { width: 100%; border-collapse: collapse; margin-top: 6px }
th, td { border: 1px solid #555; padding: 4px 6px; text-align: right } th { background: #eee; text-align: center } td.l { text-align: left }
.sum { width: 75mm; margin: 10px 0 0 auto } .sum div { display: flex; justify-content: space-between; padding: 3px 0 } .sum .g { font-weight: 700; border-top: 2px solid #222 }
.cont { text-align: right; margin-top: 8px; font-style: italic }
.sign { position: absolute; bottom: 22mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between }
.pen { position: absolute; font-family: 'Charm', cursive; color: #1a3cc8; font-size: 22px; transform: rotate(-4deg) }
.strike { position: absolute; height: 2px; background: #1a3cc8; transform: rotate(-2deg) }
.stamp { position: absolute; border: 3px solid #b3261e; color: #b3261e; font-weight: 700; padding: 2px 10px; transform: rotate(-8deg); font-size: 20px; opacity: .85 }
`
const page = (body) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&family=Charm&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${body}</body></html>`

const items = (spec) => spec.map(([desc, qty, price]) => ({ desc, qty, price }))
const P = {
  bracket: ['ขายึดกันชน เหล็กชุบซิงค์', 18.5], screw: ['สกรูหัวจม M8x20', 1.25], bush: ['บูชยางกันสะเทือน', 6], sheet: ['แผ่นเหล็กพับขึ้นรูป 1.2 มม.', 3.2],
  hanger: ['ขาแขวนสแตนเลส', 12], shaft: ['เพลากลึง CNC 25 มม.', 85], flange: ['หน้าแปลนเหล็กหล่อ 4 นิ้ว', 240], cover: ['ฝาครอบอลูมิเนียม', 9.5],
}
const it = (k, qty) => [P[k][0], qty, P[k][1]]

// 09: text PDF, 5 invoices on 6 pages (IV6910-0003 runs to two pages), two planted errors
const textInvoices = [
  { no: 'IV6909-0201', date: '02/09/2569', buyer: BUYERS.siam, items: items([it('bracket', 400), it('screw', 2000), it('bush', 600)]) },
  { no: 'IV6909-0202', date: '05/09/2569', buyer: { ...BUYERS.east, branch: '' }, items: items([it('sheet', 1500), it('hanger', 300)]) },  // buyer branch missing
  { no: 'IV6909-0203', date: '09/09/2569', buyer: BUYERS.food, items: items(Array.from({ length: 16 }, (_, i) => it(Object.keys(P)[i % 8], 10 * (i + 1)))) }, // 2 pages
  { no: 'IV6909-0204', date: '15/09/2569', buyer: BUYERS.korat, items: items([it('shaft', 120)]), vat: 764.0 },                              // VAT wrong (should be 714.00)
  { no: 'IV6909-0205', date: '22/09/2569', buyer: BUYERS.siam, items: items([it('flange', 20), it('cover', 1000)]) },
]

// 10: phone photo of one invoice with a handwritten correction
const photoInvoice = {
  no: 'IV6909-0301', date: '18/09/2569', buyer: BUYERS.korat, items: items([it('hanger', 250), it('screw', 4000)]),
  overlay: `<div class="strike" style="left:142mm;top:47mm;width:30mm"></div><div class="pen" style="left:150mm;top:41mm">19/09/2569</div>`,
}
// 11: scanned PDF, 3 invoices; the second is a receipt (no "ใบกำกับภาษี"), the third has a wrong buyer TIN
const scanned = [
  { no: 'IV6909-0401', date: '03/09/2569', buyer: BUYERS.food, items: items([it('flange', 15), it('bracket', 300)]) },
  { no: 'IV6909-0402', date: '11/09/2569', title: 'ใบเสร็จรับเงิน', buyer: BUYERS.siam, items: items([it('cover', 500)]) },
  { no: 'IV6909-0403', date: '26/09/2569', buyer: { ...BUYERS.east, tin: BUYERS.east.tin.slice(0, 12) + ((Number(BUYERS.east.tin[12]) + 4) % 10) }, items: items([it('shaft', 40), it('screw', 1000)]) },
]
// 12: scanned credit note
const creditNoteHtml = `<section class="page">
  <div class="head"><div><div class="co">${SELLER.name}</div><div>${SELLER.addr}</div><div>เลขประจำตัวผู้เสียภาษี ${SELLER.tin} &nbsp; สำนักงานใหญ่</div></div>
  <div class="title"><div class="t">ใบลดหนี้</div><div>ต้นฉบับ</div></div></div>
  <div class="meta"><div class="box"><div>ลูกค้า: ${BUYERS.siam.name}</div><div>ที่อยู่: ${BUYERS.siam.addr}</div><div>เลขประจำตัวผู้เสียภาษี ${BUYERS.siam.tin} &nbsp; สำนักงานใหญ่</div></div>
  <div class="box right"><div>เลขที่ CN6909-0011</div><div>วันที่ 25/09/2569</div><div>อ้างอิงใบกำกับภาษีเลขที่ IV6909-0201</div></div></div>
  <table><thead><tr><th>รายการ</th><th>มูลค่าตามใบกำกับเดิม</th><th>มูลค่าที่ถูกต้อง</th><th>ผลต่าง</th></tr></thead><tbody>
  <tr><td class="l">ขายึดกันชน เหล็กชุบซิงค์ (คืนสินค้าชำรุด 40 ชิ้น)</td><td>13,500.00</td><td>12,760.00</td><td>740.00</td></tr></tbody></table>
  <div class="sum"><div><span>มูลค่าที่ลดลง</span><span>740.00</span></div><div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>51.80</span></div><div class="g"><span>รวมทั้งสิ้น</span><span>791.80</span></div></div>
  <p>เหตุผล: ลูกค้าคืนสินค้าชำรุด 40 ชิ้น</p>
  <div class="sign"><div>ผู้รับเอกสาร ..................</div><div>ผู้มีอำนาจลงนาม ..................</div></div>
</section>`

const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
const pg = await ctx.newPage()
const render = async (body) => { await pg.setContent(page(body), { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready) }

// 09 text PDF
await render(textInvoices.map((v) => invoiceHtml(v)).join('\n'))
await pg.pdf({ path: `${OUT}/09-ใบกำกับภาษี-PDF-จากโปรแกรม-5ใบ.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true })

// page screenshots → "scans"
async function shots(htmlPages) {
  await render(htmlPages)
  const out = []
  for (const el of await pg.locator('section.page').all()) out.push(await el.screenshot({ type: 'jpeg', quality: 72 }))
  return out
}
// 10 photo: slight rotation, warm paper, shadow
{
  const [img] = await shots(invoiceHtml(photoInvoice))
  await pg.setContent(`<html><body style="margin:0;background:#6b5d4f;display:grid;place-items:center;width:1300px;height:1700px"><img src="data:image/jpeg;base64,${img.toString('base64')}" style="width:1100px;transform:rotate(-2.2deg);box-shadow:0 30px 60px rgba(0,0,0,.5);filter:sepia(.18) contrast(.95) brightness(.97)"></body></html>`)
  await pg.setViewportSize({ width: 1300, height: 1700 })
  writeFileSync(`${OUT}/10-ใบกำกับภาษี-ถ่ายรูปมือถือ-มีแก้ด้วยปากกา.jpg`, await pg.screenshot({ type: 'jpeg', quality: 70 }))
  await pg.setViewportSize({ width: 794, height: 1123 })
}
// 11 scanned PDF: images only, slight grey and tilt
{
  const imgs = await shots(scanned.map((v) => invoiceHtml(v)).join('\n'))
  await pg.setContent(`<html><head><style>@page{size:A4;margin:0}body{margin:0}div{width:210mm;height:297mm;page-break-after:always;display:grid;place-items:center;background:#f2f1ec}img{width:200mm;transform:rotate(.6deg);filter:grayscale(1) contrast(1.15)}</style></head><body>${imgs.map((b) => `<div><img src="data:image/jpeg;base64,${b.toString('base64')}"></div>`).join('')}</body></html>`)
  await pg.pdf({ path: `${OUT}/11-ใบกำกับภาษี-สแกน-3ใบ.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true })
}
// 12 scanned credit note as PNG
{
  const [img] = await shots(creditNoteHtml)
  writeFileSync(`${OUT}/12-ใบลดหนี้-สแกน.jpg`, img)
}
await browser.close()
console.log('written to', OUT)
