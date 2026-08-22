import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { redirect } from "next/navigation";
import MessagesClient from "./MessagesClient";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { initialsOf } from "@/lib/initials";
// Never serve a cached/prefetched variant of this route — the trainer-vs-client
// branch must be decided per request from the cookie + ?as marker.
export const dynamic = "force-dynamic";

export default async function MessagesPage(props: {
  searchParams: Promise<{ client?: string; as?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const __cookieStore = await cookies();
  // Deterministic client-view signal: the cookie OR an explicit ?as=client
  // marker on the Client-View nav link. The marker guarantees the client branch
  // renders on the FIRST server render even if the cookie hasn't propagated yet
  // (it's set in a client effect) — fixing the intermittent trainer-inbox leak.
  const __isInClientMode = __cookieStore.get("symmetry_client_mode")?.value === "1" || searchParams.as === "client";
  const isTrainer = await viewerIsTrainer(supabase, user) && !__isInClientMode;

  if (searchParams.client === "group") {
    const { data: gmsgs } = await supabase.from("messages").select("*").eq("is_group", true).is("deleted_at", null).order("created_at", { ascending: true });
    // Opening the Group tab marks the group read for this user (advances their
    // group_reads watermark) so the badge / bell / banner clear.
    // Server clock, via mark_group_read(). This wrote new Date() from the
    // Node process, which is close enough here, but the CLIENT-side path wrote
    // it from the browser — and the two disagreeing is what made the group badge
    // re-light the moment it was cleared. One function, one clock, both paths.
    await supabase.rpc("mark_group_read");
    const { data: allClients } = await supabase.from("clients").select("*").not("auth_user_id", "is", null).is("archived_at", null).order("name");
    const senderNames: Record<string, string> = {};
    // Faces for the group thread. `initials` is computed from the FULL name
    // here, not from senderNames — that holds the first name only, so falling
    // back to it would put a single letter in every circle and make the four
    // Gautreauxs and the two Sharons indistinguishable. Only 4 of 29 have
    // uploaded a photo (Settings → Add photo), so the initials are the common
    // case, not the edge one.
    const senderAvatars: Record<string, { url: string | null; initials: string }> = {};
    for (const cc of (allClients || []) as any[]) {
      if (!cc.auth_user_id) continue;
      const full = String(cc.name || "").trim();
      senderNames[cc.auth_user_id] = full.split(" ")[0];
      senderAvatars[cc.auth_user_id] = { url: cc.avatar_url || null, initials: initialsOf(full) };
    }
    // A COACH POSTING IN THE GROUP SHOWS THEIR COACH PHOTO.
    //
    // Dustin, 20 Aug: "In the group chat, either one of us can post and they
    // should see our actual profile or our avatar."
    //
    // This map was built only from `clients`, so a trainer appeared here purely
    // because they happen to also have a client row of their own — and the
    // picture it found was `clients.avatar_url`, a different column from the one
    // every other coach surface reads (`trainers.avatar_url`). Two consequences,
    // both silent: a coach with no client row is a blank circle in the room they
    // run, and an avatar uploaded for the coaching surfaces does not appear on
    // their own group posts.
    //
    // Applied AFTER the client loop so the coach's own row cannot win over it,
    // and only where a coach photo actually exists — an absent one leaves the
    // initials that were already there.
    const { data: coachRows } = await supabase
      .from("trainers")
      .select("auth_user_id, name, avatar_url")
      .eq("active", true)
      .not("auth_user_id", "is", null);
    for (const t of (coachRows || []) as any[]) {
      if (!t.auth_user_id) continue;
      const full = String(t.name || "").trim();
      if (!senderNames[t.auth_user_id] && full) senderNames[t.auth_user_id] = full.split(" ")[0];
      const existing = senderAvatars[t.auth_user_id];
      senderAvatars[t.auth_user_id] = {
        url: t.avatar_url || existing?.url || null,
        initials: existing?.initials || initialsOf(full),
      };
    }
    return (
      <MessagesClient
        isTrainer={isTrainer}
        clients={isTrainer ? ((allClients || []) as any[]) : []}
        selectedClientId="group"
        thread={(gmsgs || []) as any[]}
        currentUserId={user.id}
        unreadByClient={{}}
        senderNames={senderNames}
        senderAvatars={senderAvatars}
      />
    );
  }

  if (isTrainer) {
    // Archived clients drop off the inbox list. Their history is still there —
    // /messages?client=<id> opens the thread — it just isn't in the roster.
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, auth_user_id")
      .not("auth_user_id", "is", null)
      .is("archived_at", null)
      .order("name");

    // INBOX-FIRST. Only a client the trainer EXPLICITLY opened (?client=…) is
    // selected (and marked read). We used to auto-select the latest-unread
    // client here, which on a phone hid the conversation list entirely (it's
    // `hidden lg:flex` as soon as something is selected) and dropped Dustin
    // straight into a thread whose header links to the client PROFILE — so
    // tapping "Messages" felt like it landed on the clients list instead of his
    // message list. Unread threads already rise to the top of the list with a
    // pulsing red row, so nothing gets missed by showing the list first.
    const explicitClientId = searchParams.client || null;
    const selectedClientId = explicitClientId;

    let thread: any[] = [];
  if (selectedClientId === "broadcast") {
    // Broadcasts sent to N clients share one body + created_at. Dedupe so the
    // trainer sees each announcement ONCE (with a recipient count) — confirming
    // it went out — not N duplicate rows.
    const { data: __bmsgs } = await supabase.from("messages").select("*").eq("from_id", user.id).eq("is_broadcast", true).is("deleted_at", null).order("created_at", { ascending: true });
    const seen = new Map<string, any>();
    for (const m of (__bmsgs || []) as any[]) {
      const key = (m.created_at || "") + "|" + (m.body || "") + "|" + (m.image_url || "");
      if (!seen.has(key)) seen.set(key, { ...m, __recipients: 0 });
      // Count real recipients (per-client rows have a client_id; the self-copy doesn't).
      if (m.client_id) seen.get(key).__recipients += 1;
    }
    thread = Array.from(seen.values());
  }
    if (selectedClientId && selectedClientId !== "broadcast") {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, from_id, to_id, client_id, body, read_at, created_at, image_url, is_broadcast")
        .eq("client_id", selectedClientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      thread = msgs || [];

      // Mark read ONLY when the trainer explicitly opened this client — never
      // just because it was auto-selected on inbox load (that was silently
      // clearing unread without the trainer reading it).
      if (explicitClientId && explicitClientId === selectedClientId) {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("client_id", selectedClientId)
          .eq("to_id", user.id)
          .is("read_at", null);
      }
    }

    const { data: unreadData } = await supabase
      .from("messages")
      .select("client_id")
      .eq("to_id", user.id)
      .is("read_at", null)
      .is("deleted_at", null);

    const unreadByClient: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      if (m.client_id) {
        unreadByClient[m.client_id] = (unreadByClient[m.client_id] || 0) + 1;
      }
    });

    // Inbox preview: last message per client (for snippet + most-recent sort). Additive.
    const { data: __recentMsgs } = await supabase
      .from("messages")
      .select("client_id, body, from_id, created_at")
      .eq("is_group", false)
      .eq("is_broadcast", false)
      .not("client_id", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastByClient: Record<string, { body: string; from_id: string; created_at: string }> = {};
    (__recentMsgs || []).forEach((m: any) => {
      if (m.client_id && !lastByClient[m.client_id]) {
        lastByClient[m.client_id] = { body: m.body || "", from_id: m.from_id, created_at: m.created_at };
      }
    });

    return (
      <MessagesClient
        isTrainer={true}
        clients={(clients || []) as any[]}
        selectedClientId={selectedClientId}
        thread={thread}
        currentUserId={user.id}
        unreadByClient={unreadByClient}
        lastByClient={lastByClient}
      />
    );
  }

  // Resolve the signed-in user's own client record. For the trainer in Client
  // View (client-mode cookie set → isTrainer false above), their client record
  // may be linked by email rather than auth_user_id — resolve by email so
  // Dustin's Client View shows HIS own Trainer/Group threads (never the inbox).
  let clientRecord: { id: string } | null = null;
  {
    const byAuth = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    clientRecord = (byAuth.data as { id: string } | null) ?? null;
    if (!clientRecord && user.email) {
      const byEmail = await supabase.from("clients").select("id").eq("email", user.email).maybeSingle();
      clientRecord = (byEmail.data as { id: string } | null) ?? null;
    }
  }

  if (!clientRecord) redirect("/home");

  // The client's Trainer thread = everything at their client_id that isn't a
  // group message — which INCLUDES broadcasts (is_broadcast rows carry the
  // client's client_id), so announcements show here as trainer messages.
  const { data: msgs } = await supabase
    .from("messages")
    .select("id, from_id, to_id, client_id, body, read_at, created_at, image_url, is_broadcast")
    .eq("client_id", clientRecord.id)
    .is("deleted_at", null)
    .is("is_group", false)
    .order("created_at", { ascending: true });

  // Opening the Trainer thread marks its messages read (client explicitly here).
  await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientRecord.id)
      .eq("to_id", user.id)
      .is("read_at", null);

  return (
    <MessagesClient
      isTrainer={false}
      clients={[]}
      selectedClientId={clientRecord.id}
      thread={msgs || []}
      currentUserId={user.id}
      unreadByClient={{}}
    />
  );
}
