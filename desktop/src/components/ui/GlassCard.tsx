import {type ReactNode, type HTMLAttributes} from 'react';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  active?: boolean;
  children?: ReactNode;
}

export default function GlassCard({
  hover,
  active,
  children,
  className = '',
  ...props
}: GlassCardProps) {
  return (
    <div
      className={`glass-sm p-4 transition-all duration-150 ease-out
        ${hover ? 'hover:bg-glass-bg-hover hover:border-glass-border-strong hover:-translate-y-px cursor-pointer' : ''}
        ${active ? 'border-accent-blue/40 bg-glass-bg-strong' : ''}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
