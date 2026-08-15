/**
 * Initials for an avatar fallback.
 *
 * Lives here, and not in components/Avatar.tsx where it started, because that
 * file is a "use client" module that calls `createClient()` at import time. Any
 * server component wanting initials pulled a browser Supabase client in with
 * them — which throws outright when the env vars are absent, so the function
 * could not be unit-tested either. It is a pure string function; it has no
 * business sitting behind a database client.
 *
 * Avatar.tsx re-exports it, so every existing import keeps working.
 */
export function initialsOf(name: string): string {
  return (
    (name || "")
      .split(" ")
      .map((n) => n[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
