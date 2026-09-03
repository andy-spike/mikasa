/**
 * The three states a Lesson can be in, drawn once.
 * Done and unset are neutral by design: the accent is spent on live alone.
 */

export function DoneCheck({
  striking = false,
  className = "",
}: {
  /** true only on the Lesson just marked, so the stroke plays once */
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

/** The one accent on the screen. It marks the Lesson you are up to. */
export function LiveMark({
  handing = false,
}: {
  /** true only just after a mark moved it here */
  handing?: boolean;
}) {
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

/** Nothing has been generated here yet. It stays in place; it does not fade out. */
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
