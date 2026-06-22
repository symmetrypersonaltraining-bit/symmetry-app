"use client";

export default function ExitClientModeButton() {
  function exit() {
    window.location.href = "/api/set-client-mode?mode=0";
  }
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2"
      style={{ background: "var(--brand-primary)", borderBottom: "1px solid rgba(255,255,255,0.2)" }}
    >
      <span className="text-white/70 text-xs">Previewing client view</span>
      <button
        onClick={exit}
        className="flex items-center gap-1 text-white text-xs font-semibold"
      >
        <i className="ti ti-arrow-left text-xs" />
        Trainer View
      </button>
    </div>
  );
}
