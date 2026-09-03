import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Vendored shadcn/base-ui Button, adapted at the variants.
 *
 * The shipped set is uppercase at `tracking-widest` with a focus ring and a
 * `translate-y` on press. This world has exactly one uppercase style — the
 * 0.6875rem label — and no rings; a control that wants more weight takes a
 * luminance step. So the variants are the four controls DESIGN.md names,
 * plus the two the product actually needs beside them, and the padding is
 * part of the variant because each control has its own.
 *
 * The primitive still owns the button semantics, the disabled handling and
 * `render`, which is how a Link wears a button here.
 */
const buttonVariants = cva(
  /* The base carries behaviour only. Layout lives on the variants, so a
     control whose shape is its container can take `bare` and bring its
     own. */
  "transition-colors duration-150 outline-none select-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The most important action on a working screen, and still greyscale. */
        primary:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-raised px-4 py-2.5 text-[0.8125rem] font-medium text-fg hover:bg-over disabled:opacity-40 disabled:hover:bg-raised",
        /** A Persuade surface has one action, so it sits one step higher. */
        hero: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-over px-5 py-3 text-[0.875rem] font-medium text-fg hover:bg-rule disabled:opacity-40 disabled:hover:bg-over",
        /** A second action beside the first, or an inline Approve. */
        compact:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-over px-2.5 py-1.5 text-[0.75rem] font-medium text-fg hover:bg-rule disabled:opacity-40",
        /** No ground at all. Undo, Cancel, Back. */
        quiet:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-1 text-[0.8125rem] text-fg-3 hover:text-fg",
        /** Quiet, but the word already says it is destructive. */
        discard:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-1 text-[0.8125rem] text-fg-3 hover:text-bad",
        /** Chrome. Third ink on nothing, stepping up on hover. */
        icon: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-panel hover:text-fg",
        /** The same, on a surface that is already one step up. */
        "icon-raised":
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
        /* The two names the other vendored components ask for by hand —
           Dialog, Sheet and Sidebar all reach for a ghost close button. They
           are aliases onto this world's idiom, not a second vocabulary. */
        ghost:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
        outline:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-raised px-4 py-2.5 text-[0.8125rem] font-medium text-fg hover:bg-over",
        /** Its container is its shape: a rename trigger, a Next-Lesson row. */
        bare: "",
      },
      size: {
        /* Padding lives on the variant; size only exists because the
           vendored components pass it. */
        default: "",
        "icon-sm": "",
        icon: "",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

function Button({
  className,
  variant,
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      /* `render` here is almost always a Link, and an anchor is not a
         native button. Saying so keeps the anchor's own semantics — a link
         is navigation, not an action — instead of asserting a <button>
         that is not in the tree. A caller rendering a real <button> can
         set this back to true. */
      nativeButton={nativeButton ?? render === undefined}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
