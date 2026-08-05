import { type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-dark border-transparent font-semibold",
  secondary:
    "glass-strong text-text-main hover:bg-glass-bg-hover",
  danger:
    "border-accent-rose/40 text-accent-rose hover:bg-accent-rose/10",
  ghost:
    "border-transparent text-text-dim hover:text-text-main hover:bg-glass-bg",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-[10px] gap-1.5",
  md: "px-4 py-2 text-sm rounded-[10px] gap-2",
  lg: "px-6 py-3 text-base rounded-[12px] gap-2.5",
};

export default function GlassButton({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center border transition-all duration-150 ease-out
        hover:-translate-y-px active:translate-y-0
        disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
