import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-gradient-to-r from-[#3242CA] via-[#7054b8] to-[#d7795f] text-white hover:brightness-110 focus-visible:ring-amber-200/70",
  secondary:
    "bg-white/12 text-stone-100 hover:bg-white/18 focus-visible:ring-white/60",
  ghost:
    "bg-transparent text-stone-200 hover:bg-white/10 hover:text-white focus-visible:ring-white/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 py-2.5 text-sm",
  sm: "h-9 px-3 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-11 w-11",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120f1b] disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
