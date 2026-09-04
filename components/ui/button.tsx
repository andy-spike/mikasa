import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "transition-colors duration-150 outline-none select-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-raised px-4 py-2.5 text-[0.8125rem] font-medium text-fg hover:bg-over disabled:opacity-40 disabled:hover:bg-raised",
        hero: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-over px-5 py-3 text-[0.875rem] font-medium text-fg hover:bg-rule disabled:opacity-40 disabled:hover:bg-over",
        compact:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-over px-2.5 py-1.5 text-[0.75rem] font-medium text-fg hover:bg-rule disabled:opacity-40",
        quiet:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-1 text-[0.8125rem] text-fg-3 hover:text-fg",
        discard:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-1 text-[0.8125rem] text-fg-3 hover:text-bad",
        icon: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-panel hover:text-fg",
        "icon-raised":
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
        ghost:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
        outline:
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-raised px-4 py-2.5 text-[0.8125rem] font-medium text-fg hover:bg-over",
        bare: "",
      },
      size: {
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
      nativeButton={nativeButton ?? render === undefined}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
