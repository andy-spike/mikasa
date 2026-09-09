import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mikasa",
  description:
    "Turn your Goal into a private Course. Shape the Outline, learn through connected Lessons and Exercises, and ask the Tutor and Tailor for support.",
};

const DIRECTION_CONTRACT = `<!--
THESIS: The Course is a working shell, not a reading room. It refuses the course player's checklist-and-progress-bar and the paper metaphor at once: everything on screen is information, and the only colour is where you are.
OWN-WORLD: Graphite #0f1012 with three luminance steps up, or paper #ffffff with three steps down; the ground flips, the system does not; surfaces separate by light, never by border, and nothing is a card. One accent — #4fd1a5 on graphite, #0a7f5f on paper — means exactly one thing: the Lesson you are up to, the first that is set and not done. Which Lesson is open is carried by a raised ground, never by colour. Geist sets every word, Geist Mono every number that is data. Hairlines divide; unavailable entries stay in place at a lower ink.
STORY: The learner sees all twenty Lessons at once, reads the one they are up to, marks its Exercise done, and watches the accent hand off to the next.
FIRST VIEWPORT: Dense Outline rail on the left, drawn by the shadcn Sidebar carrying every Lesson without scrolling. The Lesson anchored beside it at a 36rem measure, on the same axis as the chrome above it, so opening the panel never moves the sentence being read. Panel closed at the right edge. Cmd-K opens the command palette, which is navigation, not a shortcut.
FORM: Graphite Workspace, direction roll 21608bd1, re-roll 1, safer register, user-picked, code-led build path.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->
<!--
LANDING: personal-goal-course
THESIS: A personal Goal becomes an approved Outline and a cohesive Course.
OWN-WORLD: Inherit Graphite Workspace, both grounds, Geist, square controls and tonal separation. Preserve DESIGN.md's landing widths.
STORY: Understand the offer, inspect an illustrative photography Outline, learn the approval workflow and capabilities, then start with Google.
FIRST VIEWPORT: Left-aligned display heading and 36rem explanation, primary action beneath, followed by the 60rem two-column Goal and Outline example. Mobile stacks the example in reading order.
FORM: Code-led extension of the landing composition already specified in DESIGN.md. No new visual world or direction roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

/* Runs before first paint, so the shell is never briefly the wrong ground. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("mk-theme"),d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var p=document.querySelector('link[data-mk-favicon="paper"]'),g=document.querySelector('link[data-mk-favicon="graphite"]');if(p&&g){p.media=d?"not all":"all";g.media=d?"all":"not all"}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased", geistSans.variable, geistMono.variable)}
    >
      <head>
        <link
          rel="icon"
          href="/favicon-paper.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: light)"
          data-mk-favicon="paper"
        />
        <link
          rel="icon"
          href="/favicon-graphite.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: dark)"
          data-mk-favicon="graphite"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
