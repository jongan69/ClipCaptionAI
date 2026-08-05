import { type ReactNode, type HTMLAttributes } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "strong";
  size?: "default" | "sm" | "lg";
  children?: ReactNode;
}

export default function GlassPanel({
  variant = "default",
  size = "default",
  children,
  className = "",
  ...props
}: GlassPanelProps) {
  const base = variant === "strong" ? "glass-strong" : "glass";
  const radius =
    size === "sm" ? "glass-sm" : size === "lg" ? "glass-lg" : "";
  return (
    <div className={`${base} ${radius} p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
