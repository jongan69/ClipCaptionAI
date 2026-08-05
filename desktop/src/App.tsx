import { useState } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import Dashboard from "./views/Dashboard";
import Settings from "./views/Settings";
import InterviewQA from "./views/InterviewQA";
import Transcribe from "./views/Transcribe";
import Caption from "./views/Caption";
import Compress from "./views/Compress";
import Enhance from "./views/Enhance";
import Download from "./views/Download";
import OutputBrowser from "./views/OutputBrowser";
import WorkflowRunner from "./views/WorkflowRunner";
import RunMonitor from "./views/RunMonitor";

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="ambient-bg" />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} currentPath={location.pathname} />
      <main className="flex-1 flex flex-col min-w-0 p-4 pl-2 gap-3 overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/interview" element={<InterviewQA />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/transcribe" element={<Transcribe />} />
          <Route path="/caption" element={<Caption />} />
          <Route path="/workflow/compress" element={<Compress />} />
          <Route path="/workflow/enhance" element={<Enhance />} />
          <Route path="/workflow/download" element={<Download />} />
          <Route path="/workflow/:id" element={<WorkflowRunner />} />
          <Route path="/run/:session" element={<RunMonitor />} />
          <Route path="/outputs" element={<OutputBrowser />} />
        </Routes>
      </main>
      <StatusBar />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
