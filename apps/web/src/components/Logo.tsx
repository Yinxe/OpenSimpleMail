export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" opacity="0.08" />
        <rect
          x="6.5"
          y="9.5"
          width="19"
          height="13"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7.5 11l8.5 6.5L24.5 11"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {compact ? null : (
        <span className="logo__word">
          OpenSimple<span>Mail</span>
        </span>
      )}
    </span>
  )
}
