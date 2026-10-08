// Shared UI pieces: status levels (colour + icon shape + text, never colour alone) and small helpers.
import type { ReactNode } from 'react'
import { LEVEL } from './levels'
import type { Level } from './levels'

/** Octagon ✕ = must fix, triangle ! = check, speech bubble ? = ask, circle ✓ = pass, circle – = n/a. */
export function StatusIcon({ level, size = 18, className = '' }: { level: Level; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true as const, className: `shrink-0 ${className}` }
  switch (level) {
    case 'fail':
      return (<svg {...common}><path d="M6.6 1.5h6.8l4.8 4.8v6.8l-4.8 4.8H6.6l-4.8-4.8V6.3z" fill="currentColor" /><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" stroke="var(--surface)" strokeWidth="1.9" strokeLinecap="round" /></svg>)
    case 'warn':
      return (<svg {...common}><path d="M10 1.8l8.6 15.4H1.4z" fill="currentColor" strokeLinejoin="round" /><path d="M10 7.3v4.4" stroke="var(--surface)" strokeWidth="1.9" strokeLinecap="round" /><circle cx="10" cy="14.3" r="1.1" fill="var(--surface)" /></svg>)
    case 'needs_expert':
      return (<svg {...common}><path d="M3 2.5h14a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H9l-4.5 3.5V14.5H3A1.5 1.5 0 011.5 13V4A1.5 1.5 0 013 2.5z" fill="currentColor" /><path d="M8 6.8a2 2 0 113 1.7c-.6.4-1 .8-1 1.5" stroke="var(--surface)" strokeWidth="1.7" fill="none" strokeLinecap="round" /><circle cx="10" cy="12" r="1" fill="var(--surface)" /></svg>)
    case 'pass':
      return (<svg {...common}><circle cx="10" cy="10" r="8.5" fill="currentColor" /><path d="M6 10.2l2.7 2.7L14 7.6" stroke="var(--surface)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>)
    default:
      return (<svg {...common}><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>)
  }
}

/** Icon + label + tint + border. Screen readers hear the level spelled out. */
export function Badge({ level, children, compact = false }: { level: Level; children?: ReactNode; compact?: boolean }) {
  const l = LEVEL[level]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${l.border} ${l.bg} ${l.text} ${compact ? 'px-2 py-0.5 text-[0.875rem]' : 'px-2.5 py-1 text-[0.875rem]'} leading-5 font-semibold whitespace-nowrap`}>
      <StatusIcon level={level} size={compact ? 15 : 16} />
      <span className="sr-only">ระดับ: </span>
      {children ?? l.label}
    </span>
  )
}

