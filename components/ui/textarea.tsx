import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full resize-none bg-panel px-3 py-2.5 text-[0.8125rem] leading-[1.55] text-fg outline-none transition-colors placeholder:text-fg-3 focus:bg-raised disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
