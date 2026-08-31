"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

/**
 * Vendored shadcn/base-ui RadioGroup, adapted at the lines it changes.
 *
 * Two adaptations, both recorded here:
 * - **No dot.** The shipped item is a round indicator with a filled centre.
 *   This world carries a chosen state on a raised ground and never on a
 *   mark (the Two Signals rule), and nothing in it is circular, so the item
 *   is a full-width row that steps up when checked.
 * - **The row is the control.** The label and its supporting line live
 *   inside the Radio root rather than beside it, so the whole row is the
 *   hit target and the accessible name.
 *
 * The primitive still owns what it is here for: roving focus, arrow-key
 * movement, the group's ARIA, and typeahead.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "row block w-full px-3 py-3 text-left transition-colors",
        "hover:bg-panel data-[checked]:bg-raised data-[checked]:hover:bg-raised",
        className,
      )}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem };
