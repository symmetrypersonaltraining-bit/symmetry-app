"use client";

// Challenge + Group Chat, as a split pair on the client dashboard.
//
// Both used to live near the bottom of the page — the consistency board below
// the milestones, the group only reachable from the bottom nav. Nobody scrolled
// that far, which is the whole reason group announcements were being missed.
// Two half-width cards cost the height of one full card, so putting them
// directly under Today's Workout does not push the training content down.
//
// The challenge card expands IN PLACE rather than navigating. Sending someone
// to a separate leaderboard screen to answer "am I winning" is a round trip
// they will not make twice.
//
// Renders nothing at all when there is no live challenge AND no group activity,
// so a quiet week costs zero screen space rather than showing two empty boxes.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Challenge {
  id: string;
  emoji: string | null;
  title: string;
  tagline: string | null;
  rules: string | null;
  scoring_note: string | null;
  days_left: number | null;
  participant_count: number | null;
}

interface Row {
  rnk: number;
  client_id: string;
  client_name: string;
  score: number;
  is_me: boolean;
}

interface GroupMsg {
  id: string;
  body: string | null;
  from_name: string;
  is_bot: boolean;
}

function initials(name: string) {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default function CommunityPair({ basePath = "" }: { basePath?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [board, setBoard] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [joined, setJoined] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [msgs, setMsgs] = useState<GroupMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: ch } = await supabase.from("v_active_challenge").select("*").maybeSingle();
      const challengeRow = (ch as Challenge | null) ?? null;
      setChallenge(challengeRow);

      if (challengeRow) {
        const { data: rows } = await supabase.rpc("challenge_leaderboard", {
          p_challenge_id: challengeRow.id,
        });
        setBoard((rows as Row[]) ?? []);

        const { data: me } = await supabase.rpc("my_client_id");
        if (me) {
          const { data: part } = await supabase
            .from("challenge_participants")
            .select("id")
            .eq("challenge_id", challengeRow.id)
            .eq("client_id", me as string)
            .maybeSingle();
          setJoined(!!part);
        }
      }

      // Last two group messages, newest first, then flipped for display.
      const { data: gm } = await supabase
        .from("messages")
        .select("id, body, is_group, from_id, created_at")
        .eq("is_group", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2);

      const { data: gr } = await supabase.from("group_reads").select("last_read_at").maybeSingle();
      const lastRead = (gr as { last_read_at: string } | null)?.last_read_at ?? null;

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("is_group", true)
        .is("deleted_at", null)
        .gt("created_at", lastRead ?? "1970-01-01T00:00:00Z");
      setUnread(count ?? 0);

      setMsgs(
        ((gm as any[]) ?? [])
          .reverse()
          .map((m) => ({
            id: m.id,
            body: m.body,
            from_name: m.from_name ?? "",
            is_bot: false,
          }))
      );
    } catch {
      /* a dashboard card must never take the page down with it */
    } finally {
      setReady(true);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function join() {
    if (!challenge || joining) return;
    setJoining(true);
    try {
      const { data: me } = await supabase.rpc("my_client_id");
      if (me) {
        await supabase
          .from("challenge_participants")
          .insert({ challenge_id: challenge.id, client_id: me as string });
        setJoined(true);
        setChallenge((c) =>
          c ? { ...c, participant_count: (c.participant_count ?? 0) + 1 } : c
        );
      }
    } catch {
      /* already joined — the unique constraint is the source of truth */
      setJoined(true);
    } finally {
      setJoining(false);
    }
  }

  if (!ready) return null;
  if (!challenge && msgs.length === 0) return null;

  const me = board?.find((r) => r.is_me) ?? null;
  const ahead = me && board ? board.filter((r) => r.rnk < me.rnk).slice(-1)[0] : null;
  const gap = me && ahead ? Math.max(0, Number(ahead.score) - Number(me.score)) : null;

  const cardBase: React.CSSProperties = {
    background: "var(--brand-surface)",
    border: "1px solid var(--brand-border)",
    borderRadius: 18,
    padding: 12,
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08)",
  };
  const topBar = (from: string, to: string): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${from}, ${to})`,
  });
  const label: React.CSSProperties = {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "var(--brand-text-secondary)",
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* ── Challenge ─────────────────────────────────────────────── */}
        {challenge ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="cw-lift text-left"
            style={{ ...cardBase, cursor: "pointer", font: "inherit" }}
            aria-expanded={expanded}
          >
            <span style={topBar("var(--brand-warn, #e0a83e)", "var(--brand-accent)")} />
            <div style={label}>
              {challenge.emoji ?? "🏆"} Challenge
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                lineHeight: 1,
                margin: "6px 0 1px",
                color: "var(--brand-warn, #b45309)",
              }}
            >
              {me ? `${me.rnk}${["th", "st", "nd", "rd"][((me.rnk % 100) - 20) % 10] || ["th", "st", "nd", "rd"][me.rnk] || "th"}` : "—"}
            </div>
            <div style={{ ...label, fontSize: 8.5 }}>
              {board ? `of ${board.length}` : ""}
              {challenge.days_left != null ? ` · ${challenge.days_left}d left` : ""}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--brand-text-secondary)",
                marginTop: 6,
                lineHeight: 1.35,
              }}
            >
              {gap != null && gap > 0 ? (
                <>
                  <b style={{ color: "var(--brand-primary)" }}>{gap} more</b> to catch {ahead?.rnk}
                  {ahead?.rnk === 1 ? "st" : ahead?.rnk === 2 ? "nd" : ahead?.rnk === 3 ? "rd" : "th"}
                </>
              ) : me && me.rnk === 1 ? (
                <b style={{ color: "var(--brand-primary)" }}>You&rsquo;re leading</b>
              ) : (
                "Tap for the board"
              )}
            </div>
          </button>
        ) : (
          <div style={{ ...cardBase, opacity: 0.55 }}>
            <span style={topBar("var(--brand-border)", "var(--brand-border)")} />
            <div style={label}>🏆 Challenge</div>
            <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.4 }}>
              Next one starts Sunday.
            </div>
          </div>
        )}

        {/* ── Group ─────────────────────────────────────────────────── */}
        <button
          onClick={() => router.push(`${basePath}/messages?client=group`)}
          className="cw-lift text-left"
          style={{ ...cardBase, cursor: "pointer", font: "inherit" }}
        >
          <span style={topBar("var(--brand-accent)", "var(--brand-primary)")} />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={label}>💬 Group</span>
            {unread > 0 && (
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "1px 6px",
                }}
              >
                {unread}
              </span>
            )}
          </div>
          {msgs.length > 0 ? (
            <div style={{ marginTop: 7 }}>
              {msgs.map((m) => (
                <div
                  key={m.id}
                  style={{
                    fontSize: 10.5,
                    color: "var(--brand-text)",
                    lineHeight: 1.35,
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {m.body}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 8 }}>
              Nothing new yet.
            </div>
          )}
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--brand-primary)", marginTop: 7 }}>
            Open →
          </div>
        </button>
      </div>

      {/* ── Expanded board, in place ──────────────────────────────── */}
      {expanded && challenge && (
        <div style={{ ...cardBase, marginTop: 12, padding: 14 }}>
          <span style={topBar("var(--brand-warn, #e0a83e)", "var(--brand-accent)")} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-text)" }}>
              {challenge.emoji ?? "🏆"} {challenge.title}
            </div>
            {challenge.days_left != null && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: "2px 8px",
                  background: "rgba(224,168,62,.16)",
                  color: "var(--brand-warn, #b45309)",
                }}
              >
                {challenge.days_left} DAYS LEFT
              </span>
            )}
          </div>
          {challenge.tagline && (
            <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginBottom: 10 }}>
              {challenge.tagline}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            {(board ?? []).slice(0, 12).map((r) => (
              <div
                key={r.client_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: r.is_me ? "6px 8px" : "4px 0",
                  fontSize: 12.5,
                  background: r.is_me ? "rgba(15,76,129,.08)" : undefined,
                  borderRadius: r.is_me ? 9 : 0,
                  margin: r.is_me ? "3px -8px" : undefined,
                }}
              >
                <span
                  style={{
                    width: 17,
                    fontWeight: 800,
                    color:
                      r.rnk === 1
                        ? "var(--brand-warn, #b45309)"
                        : "var(--brand-text-secondary)",
                  }}
                >
                  {r.rnk}
                </span>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    flex: "none",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#fff",
                    background: "var(--brand-primary)",
                  }}
                >
                  {initials(r.client_name)}
                </span>
                <span style={{ flex: 1, fontWeight: r.is_me ? 800 : 600, color: "var(--brand-text)" }}>
                  {r.is_me ? "You" : r.client_name}
                </span>
                <span style={{ fontWeight: 800, color: "var(--brand-primary)" }}>{r.score}</span>
              </div>
            ))}
          </div>

          {challenge.scoring_note && (
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-text-secondary)",
                lineHeight: 1.5,
                borderTop: "1px dashed var(--brand-border)",
                paddingTop: 9,
              }}
            >
              <b style={{ color: "var(--brand-text)" }}>How it&rsquo;s scored:</b> {challenge.scoring_note}
            </div>
          )}

          {joined === false && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                join();
              }}
              disabled={joining}
              style={{
                width: "100%",
                marginTop: 10,
                background: "var(--brand-primary)",
                color: "#fff",
                border: "none",
                borderRadius: 11,
                padding: "10px 0",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {joining ? "Joining…" : `I'm in${challenge.participant_count ? ` · ${challenge.participant_count} already are` : ""}`}
            </button>
          )}

          <button
            onClick={() => setExpanded(false)}
            style={{
              width: "100%",
              marginTop: 8,
              background: "transparent",
              border: "none",
              color: "var(--brand-text-secondary)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
