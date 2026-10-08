# Event-day plan: Sat 21 Nov 2026

Official schedule (Luma): hacking 10:00 → **code freeze 17:00** → Round One judging 17:15 → finalists 19:30 → awards 20:30. That's about **7 hours of building**.

## Roles (adjust to the team)

| Role | Owns |
|---|---|
| **A · Pipeline** | Clause extractor + Codex check compiler + CI gate |
| **B · Runner** | CSV import, column mapping, deterministic runner, report |
| **C · UI** | Review screen, traceability matrix, demo flow |
| **D · Data & pitch** | Labelled test CSVs, mutation tests, eval numbers, slides, demo rehearsal |

## Timeline

| Time | Everyone / milestone |
|---|---|
| 10:00–10:30 | Create the repo, copy in `AGENTS.md`, one Codex Plan-mode pass to split the work into 4 modules, one git worktree per person |
| 10:30–12:30 | A: extractor + compiler for 3 clauses. B: CSV runner. C: review UI skeleton. D: load prepared CSVs, write the expected-results file |
| 12:30 | **Integration #1**: one clause, end to end, ugly is fine |
| 13:00–15:00 | Extend to all chosen clauses; traceability matrix; mutation tests; evasion normalisation |
| 15:00–15:30 | Amendment flow (killer feature): paste a v2 text, show the check diff and rows that newly fail |
| **15:30** | **Feature freeze**: bugs only |
| 15:30–16:30 | `/review` and merge; run the eval and put the numbers in the slides |
| 16:30–17:00 | Record a backup demo video; final commit |
| 17:00–19:30 | Rehearse a 3-minute table demo (Thai or English) and the finalist pitch (English preferred) |

## Codex workflow (make it visible, since it's a judging criterion)

- Write every task as **Goal / Context / Constraints / Done when (tests pass)**.
- Each person runs Codex in their own worktree, in parallel.
- Codex writes the checks **and** their tests; `/review` before every merge.
- Keep a running note of Codex sessions, tests written and mutation score for the "How we used Codex" slide.
- Check the model picker on the day (the model names in press reports couldn't be verified).

## Cut list if behind schedule

1. Drop the amendment diff and keep one version.
2. Drop mutation tests and keep unit tests + hand-labelled agreement.
3. Drop PDF import and paste the text instead.

Never cut: human review of clauses, citations on every result, the live run on SME data.
