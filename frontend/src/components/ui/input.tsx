import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-amber-100/15 bg-[#241a24]/70 px-4 py-3 text-base text-white placeholder:text-stone-300/40 outline-none transition-colors focus-visible:border-amber-300/50 focus-visible:ring-1 focus-visible:ring-amber-300/45 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
