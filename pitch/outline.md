# Pitch outline

The panel is business, finance and data people (OpenAI APAC GTM, Shopee TH BI & financial strategy, a data/logistics CEO). Lead with impact in baht and minutes, then show the build.

## 3-minute table demo (Round One, Thai or English)

| Time | Show | Say |
|---|---|---|
| 0:00 | The regulation PDF | "Every new announcement means hours of reading, and SMEs still get it wrong." (+ one cited figure) |
| 0:20 | Paste the regulation | "Rulecraft pulls out the requirements that can be checked with data." |
| 0:40 | Review screen | "A person approves each interpretation. The source text sits beside it." |
| 1:00 | Codex builds checks + tests, all green | "Codex compiles each clause into code with its own tests." |
| 1:30 | Upload the shop CSV → report | "Row 17 fails clause 3: here's the quote and the fix." |
| 2:00 | Paste the amended version → diff | "The rule changed: 2 checks changed, and 4 rows now fail." |
| 2:30 | Eval numbers | "Agreement with hand labels: X/30. Mutation score: Y%." (measured on the day) |
| 2:50 | Close | Pitch line |

## Finalist pitch (English preferred)
1. **Problem:** one SME, one regulation, real cost (cited figure, expert quote)
2. **Insight:** compliance knowledge is text, but compliance checking should be code
3. **Live demo:** the table demo above
4. **Why trust it:** a person approves clauses; checks are deterministic; every result cites its source; data stays in the browser
5. **How we used Codex:** parallel worktrees, number of checks and tests Codex wrote, mutation score, AGENTS.md
6. **Sea fit:** Shopee sellers self-check listings and invoices before rules bite; also a template for any new regulation
7. **What's next:** more regulations, marketplace API, association-run rule packs

## Q&A prep
- **"What if Codex misreads the law?"** It can't publish alone: a person approves every clause, tests prove each check, and ambiguous clauses go to an expert.
- **"Is this legal advice?"** No. It's a self-check that cites the official source; a professional has the final word.
- **"Why not just ask ChatGPT?"** A chat answer can't be audited or re-run. Ours is versioned code with tests and citations.
- **"Privacy?"** SME data never leaves the browser.
