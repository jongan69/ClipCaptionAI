interface GlassProgressProps {
  value?: number; // 0-100; optional in indeterminate mode
  indeterminate?: boolean;
  variant?: 'accent' | 'danger' | 'success';
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const variantColors = {
  accent: 'from-accent-cyan to-accent-blue',
  danger: 'from-accent-rose to-red-400',
  success: 'from-accent-green to-emerald-400',
};

export default function GlassProgress({
  value = 0,
  indeterminate,
  variant = 'accent',
  size = 'md',
  label,
  className = '',
}: GlassProgressProps) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || !indeterminate) && (
        <div className="flex justify-between text-xs text-text-dim">
          {label && <span>{label}</span>}
          {!indeterminate && <span>{Math.round(clampedValue)}%</span>}
        </div>
      )}
      <div className={`w-full ${h} bg-glass-bg-strong rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r ${variantColors[variant]} transition-all duration-300 ease-out
            ${indeterminate ? 'animate-[shimmer_2s_ease-in-out_infinite] w-1/2' : ''}`}
          style={indeterminate ? undefined : {width: `${clampedValue}%`}}
        />
      </div>
    </div>
  );
}
