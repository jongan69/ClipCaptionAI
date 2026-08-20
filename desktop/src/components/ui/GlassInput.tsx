import {type InputHTMLAttributes, forwardRef} from 'react';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({label, error, icon, className = '', ...props}, ref) => {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && <label className="text-xs text-text-dim font-medium">{label}</label>}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{icon}</span>
          )}
          <input
            ref={ref}
            className={`w-full border border-glass-border bg-glass-bg-strong text-text-main
              rounded-[10px] px-3 py-2 text-sm placeholder:text-text-muted
              focus:outline-none focus:border-glass-border-focus focus:bg-glass-bg-hover
              transition-colors duration-150
              ${icon ? 'pl-9' : ''}
              ${error ? 'border-accent-rose/50' : ''}`}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-accent-rose">{error}</span>}
      </div>
    );
  },
);

GlassInput.displayName = 'GlassInput';
export default GlassInput;
