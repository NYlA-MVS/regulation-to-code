# Regulation sources (Rule pack: full tax invoice)

Chosen regulation: **required particulars of a full tax invoice (ใบกำกับภาษีเต็มรูป)**.

| Source | What it says | URL | Retrieved |
|---|---|---|---|
| Revenue Code **section 86/4** (ประมวลรัษฎากร มาตรา 86/4) | The 8 particulars every tax invoice must show, at minimum | https://www.rd.go.th/5208.html (page updated 16-09-2025) | 2026-10-08 |
| **Director-General VAT Notification No. 199** (ประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีมูลค่าเพิ่ม ฉบับที่ 199), announced 26 Dec 2013 | Defines item (8) "other particulars": the buyer's tax ID, and head office / branch notation for issuer and buyer. Applies to invoices issued from 1 Jan 2015 | https://rd.go.th/27982.html (page updated 10-02-2022) | 2026-10-08 |
| Revenue Department SME infographic, tax invoice formats | Plain-language summary, useful for the pitch | https://www.rd.go.th/fileadmin/user_upload/SMEs/infographic/13-1.vat_360.pdf | 2026-10-08 |
| Revenue Department clarification on stating the **buyer's tax ID when the buyer is a VAT-registered operator** | Clarifies when the buyer tax ID is required | Linked from rd.go.th search results; **still to open and read** | — |

## Section 86/4: text (Thai, as quoted from rd.go.th)

ใบกำกับภาษีต้องมีรายการอย่างน้อยดังต่อไปนี้ ("A tax invoice must contain at least the following particulars"):
1. คำว่า "ใบกำกับภาษี" ในที่ที่เห็นได้เด่นชัด (the word "tax invoice" placed prominently)
2. ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีอากรของผู้ประกอบการจดทะเบียนที่ออกใบกำกับภาษี (name, address and tax ID of the registered operator issuing the invoice)
3. ชื่อ ที่อยู่ของผู้ซื้อสินค้าหรือผู้รับบริการ (name and address of the buyer or service recipient)
4. หมายเลขลำดับของใบกำกับภาษี และหมายเลขลำดับของเล่มถ้ามี (serial number of the invoice, and of the book if any)
5. ชื่อ ชนิด ประเภท ปริมาณ และมูลค่าของสินค้าหรือของบริการ (name, kind, type, quantity and value of the goods or services)
6. จำนวนภาษีมูลค่าเพิ่มที่คำนวณจากมูลค่าของสินค้าหรือของบริการ โดยให้แยกออกจากมูลค่า (the VAT amount calculated on that value, shown separately from the value)
7. วัน เดือน ปี ที่ออกใบกำกับภาษี (day, month and year of issue)
8. ข้อความอื่นที่อธิบดีกำหนด (other particulars set by the Director-General, i.e. Notification No. 199)

## Still to verify before the pitch
- [ ] Exactly when the **buyer's tax ID and branch** are required (all buyers, or only VAT-registered buyers): read the clarification page
- [ ] Current **VAT rate** to use in the arithmetic check (keep it as a setting; don't hard-code it)
- [ ] Whether an invoice titled only in English ("Tax Invoice") satisfies item 1 without prior approval
- [ ] Find an **amended or older version** of any rule (for the amendment-diff demo). Option: compare invoices before and after 1 Jan 2015, when Notification 199 took effect.
- [ ] Ask an accountant to confirm our reading (see `../../docs/prep-checklist.md`)

*This is a self-check aid, not legal advice. The official text decides.*
