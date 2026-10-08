# AGENTS.md (draft: copy to the repo root at 10:00 on 21 Nov)

## Project
Rulecraft turns one Thai regulation into deterministic, tested TypeScript checks that run on SME CSV data in the browser. Every result cites its clause.

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test` (Vitest)
- Mutation test: `npm run mutate`
- Lint/typecheck: `npm run check`

## Layout
- `src/clauses/`: approved clause JSON (source quote, type, effective date)
- `src/checks/<clauseId>.ts`: one pure function per clause: `(row, mapping) => Verdict`
- `tests/<clauseId>.test.ts`: pass, fail and evasion examples for that clause
- `src/runner/`: CSV parsing, column mapping, running a rule pack
- `src/ui/`: React screens (review, report, traceability)

## Rules
- Checks are pure and deterministic: no network calls, no LLM calls, no randomness.
- Every check exports `clauseId` and returns `{ verdict: "pass" | "fail" | "n/a", evidence, fixHint }`.
- A missing or unmapped field returns `n/a`, never `pass`.
- Normalise Thai text before matching (strip spaces between letters, look-alike characters, emoji).
- Never invent legal requirements. If a clause is ambiguous, stop and add it to `needs_expert.md`.
- User data never goes to a model. Only regulation text and synthetic examples do.

## Done when
- `npm test` passes, and each new check has at least 2 failing and 2 passing examples plus 1 evasion example.
- `npm run mutate` shows that the check fails when its key field is altered.
