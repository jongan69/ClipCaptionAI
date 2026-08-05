import { type ReactNode, useState } from "react";

interface GlassTabsProps {
  tabs: { id: string; label: string; icon?: ReactNode }[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export default function GlassTabs({
  tabs,
  activeTab,
  onChange,
  className = "",
}: GlassTabsProps) {
  return (
    <div className={`flex gap-1 p-1 glass-sm bg-glass-bg ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] transition-all duration-150
            ${
              activeTab === tab.id
                ? "bg-glass-bg-strong text-text-main shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                : "text-text-dim hover:text-text-main"
            }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
