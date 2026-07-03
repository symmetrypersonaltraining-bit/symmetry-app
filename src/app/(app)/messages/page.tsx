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

  const isTrainer = user.email === TRAINER_EMAIL;

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

  const { data: trainerSettings } = await supabase
    .from("trainer_settings")
    .select("user_id")
    .limit(1)
    .maybeSingle();

  if (trainerSettings?.user_id) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientRecord.id)
      .eq("from_id", trainerSettings.user_id)
      .is("read_at", null);
  }

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
