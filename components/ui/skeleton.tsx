import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" className={cn("animate-pulse bg-muted", className)} {...props} />
  );
}

export { Skeleton };

export function SkeletonLines({ widths = [10, 6, 8, 5, 9, 7, 4] }: { widths?: number[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <Skeleton key={i} className="h-4 rounded-sm bg-panel" style={{ width: `${w * 8 + 12}%` }} />
      ))}
    </>
  );
}
