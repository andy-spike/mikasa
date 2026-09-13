"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch relative inline-flex shrink-0 items-center rounded-none p-0.5 transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 data-[size=default]:h-4.5 data-[size=default]:w-8.25 data-[size=sm]:h-3.5 data-[size=sm]:w-6.25 data-checked:bg-over data-unchecked:bg-raised data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 transition-transform data-checked:translate-x-[calc(100%+1px)] data-checked:bg-fg data-unchecked:bg-fg-3 group-data-[size=sm]/switch:size-2.5"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
