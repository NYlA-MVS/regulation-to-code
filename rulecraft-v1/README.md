# Rulecraft · ตรวจใบกำกับภาษีขาย (v1)

Browser-only tool for Thai factories and SMEs: drop in a sales-tax report (Excel or CSV) and see which tax invoices are missing what Revenue Code s.86/4 and Director-General Notice No. 199 require, with the clause cited and a fix for each problem.

Product spin-off of the hackathon prototype in `../regulation-to-code` (kept separate so the hackathon repo stays clean).

## What v1 does

- Reads `.xlsx`, `.xls` and `.csv`, including UTF-8, UTF-16 and Windows-874 (TIS-620) CSVs saved by Thai Excel
- Finds the header row automatically when the export has title rows above it; sheet picker for workbooks
- Groups line-item rows into invoices: same invoice number and same header details means one invoice. VAT and total may be per line or repeated on every line.
- 11 deterministic checks (TI-01 … TI-10, TI-06b), each tied to the quoted legal text
- Per-invoice "red pen" view, overview matrix, fix list download (CSV with BOM, opens in Excel), print/PDF report
- Remembers column mappings per header layout (localStorage), so next month's export maps itself
- Excel template download
- No server: the file never leaves the browser

## Not in v1

Credit/debit notes, abbreviated tax invoices, e-Tax Invoice XML, 0% VAT (exports), checking that a tax ID is actually VAT-registered, purchase-side (input VAT) checks.

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
