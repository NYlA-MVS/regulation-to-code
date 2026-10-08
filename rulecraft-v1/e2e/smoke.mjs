// End-to-end smoke test against the built app: `npm run build && npx vite preview --port 4174`, then `node e2e/smoke.mjs`.
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const URL = process.env.URL ?? 'http://localhost:4174/'
const OUT = process.env.OUT ?? 'e2e/out'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const fails = []
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) fails.push(msg) }
const seen = async (loc) => loc.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)
const csvFile = (name, lines) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
const HEAD = 'เลขที่ใบกำกับ,วันที่,ชื่อเอกสาร,ชื่อผู้ขาย,ที่อยู่ผู้ขาย,เลขผู้เสียภาษีผู้ขาย,สาขาผู้ขาย,ชื่อลูกค้า,ที่อยู่ลูกค้า,เลขผู้เสียภาษีลูกค้า,สาขาลูกค้า'

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const upload = async (file) => { await page.goto(URL); await page.locator('#file').setInputFiles(file) }

await page.goto(URL)
ok(await seen(page.getByRole('heading', { name: 'ตรวจใบกำกับภาษีขาย ก่อนยื่น ภ.พ.30' })), 'upload: page heading')
ok(await seen(page.getByText('ตรวจในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งไฟล์ออก')), 'upload: privacy promise next to the button')
await page.screenshot({ path: `${OUT}/1-upload.png`, fullPage: true })

// Sample: every column matches, so the mapping step is skipped
await page.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
ok(await seen(page.getByRole('heading', { name: 'ต้องแก้ 5 เรื่อง ใน 5 ใบ ก่อนยื่น ภ.พ.30' })), 'results: verdict first, mapping skipped')
ok(await seen(page.getByText(/หัวคอลัมน์แถวที่ 4 · จับคู่คอลัมน์อัตโนมัติ/)), 'results: says header row and auto-mapping')
ok((await page.locator('article.issue').count()) === 5, 'issues: one card per rule (5)')
await page.getByRole('button', { name: 'เริ่มแก้เรื่องแรก' }).click()
await page.waitForTimeout(100)
ok(await page.evaluate(() => document.activeElement?.classList.contains('issue')), 'issues: "start with the first" focuses the first card')
ok(await seen(page.locator('article.issue').filter({ hasText: 'รายการสินค้า จำนวน หรือมูลค่าไม่ครบ' }).getByText(/รายการที่ 2: จำนวน "0"/)), 'issues: multi-line invoice names the failing line')
await page.screenshot({ path: `${OUT}/2-results.png`, fullPage: true })

const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลดรายการที่ต้องแก้' }).click()])
const csv = readFileSync(await dl.path(), 'utf8')
ok(dl.suggestedFilename().endsWith('.csv') && csv.includes('SP6909-006') && csv.charCodeAt(0) === 0xfeff, `fix list downloaded: ${dl.suggestedFilename()}`)
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ไฟล์เดิมพร้อมผลตรวจ/ }).click()])
const wb = XLSX.read(readFileSync(await dl2.path()))
const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
ok(sheet.length === 12 && sheet[0]['ผลตรวจ'] === 'ผ่าน' && sheet.find((r) => r['เลขที่ใบกำกับ'] === 'SP6909-007')?.['ผลตรวจ'] === 'ต้องแก้', `annotated xlsx: 12 original rows with status (${dl2.suggestedFilename()})`)

// Invoice list with filters
await page.getByRole('tab', { name: /รายการใบ/ }).click()
await page.getByRole('radio', { name: /ต้องแก้/ }).click()
ok((await page.locator('table:has(caption) tbody tr').count()) === 5, 'list: "must fix" filter shows 5 invoices')
await page.screenshot({ path: `${OUT}/3-list.png`, fullPage: true })
await page.getByRole('button', { name: 'ดูใบ SP6909-004' }).click()
ok(await seen(page.getByRole('article', { name: /SP6909-004/ })), 'invoice: opens on paper')
ok(await seen(page.locator('aside').getByText('รายการสินค้า จำนวน หรือมูลค่าไม่ครบ')), 'invoice: margin note in plain words')
await page.screenshot({ path: `${OUT}/4-invoice.png`, fullPage: true })

