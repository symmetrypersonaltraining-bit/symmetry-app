"use client";

// ============================================================================
// Help & Tutorials centre (Settings → Help & Tutorials).
// Searchable how-to for every feature. Content lives in
// src/lib/help/articles.ts; this is just the UI + search box.
// Clients never see trainer-only articles (gated by `isTrainer`).
// ============================================================================

import { useMemo, useState } from "react";
import { HELP_ARTICLES, HELP_CATEGORIES, filterArticles, type HelpArticle } from "@/lib/help/articles";

export default function HelpCenter({ isTrainer }: { isTrainer: boolean }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(
    () => filterArticles(HELP_ARTICLES, query, isTrainer),
    [query, isTrainer],
  );

  // Group the filtered results by category, preserving the canonical order.
  const grouped = useMemo(() => {
    const byCat = new Map<string, HelpArticle[]>();
    for (const a of results) {
      const arr = byCat.get(a.category) ?? [];
      arr.push(a);
      byCat.set(a.category, arr);
    }
    return HELP_CATEGORIES
      .filter((c) => byCat.has(c))
      .map((c) => ({ category: c, items: byCat.get(c)! }));
  }, [results]);

  return (
    <section>
      <p className="section-header">Help &amp; Tutorials</p>
      <div className="card p-4 space-y-4">
        {/* Search box */}
        <div className="relative">
          <i
            className="ti ti-search"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--brand-text-secondary)", fontSize: 16 }}
          />
          <input
            type="text"
            inputMode="search"
            placeholder="Search help — e.g. log a meal, weigh-in, photos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-sm rounded-lg"
            style={{ padding: "10px 34px 10px 36px", background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--brand-text-secondary)", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
            >
              <i className="ti ti-x" />
            </button>
          )}
        </div>

        {/* Result count when searching */}
        {query && (
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {results.length === 0
              ? "No matching help topics — try a different word."
              : `${results.length} topic${results.length === 1 ? "" : "s"} found`}
          </p>
        )}

        {/* Grouped, expandable articles */}
        <div className="space-y-5">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--brand-text-secondary)", letterSpacing: "0.05em" }}>
                {category}
              </p>
              <div className="space-y-2">
                {items.map((a) => {
                  const open = openId === a.id;
                  return (
                    <div
                      key={a.id}
                      className="rounded-xl overflow-hidden"
                      style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}
                    >
                      <button
                        onClick={() => setOpenId(open ? null : a.id)}
                        aria-expanded={open}
                        className="w-full flex items-center gap-3 text-left"
                        style={{ padding: "12px 14px", background: "none", border: "none", cursor: "pointer" }}
                      >
                        <i className={"ti ti-" + a.icon} style={{ color: "var(--brand-primary)", fontSize: 18, flexShrink: 0 }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{a.title}</span>
                          {!open && (
                            <span className="block text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>{a.intro}</span>
                          )}
                        </span>
                        {a.audience === "trainer" && (
                          <span className="badge badge-primary flex-shrink-0" style={{ fontSize: 10 }}>Trainer</span>
                        )}
                        <i className={"ti ti-chevron-" + (open ? "up" : "down")} style={{ color: "var(--brand-text-secondary)", fontSize: 14, flexShrink: 0 }} />
                      </button>
                      {open && (
                        <div style={{ padding: "0 14px 14px 14px" }}>
                          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>{a.intro}</p>
                          <ol className="space-y-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                            {a.steps.map((s, i) => (
                              <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--brand-text)" }}>
                                <span
                                  className="flex-shrink-0 flex items-center justify-center font-bold"
                                  style={{ width: 20, height: 20, borderRadius: 6, fontSize: 11, background: "var(--brand-primary)", color: "#fff", marginTop: 1 }}
                                >
                                  {i + 1}
                                </span>
                                <span style={{ lineHeight: 1.45 }}>{s}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs pt-1" style={{ color: "var(--brand-text-secondary)" }}>
          Can&rsquo;t find what you need? Message your coach from the Messages tab.
        </p>
      </div>
    </section>
  );
}
