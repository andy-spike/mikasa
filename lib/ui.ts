/**
 * What is left of the hand-written control vocabulary.
 *
 * The buttons moved to `components/ui/button.tsx` and the segmented switch
 * to `ToggleGroup`, so one idiom remains: the inset field, which a few
 * inputs still wear directly rather than through `Input` or `Textarea`.
 */

/** Canvas-inset field that steps up to raised on focus, like the composer. */
export const field =
  "w-full bg-panel px-3 py-2.5 text-[0.8125rem] leading-[1.55] text-fg outline-none transition-colors placeholder:text-fg-3 focus:bg-raised";