// ภ.พ.30 summary
await page.getByRole('tab', { name: /สรุป ภ.พ.30/ }).click()
const filing = page.locator('section[aria-labelledby="filing-title"]')
ok(await seen(filing.getByText('15 ต.ค. 2569')) && await seen(filing.getByText('23 ต.ค. 2569')), 'filing: paper 15 / online 23 ต.ค. 2569')
ok(await seen(filing.getByText('7,280.00').first()), 'filing: output VAT for the month')
await page.screenshot({ path: `${OUT}/5-filing.png`, fullPage: true })

// Print shows only the report
await page.emulateMedia({ media: 'print' })
ok(await page.locator('.print-only').isVisible(), 'print: report visible')
ok(!(await page.locator('header.screen-only').isVisible()), 'print: app chrome hidden')
await page.pdf({ path: `${OUT}/6-report.pdf`, format: 'A4' })
await page.emulateMedia({ media: 'screen' })

// Mapping can still be reviewed; a change is remembered for the same header layout
await page.getByRole('button', { name: 'ตรวจการจับคู่คอลัมน์' }).click()
ok((await page.locator('#header-row').inputValue()) === '4', 'mapping: header row 4')
ok((await page.locator('#tax-month').inputValue()) === '2026-09', 'mapping: tax month auto-detected')
ok(await seen(page.getByText('ตรงกับชื่อคอลัมน์').first()), 'mapping: match status in words')
await page.screenshot({ path: `${OUT}/7-mapping.png`, fullPage: true })
await page.locator('#map-total').selectOption('')
await page.getByRole('button', { name: 'ตรวจ 8 ใบ' }).click()
await page.reload()
await page.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
await page.getByRole('button', { name: 'ตรวจการจับคู่คอลัมน์' }).click()
ok((await page.locator('#map-total').inputValue()) === '', 'mapping: remembered after reload')
ok(await seen(page.getByText('จำได้จากครั้งก่อน').first()), 'mapping: remembered status shown')

// Excel with a title row and a tax ID that lost its leading zero
const ws = XLSX.utils.aoa_to_sheet([
  ['รายงานภาษีขาย'],
  ['เลขที่ใบกำกับ', 'วันที่', 'ชื่อเอกสาร', 'ชื่อผู้ขาย', 'ที่อยู่ผู้ขาย', 'เลขผู้เสียภาษีผู้ขาย', 'สาขาผู้ขาย', 'ชื่อลูกค้า', 'ที่อยู่ลูกค้า', 'เลขผู้เสียภาษีลูกค้า', 'สาขาลูกค้า', 'ลูกค้าจด VAT', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'มูลค่าก่อน VAT', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น'],
  ['X-1', new Date(2026, 8, 3), 'ใบกำกับภาษี', 'บริษัท ก จำกัด', '1 ถ.หนึ่ง', 105558123451, 'สำนักงานใหญ่', 'บริษัท ข จำกัด', '2 ถ.สอง', '0105547003211', 'สำนักงานใหญ่', 'Y', 'น็อต', 10, 10, 100, 7, 107],
], { cellDates: true })
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, ws, 'ภาษีขาย')
await upload({ name: 'sales.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'array', bookType: 'xlsx' })) })
ok(await seen(page.getByRole('heading', { name: /ต้องแก้ 1 เรื่อง ใน 1 ใบ/ })), 'xlsx: read with title row skipped')
ok(await seen(page.getByText(/Excel ตัดเลข 0/).first()), 'xlsx: leading-zero tax ID explained')

// Non-spreadsheet rejected
await upload({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
ok(await seen(page.getByRole('alert').getByText('รองรับไฟล์ .xlsx .xls และ .csv เท่านั้น')), 'txt: rejected with message')

// No buyer-VAT column: mapping step shown, then a file-level note and a warning
await upload(csvFile('novat.csv', [
  `${HEAD},รายการ,จำนวน,มูลค่าก่อน VAT,ภาษีมูลค่าเพิ่ม,รวมทั้งสิ้น`,
  'N-1,1 ต.ค. 2569,TAX INVOICE,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,นายสมชาย ใจดี,2 ถ.สอง,,,น็อต,10,100.00,7.00,107.00',
  'N-2,2 ต.ค. 2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,3 ถ.สาม,0105547003211,,สกรู,5,50.00,3.50,53.50',
]))
ok(await seen(page.getByRole('heading', { name: 'ตรวจการจับคู่คอลัมน์' })), 'mapping step shown when a recommended column is missing')
await page.getByRole('button', { name: 'ตรวจ 2 ใบ' }).click()
ok(await seen(page.getByRole('heading', { name: 'ไม่มีเรื่องที่ต้องแก้ · ควรตรวจสอบ 1 เรื่อง' })), 'no VAT column: English title + Thai-month dates pass, missing branch warns')
ok(await seen(page.getByText('1 ใบไม่บอกว่าผู้ซื้อจด VAT หรือไม่')), 'no VAT column: file-level note')

// Required column missing blocks the check
await upload(csvFile('noinv.csv', ['วันที่,ชื่อลูกค้า,มูลค่าก่อน VAT', '1/9/2569,บริษัท ข จำกัด,100']))
ok(await seen(page.getByRole('alert').getByText(/ยังขาดช่องจำเป็น/)), 'mapping: error summary lists missing required fields')
ok(await page.getByRole('button', { name: /^ตรวจ \d+ ใบ$/ }).isDisabled(), 'mapping: check blocked until required fields are matched')

// Credit note, cancelled invoice + replacement, and a reissue with the same number (ask an expert)
await upload(csvFile('p3.csv', [
  `${HEAD},ลูกค้าจด VAT,รายการ,จำนวน,ราคาต่อหน่วย,มูลค่าก่อน VAT,ภาษีมูลค่าเพิ่ม,รวมทั้งสิ้น,สถานะ,ออกแทนใบเลขที่,อ้างอิงใบกำกับเดิม,มูลค่าเดิม,มูลค่าที่ถูกต้อง,เหตุผล`,
  'P-1,03/09/2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,น็อต,10,100,1000.00,70.00,1070.00,ยกเลิก,,,,,',
  'P-2,03/09/2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,น็อต,10,100,1000.00,70.00,1070.00,,P-1,,,,',
  'CN-1,10/09/2569,ใบลดหนี้,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,,,,200.00,14.00,214.00,,,P-2,1000.00,800.00,คืนสินค้า 2 ชิ้น',
  'P-3,12/09/2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,น็อต,1,100,100.00,7.00,107.00,,P-3,,,,',
]))
if (await page.getByRole('heading', { name: 'ตรวจการจับคู่คอลัมน์' }).isVisible()) await page.getByRole('button', { name: /^ตรวจ \d+ ใบ$/ }).click()
ok(await seen(page.getByRole('heading', { name: 'ไม่มีเรื่องที่ต้องแก้ · ควรตรวจสอบ 1 เรื่อง' })), 'P3: cancelled, replacement and credit note pass; same-number reissue asks an expert')
await page.getByRole('button', { name: 'คัดลอกคำถามถึงนักบัญชี' }).click()
ok(await seen(page.getByRole('button', { name: 'คัดลอกแล้ว' })), 'P3: question copied for the accountant')
ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith('สอบถามเรื่อง:'), 'P3: clipboard holds the question')
await page.getByRole('tab', { name: /สรุป ภ.พ.30/ }).click()
ok(await seen(filing.getByText('900.00').first()), 'P3: filing nets the credit note and skips the cancelled invoice (1,000 − 200 + 100)')
await page.getByRole('tab', { name: /รายการใบ/ }).click()
await page.getByRole('button', { name: 'ดูใบ P-1' }).click()
ok(await seen(page.locator('article').getByText('ยกเลิก', { exact: true })), 'P3: cancelled stamp on the paper')
await page.getByRole('tab', { name: /เรื่องที่ต้องดู/ }).click()
await page.getByText('ตรวจด้วยตาก่อนส่งใบให้ลูกค้า').click()
await page.getByLabel(/ตีพิมพ์ไว้ หรือพิมพ์จากคอมพิวเตอร์ทั้งฉบับ ไม่ใช่/).check()
ok(await seen(page.getByText('1/9')), 'manual checklist counts ticks')

// Reference pages
await page.getByRole('button', { name: 'ข้อกำหนดที่ตรวจ' }).click()
ok(await seen(page.getByRole('heading', { name: 'ข้อกำหนดที่ตรวจ' })), 'rules page')
await page.getByRole('button', { name: 'วิธีใช้' }).click()
ok(await seen(page.getByRole('heading', { name: 'ตรวจในสามขั้น' })), 'help page')

// Trial files in test-files/ (regenerate with node scripts/make-test-files.mjs)
const TRIALS = [
  ['01-รายงานภาษีขาย-ก.ย.2569-จากโปรแกรมบัญชี.xlsx', 'ต้องแก้ 7 เรื่อง ใน 7 ใบ ก่อนยื่น ภ.พ.30'],
  ['02-ภาษีขาย-แถวละใบ-Excel-ภาษาไทยรุ่นเก่า-TIS620.csv', 'ต้องแก้ 1 เรื่อง ใน 1 ใบ ก่อนยื่น ภ.พ.30'],
  ['03-ถูกต้องทั้งหมด-ควรผ่านทุกข้อ.xlsx', 'ทั้ง 10 ใบผ่านทุกข้อตรวจ'],
  ['04-ใบลดหนี้-ใบเพิ่มหนี้-ยกเลิก-ส่งออก.xlsx', 'ต้องแก้ 3 เรื่อง ใน 3 ใบ ก่อนยื่น ภ.พ.30'],
  ['05-English-headers-online-accounting.csv', 'ต้องแก้ 2 เรื่อง ใน 2 ใบ ก่อนยื่น ภ.พ.30'],
  ['06-หลายชีต-ชีตแรกเป็นสรุป.xlsx', 'ทั้ง 6 ใบผ่านทุกข้อตรวจ'],
  ['08-ไฟล์ใหญ่-2000ใบ.xlsx', 'ต้องแก้ 2 เรื่อง ใน 5 ใบ ก่อนยื่น ภ.พ.30'],
]
for (const [file, verdict] of TRIALS) {
  await page.goto(URL)
  await page.locator('#file').setInputFiles(`test-files/${file}`)
  ok(await seen(page.getByRole('heading', { name: verdict })), `trial ${file.slice(0, 2)}: ${verdict}`)
}
await page.goto(URL)
await page.locator('#file').setInputFiles('test-files/07-ขาดคอลัมน์ภาษีมูลค่าเพิ่ม.xlsx')
ok(await seen(page.getByRole('alert').getByText('ยังขาดช่องจำเป็น 1 ช่อง')), 'trial 07: blocked, VAT column missing')

// Phone width, both themes: no horizontal page scroll
for (const scheme of ['light', 'dark']) {
  const m = await browser.newPage({ viewport: { width: 360, height: 780 }, colorScheme: scheme })
  await m.goto(URL)
  const check = async (step) => {
    const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(over <= 0, `360px ${scheme} ${step}: no horizontal overflow (${over}px)`)
  }
  await check('upload')
  await m.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
  await check('issues')
  for (const t of [/รายการใบ/, /ดูทีละใบ/, /สรุป ภ.พ.30/]) { await m.getByRole('tab', { name: t }).click(); await check(String(t)) }
  await m.getByRole('button', { name: 'ตรวจการจับคู่คอลัมน์' }).click()
  await check('mapping')
  await m.screenshot({ path: `${OUT}/8-mobile-${scheme}.png`, fullPage: true })
  await m.close()
}

ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED')
process.exit(fails.length ? 1 : 0)
