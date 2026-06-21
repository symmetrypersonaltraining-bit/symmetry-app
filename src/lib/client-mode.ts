import { cookies } from "next/headers";

export async function isClientMode(): Promise<boolean> {
  const store = await cookies();
  return store.get("symmetry_client_mode")?.value === "1";
}
