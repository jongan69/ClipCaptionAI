import { type SelectHTMLAttributes } from "react";

interface GlassSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export default function GlassSelect({
  label,
  options,
  className = "",
  ...props
}: GlassSelectProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs text-text-dim font-medium">{label}</label>
      )}
      <select
        className="w-full border border-glass-border bg-glass-bg-strong text-text-main
          rounded-[10px] px-3 py-2 text-sm
          focus:outline-none focus:border-glass-border-focus
          transition-colors duration-150 appearance-none cursor-pointer
          bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239eb0d4%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
          bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8"
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-mid text-text-main">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
