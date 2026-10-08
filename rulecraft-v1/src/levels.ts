// Status levels: label, colours and order. Shared by every screen.
import type { Verdict } from './rules/checks'

export type Level = 'fail' | 'warn' | 'needs_expert' | 'pass' | 'n/a'

export const LEVEL: Record<Level, { label: string; long: string; text: string; bg: string; border: string; rank: number }> = {
  fail: { label: 'ต้องแก้', long: 'ต้องแก้ก่อนยื่น', text: 'text-fail', bg: 'bg-fail-bg', border: 'border-fail-line', rank: 0 },
  warn: { label: 'ควรตรวจสอบ', long: 'ควรตรวจสอบ', text: 'text-warn', bg: 'bg-warn-bg', border: 'border-warn-line', rank: 1 },
  needs_expert: { label: 'ถามผู้เชี่ยวชาญ', long: 'ควรถามนักบัญชี', text: 'text-expert', bg: 'bg-expert-bg', border: 'border-expert-line', rank: 2 },
  pass: { label: 'ผ่าน', long: 'ผ่าน', text: 'text-pass', bg: 'bg-pass-bg', border: 'border-pass-line', rank: 3 },
  'n/a': { label: 'ไม่เกี่ยว', long: 'ไม่เกี่ยวกับใบนี้', text: 'text-info', bg: 'bg-info-bg', border: 'border-info-line', rank: 4 },
}
export const PROBLEM_LEVELS: Level[] = ['fail', 'warn', 'needs_expert']

/** Highest-severity level among verdicts (Carbon: consolidate to the most severe). */
export function worst(verdicts: (Verdict | undefined)[]): Level {
  let best: Level = 'n/a'
  for (const v of verdicts) if (v && LEVEL[v as Level].rank < LEVEL[best].rank) best = v as Level
  return best
}

export const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
