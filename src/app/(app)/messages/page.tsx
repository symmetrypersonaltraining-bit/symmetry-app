import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MessagesClient from "./MessagesClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function MessagesPage(props: {
  searchParams: Promise<{ client?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const __cookieStore = await cookies();
  const __isInClientMode = __cookieStore.get("symmetry_client_mode")?.value === "1";
  const isTrainer = user.email === TRAINER_EMAIL && !__isInClientMode;

  if (searchParams.client === "group") {
    const { data: gmsgs } = await supabase.from("messages").select("*").eq("is_group", true).order("created_at", { ascending: true });
    const { data: allClients } = await supabase.from("clients").select("*").not("auth_user_id", "is", null).order("name");
    const senderNames: Record<string, string> = {};
    for (const cc of (allClients || []) as any[]) { if (cc.auth_user_id) senderNames[cc.auth_user_id] = String(cc.name || "").trim().split(" ")[0]; }
    return (
      <MessagesClient
        isTrainer={isTrainer}
        clients={isTrainer ? ((allClients || []) as any[]) : []}
        selectedClientId="group"
        thread={(gmsgs || []) as any[]}
        currentUserId={user.id}
        unreadByClient={{}}
        senderNames={senderNames}
      />
    );
  }

  if (isTrainer) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, auth_user_id")
      .not("auth_user_id", "is", null)
      .order("name");

    const selectedClientId = searchParams.client || null;

    let thread: any[] = [];
  if (selectedClientId === "broadcast") {
    const { data: __bmsgs } = await supabase.from("messages").select("*").eq("from_id", user.id).eq("is_broadcast", true).order("created_at", { ascending: true });
    thread = __bmsgs || [];
  }
    if (selectedClientId && selectedClientId !== "broadcast") {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, from_id, to_id, client_id, body, read_at, created_at")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: true });
      thread = msgs || [];

      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("client_id", selectedClientId)
        .eq("to_id", user.id)
        .is("read_at", null);
    }

    const { data: unreadData } = await supabase
      .from("messages")
      .select("client_id")
      .eq("to_id", user.id)
      .is("read_at", null);

    const unreadByClient: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      if (m.client_id) {
        unreadByClient[m.client_id] = (unreadByClient[m.client_id] || 0) + 1;
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
      />
    );
  }

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) redirect("/home");

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, from_id, to_id, client_id, body, read_at, created_at")
    .eq("client_id", clientRecord.id)
    .order("created_at", { ascending: true });

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
