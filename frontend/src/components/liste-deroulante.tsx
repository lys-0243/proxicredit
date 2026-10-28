import { cn } from "@/lib/utils";

/** Liste déroulante native : robuste, accessible et utilisable au clavier sans configuration. */
export function ListeDeroulante({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none",
        "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
