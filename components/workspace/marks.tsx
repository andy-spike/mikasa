export function DoneCheck({
  striking = false,
  className = "",
}: {
  striking?: boolean;
  className?: string;
}) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className={className}>
      <path
        d="M1.5 6.4 4.4 9.3 10.5 2.9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        className={striking ? "mk-check" : undefined}
      />
    </svg>
  );
}

export function LiveMark({ handing = false }: { handing?: boolean }) {
  return (
    <span
      aria-hidden
      className={handing ? "mk-handoff flex" : "flex"}
      style={{ color: "var(--live)" }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 1.5 9.5 6 3 10.5 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function UnsetMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      style={{ color: "var(--mark)" }}
    >
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}
