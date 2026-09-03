"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Adapted at this line: the shipped variants are uppercase at
   tracking-widest, which spends the system's one label style on a control,
   and they carry a focus ring. This world has one uppercase style and no
   rings — a chosen segment is a luminance step. */
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-fg-3 transition-colors duration-150 outline-none hover:text-fg-2 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-raised aria-pressed:text-fg data-[pressed]:bg-raised data-[pressed]:text-fg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        /* No border anywhere in this world: separation is a ground step. */
        outline: "bg-transparent hover:bg-muted",
      },
      size: {
        default: "px-3 py-1.5",
        sm: "px-2.5 py-1",
        lg: "px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
