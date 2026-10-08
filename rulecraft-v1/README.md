# Rulecraft · ตรวจใบกำกับภาษีขาย (v1)

Browser-only tool for Thai factories and SMEs: drop in a sales-tax report (Excel or CSV) and see which tax invoices are missing what Revenue Code s.86/4 and Director-General Notice No. 199 require, with the clause cited and a fix for each problem.

Product spin-off of the hackathon prototype in `../regulation-to-code` (kept separate so the hackathon repo stays clean).

## What v1 does

- Reads `.xlsx`, `.xls` and `.csv`, including UTF-8, UTF-16 and Windows-874 (TIS-620) CSVs saved by Thai Excel
- Finds the header row automatically when the export has title rows above it; sheet picker for workbooks
- Groups line-item rows into invoices by seller TIN + branch + book + number; VAT and total may be per line or repeated on every line
- Deterministic checks, each tied to quoted legal text (see the in-app "ข้อกำหนดที่ตรวจ" page):
  - Revenue Code s.86/4 particulars and DG Notice 199 branch/buyer rules (TI-01 … TI-10, TI-06b)
  - Totals, header consistency, qty × price, rate by date, tax month, name consistency, entity abbreviations, individual surnames (TI-11 … TI-18)
  - Cancel-and-reissue, foreign currency, zero-rated/exempt lines, abbreviated invoices to VAT buyers, tax point vs delivery/payment (TI-21 … TI-25)
  - Credit and debit notes, s.86/9–86/10 (CN-01 … CN-04)
- Verdicts: ต้องแก้ (fail), ควรตรวจสอบ (warn), ถามผู้เชี่ยวชาญ (needs expert), ผ่าน, ไม่เกี่ยว
- ภ.พ.30 summary per premises and tax month with due dates; credit notes subtract, cancelled invoices are not summed
- Per-invoice "red pen" view, overview matrix, fix list download (CSV with BOM, opens in Excel), print/PDF report, manual checklist for what a file cannot show
- Remembers column mappings per header layout (localStorage); Excel template download
- No server: the file never leaves the browser

Legal basis and open questions: `reports/กฎหมาย ตรวจใบกำกับภาษีขาย ก่อนยื่นภาษี.md` in the hackathon repo. Rates and filing dates that change by decree live in `src/rules/rates.ts`.

## Not yet

e-Tax Invoice XML input, POS abbreviated-invoice reports, checking that a tax ID is actually VAT-registered, purchase-side (input VAT) checks.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (vitest)
npm run build        # single self-contained dist/index.html
npx vite preview --port 4174 && node e2e/smoke.mjs   # browser smoke test (uses installed Chrome)
```

`npm run build` emits one HTML file with everything inlined, so it can be hosted anywhere static (GitHub Pages, Netlify, an S3 bucket) or emailed and opened offline.

Results are a self-check, not legal or tax advice.
