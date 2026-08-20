"use client";

// The viewer's own coach, on client-facing coaching surfaces — Coach's Read,
// the weekly Focus callout. Their real photo, with their initials as the
// fallback.
//
// THIS IS THE REAL PHOTO, AND IT STAYS THAT WAY. Dustin's rule, 2026-08-01:
// the cartoon is for AI-generated surfaces only — Coach Bot and anything else
// the app writes on its own. Anywhere a client is reading something FROM THEIR
// COACH shows that coach's actual face. Putting the cartoon here would quietly
// relabel real coaching as machine output, which is the opposite of what it is.
// The cartoon lives at /public/coachbot.png; do not wire it in here.
//
// TWO THINGS WERE WRONG BEFORE THIS REWRITE, and both showed Dustin to
// Stephanie's clients:
//
//   `initials = "DG"` was the default parameter, and neither call site passed
//   one. Her avatar_url is null until she uploads a photo, so every one of her
//   clients had his monogram on their weekly focus card.
//
//   `let cachedUrl` was module-scoped, keyed on nothing, and never invalidated.
//   One badge fetched, every other badge in the session reused it — including
//   across a switch into Client View, where the coach is a different person.
//
// It also did its own query per mount. It does not need to: the app layout
// already resolves the viewer's coach once, server-side, and hands it down.

import { useCoach } from "@/lib/useCoach";

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function CoachBadge({ size = 30, initials }: { size?: number; initials?: string }) {
  const coach = useCoach();
  const mark = initials || initialsOf(coach.name) || "";

  if (coach.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coach.avatarUrl} alt={coach.firstName} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.4), display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{mark}</div>
  );
}
