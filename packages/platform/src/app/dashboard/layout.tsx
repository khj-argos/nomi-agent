import { redirect } from "next/navigation";
import { createServerSideClient } from "@/lib/supabase-server";
import DashboardShell from "./_components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSideClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
