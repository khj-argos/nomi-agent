import { createServerSideClient } from "@/lib/supabase-server";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:4001";

async function getUserToken(): Promise<string> {
  const supabase = await createServerSideClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Unauthorized");
  return session.access_token;
}

async function callOrchestrator<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getUserToken();
  const res = await fetch(`${ORCHESTRATOR_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Orchestrator error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const orchestrator = {
  get: <T>(path: string) => callOrchestrator<T>(path),
  post: <T>(path: string, body?: unknown) =>
    callOrchestrator<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    callOrchestrator<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => callOrchestrator<T>(path, { method: "DELETE" }),
};
