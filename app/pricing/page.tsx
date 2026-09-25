import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";
import { Reveal } from "@/components/reveal";
import { LiveMark } from "@/components/workspace/marks";
import "../landing.css";

export const metadata: Metadata = {
  title: "Pricing · Mikasa",
  description:
    "Credits pay for Course creation, Tutor answers, and Tailor changes. Subscribe monthly or buy a credit pack. Credits never expire.",
};

// ponytail: placeholder until the payments branch lands its checkout route.
const checkoutHref = (plan: string) => `/checkout?plan=${plan}`;

const monthly = [
  "The lowest rate: $1 for every 100 credits.",
  "Unused credits roll over, up to 3,000.",
  "Cancel anytime and keep your credits.",
];

const packs = [
  { id: "pack-400", price: "$5", credits: "400 credits", rate: "$1.25 per 100" },
  { id: "pack-1800", price: "$20", credits: "1,800 credits", rate: "$1.11 per 100" },
];

// Estimates at the current model's rates; recalibrate from real usage.
const costs = [
  ["A Course at Just enough to reach the Goal", "25–50"],
  ["A Course at Solid working knowledge", "60–120"],
  ["A Course at Deep mastery", "130–250"],
  ["Grounding, added to a Course", "about +20%"],
  ["A Tailor Change plan", "2–10"],
  ["A Tutor answer", "about 1"],
];

const terms = [
  [
    "Metered by use",
    "Every request spends credits in proportion to the model and search work it takes. A short Tutor answer costs less than a long one.",
  ],
  [
    "Held at Outline approval",
    "When you approve an Outline, Mikasa holds the Course's estimated credits and returns whatever it doesn't use. A Course never stops halfway.",
  ],
  [
    "Credits never expire",
    "Credits from a pack stay until you spend them. Monthly credits roll over, up to 3,000.",
  ],
  [
    "Cancel anytime",
    "Your subscription ends at the close of the billing month. You keep every credit you have.",
  ],
];

export default function Pricing() {
  return (
    <div id="top" className="landing-page relative min-h-full bg-canvas">
      <div aria-hidden="true" className="landing-paper" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        Skip to content
      </a>
      <MarketingHeader />

      <main
        id="main"
        className="relative z-[1] mx-auto max-w-[64rem] px-5 pt-[3.5rem] sm:px-8 lg:px-0"
      >
        <section className="pt-24 pb-16 sm:pt-32" aria-labelledby="pricing-title">
          <h1
            id="pricing-title"
            className="mk-rise max-w-[40rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]"
          >
            Pay for the learning you do.
          </h1>
          <p
            style={{ animationDelay: "90ms" }}
            className="mk-rise mt-5 max-w-[36rem] text-base leading-[1.72] text-pretty text-fg-2"
          >
            Credits pay for every Course, Tutor answer, and Tailor change. Subscribe for the best
            rate, or buy a pack when you need one.
          </p>
        </section>

        <section aria-labelledby="monthly-title" className="pb-20 sm:pb-24">
          <Reveal className="grid gap-10 border-y border-hair py-10 md:grid-cols-2 md:py-14">
            <div>
              <h2
                id="monthly-title"
                className="flex items-center gap-2 text-base font-semibold tracking-[-0.011em]"
              >
                Monthly
                <LiveMark />
              </h2>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="tnum text-[4rem] leading-none font-semibold tracking-[-0.035em]">
                  $10
                </span>
                <span className="text-[0.9375rem] text-fg-3">/month</span>
              </p>
              <p className="tnum mt-4 text-base text-fg">1,000 credits every month</p>
            </div>
            <div className="flex flex-col justify-between gap-8">
              <ul className="space-y-3 text-[0.9375rem] leading-[1.62] text-fg-2">
                {monthly.map((point) => (
                  <li key={point} className="flex gap-3">
                    <Check
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="mt-[0.2rem] shrink-0 text-fg-3"
                    />
                    {point}
                  </li>
                ))}
              </ul>
              <Button
                variant="hero"
                render={<Link href={checkoutHref("monthly")} />}
                className="min-h-11 self-start"
              >
                Subscribe
              </Button>
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="packs-title" className="pb-28 sm:pb-36">
          <Reveal className="max-w-[44rem]">
            <h2 id="packs-title" className="text-base font-semibold tracking-[-0.011em]">
              Or buy credits once
            </h2>
            <p className="mt-1 text-[0.9375rem] text-fg-3">
              Pack credits never expire. No subscription.
            </p>
            <ul className="mt-6 border-t border-hair">
              {packs.map((pack) => (
                <li
                  key={pack.id}
                  className="grid grid-cols-[4rem_1fr_auto] items-center gap-x-4 border-b border-hair py-4"
                >
                  <span className="tnum text-xl font-semibold tracking-[-0.02em]">
                    {pack.price}
                  </span>
                  <span className="text-[0.9375rem] text-fg">
                    <span className="tnum">{pack.credits}</span>
                    <span className="tnum block text-[0.8125rem] text-fg-3 sm:ml-3 sm:inline">
                      {pack.rate}
                    </span>
                  </span>
                  <Button variant="primary" render={<Link href={checkoutHref(pack.id)} />}>
                    Buy
                    <span className="sr-only"> {pack.credits}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section aria-labelledby="costs-title" className="pb-28 sm:pb-36">
          <Reveal className="max-w-[44rem]">
            <h2
              id="costs-title"
              className="text-[1.75rem] leading-[1.16] font-semibold tracking-[-0.026em] sm:text-[2.25rem]"
            >
              What credits buy
            </h2>
            <p className="mt-4 max-w-[36rem] text-base leading-[1.72] text-fg-2">
              Typical use, so you can plan. The real figure depends on the Topic and how long each
              Lesson runs, and Mikasa shows its estimate before it writes a Course.
            </p>
            <table className="mt-8 w-full text-[0.8125rem]">
              <thead>
                <tr className="border-b border-rule text-left text-fg-3">
                  <th scope="col" className="label pb-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="label pb-3 text-right font-semibold">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {costs.map(([action, credits]) => (
                  <tr key={action} className="border-b border-hair">
                    <td className="py-3 pr-4 text-fg-2">{action}</td>
                    <td className="tnum py-3 text-right font-mono whitespace-nowrap text-fg">
                      {credits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </section>

        <section aria-labelledby="terms-title" className="pb-28 sm:pb-40">
          <Reveal className="max-w-[44rem]">
            <h2
              id="terms-title"
              className="text-[1.75rem] leading-[1.16] font-semibold tracking-[-0.026em] sm:text-[2.25rem]"
            >
              How credits work
            </h2>
            <dl className="mt-8 border-t border-hair">
              {terms.map(([term, detail]) => (
                <div
                  key={term}
                  className="grid gap-1 border-b border-hair py-5 sm:grid-cols-[14rem_1fr] sm:gap-6"
                >
                  <dt className="text-base font-semibold tracking-[-0.011em]">{term}</dt>
                  <dd className="text-[0.9375rem] leading-[1.62] text-fg-2">{detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
