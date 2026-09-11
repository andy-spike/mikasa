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
      <body className="grain h-full">
        {children}
      </body>
    </html>
  );
}
