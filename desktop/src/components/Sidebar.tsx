import { useNavigate } from "react-router-dom";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Home", icon: "🏠", section: "Main" },
  { path: "/interview", label: "Interview Q&A", icon: "🎙️", section: "Quick Actions" },
  { path: "/transcribe", label: "Transcribe", icon: "📝", section: "Core Pipeline" },
  { path: "/caption", label: "Caption", icon: "✏️", section: "Core Pipeline" },
  { path: "/workflow/tighten", label: "Tighten", icon: "✂️", section: "Core Pipeline" },
  { path: "/workflow/chapter", label: "Chapters", icon: "📑", section: "Core Pipeline" },
  { path: "/workflow/enhance", label: "Enhance", icon: "🎬", section: "Core Pipeline" },
  { path: "/workflow/compress", label: "Compress", icon: "📦", section: "Core Pipeline" },
  { path: "/workflow/auto-clips", label: "Smart Clips", icon: "🧠", section: "AI Features" },
  { path: "/workflow/moments", label: "Find Moments", icon: "💎", section: "AI Features" },
  { path: "/workflow/video", label: "Video Run", icon: "🤖", section: "AI Features" },
  { path: "/outputs", label: "Outputs", icon: "📂", section: "Main" },
  { path: "/settings", label: "Settings", icon: "⚙️", section: "Main" },
];

function isActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath.startsWith(itemPath);
}

export default function Sidebar({ collapsed, onToggle, currentPath }: SidebarProps) {
  const navigate = useNavigate();

  const sections = [...new Set(NAV_ITEMS.map((item) => item.section))];

  return (
    <aside
      className={`flex flex-col glass border-0 rounded-none border-r border-glass-border
        transition-all duration-300 ease-out shrink-0
        ${collapsed ? "w-[60px]" : "w-[240px]"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-glass-border shrink-0">
        <button
          onClick={onToggle}
          className="text-text-dim hover:text-text-main transition-colors p-1"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        {!collapsed && (
          <span className="text-base font-semibold bg-gradient-to-r from-accent-cyan to-accent-blue bg-clip-text text-transparent">
            ClipCaptionAI
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {sections.map((section) => (
          <div key={section} className="mb-3">
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {section}
              </div>
            )}
            {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-[10px] text-sm
                  transition-all duration-150 ease-out
                  ${
                    isActive(currentPath, item.path)
                      ? "bg-glass-bg-strong text-text-main border border-glass-border"
                      : "text-text-dim hover:text-text-main hover:bg-glass-bg border border-transparent"
                  }`}
                title={collapsed ? item.label : undefined}
              >
                <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-glass-border text-[11px] text-text-muted">
          ClipCaptionAI Desktop v0.2.0
        </div>
      )}
    </aside>
  );
}
