"use client";

import { useRouter, usePathname } from "next/navigation";

interface Client { id: string; name: string; }

export default function ClientSelector({
  clients,
  selectedId,
  label = "Client",
}: {
  clients: Client[];
  selectedId: string | null;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val) {
      router.push(`${pathname}?clientId=${val}`);
    } else {
      router.push(pathname);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="client-selector"
        className="text-sm font-medium"
        style={{ color: "var(--brand-text-secondary)" }}
      >
        {label}:
      </label>
      <select
        id="client-selector"
        value={selectedId || ""}
        onChange={handleChange}
        className="text-sm rounded-lg px-3 py-1.5 font-medium transition-colors"
        style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          color: "var(--brand-text)",
          minWidth: 160,
        }}
      >
        <option value="">— Select client —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
