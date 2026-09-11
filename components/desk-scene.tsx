import { cn } from "@/lib/utils";

/* The landing's illustrated scene: a warm desk with a sheet mid-outline, a
   pencil, and a cup with steam. Strokes reuse the interface stroke width so
   the drawing sits in the same world as the icons. The pencil band is the
   page's one olive mark; the steam is the only thing that moves after load,
   and it is a scroll-driven reveal, not a loop. Each layer carries
   .mk-settle so the whole scene settles in when it enters the viewport. */
export function DeskScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 340"
      fill="none"
      aria-hidden
      className={cn("w-full", className)}
    >
      {/* soft light from the upper right */}
      <defs>
        <radialGradient id="deskLight" cx="0.72" cy="0.12" r="0.9">
          <stop offset="0" stopColor="var(--over)" stopOpacity="0.65" />
          <stop offset="0.55" stopColor="var(--over)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--over)" stopOpacity="0" />
        </radialGradient>
        {/* The wedges fade across their own width, so a light fall never
            ends in a straight seam on either ground. */}
        <linearGradient id="rayWide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--over)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--over)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--over)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rayEdge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--fg)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--fg)" stopOpacity="0.05" />
          <stop offset="1" stopColor="var(--fg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="420" height="340" fill="url(#deskLight)" />

      {/* light falling across the desk */}
      <path className="desk-ray" d="M330 -20 420 -20 372 360 282 360Z" fill="url(#rayWide)" opacity="0.45" />
      <path d="M372 -20 406 -20 372 360 338 360Z" fill="url(#rayEdge)" opacity="0.5" />

      {/* the desk edge */}
      <path
        d="M18 286H402"
        stroke="var(--rule)"
        strokeWidth="1.5"
        strokeLinecap="square"
        opacity="0.8"
      />

      {/* the sheet, mid-outline */}
      <g>
        <path
          d="M96 92c0-4 3-7 7-7h182c4 0 7 3 7 7v198c0 4-3 7-7 7H103c-4 0-7-3-7-7V92Z"
          fill="var(--panel)"
          stroke="var(--hair)"
        />
        <path d="M130 110h64" stroke="var(--mark)" strokeWidth="1.5" strokeLinecap="square" />
        <path
          d="M116 138h148M116 160h148M116 182h118M116 204h148M116 226h92M116 248h132"
          stroke="var(--fg-dim)"
          strokeWidth="1.5"
          strokeLinecap="square"
          opacity="0.5"
        />
        {/* the line being written: the accent claiming its place */}
        <path
          d="M116 270h48"
          stroke="var(--live)"
          strokeWidth="2"
          strokeLinecap="square"
        />
        {/* the live mark, at home in the outline */}
        <path d="M103 106.5 109.5 111 103 115.5Z" fill="var(--live)" opacity="0.9" />
      </g>

      {/* the pencil, laid down where the writing stopped */}
      <g transform="translate(162 266) rotate(11)" opacity="0.95">
        <path d="M0 0 22-11V11Z" fill="var(--over)" stroke="var(--fg-dim)" strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M0 0 7-2.6V2.6Z" fill="var(--fg-2)" />
        <rect x="22" y="-11" width="128" height="22" rx="3" fill="var(--panel)" stroke="var(--fg-dim)" strokeWidth="1.25" />
        {/* one olive band: this is the mark the page is about */}
        <path d="M40-11V11" stroke="var(--live)" strokeWidth="5" />
        <rect x="150" y="-11" width="14" height="22" fill="var(--raised)" stroke="var(--fg-dim)" strokeWidth="1.25" />
        <path d="M164-11h9a11 11 0 0 1 0 22h-9Z" fill="var(--over)" stroke="var(--fg-dim)" strokeWidth="1.25" strokeLinejoin="round" />
      </g>

      {/* the cup, steam rising */}
      <g transform="translate(-12 0)">
        <path d="M52 216h74v30c0 22-13 38-37 38s-37-16-37-38v-30Z" fill="var(--panel)" stroke="var(--fg-dim)" strokeWidth="1.5" />
        <path d="M126 226h16c9 0 14 7 14 16s-5 16-14 16h-16" stroke="var(--fg-dim)" strokeWidth="1.5" />
        <path d="M52 216h74" stroke="var(--rule)" strokeWidth="1.5" />
        <path
          className="mk-steam"
          pathLength={1}
          style={{ animationDelay: "0ms" }}
          d="M78 206c-8-12 8-18 0-30s8-18 0-28"
          stroke="var(--fg-dim)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          className="mk-steam"
          pathLength={1}
          style={{ animationDelay: "180ms" }}
          d="M100 210c-8-12 8-18 0-30s8-18 0-26"
          stroke="var(--fg-dim)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.36"
        />
      </g>
    </svg>
  );
}
