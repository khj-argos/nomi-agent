"use client";

import { Bot, LogOut, MessageCircle, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createAnonClient } from "@/lib/supabase";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createAnonClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const navItems = [
    { name: "대시보드", href: "/dashboard", icon: Bot },
    { name: "채널", href: "/dashboard/channels", icon: MessageCircle },
    { name: "설정", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-zinc-50">
      <aside className="w-[240px] bg-zinc-950 text-zinc-400 flex flex-col border-r border-zinc-900">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Nomi</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white font-medium"
                    : "hover:bg-zinc-900/50 hover:text-zinc-200"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-blue-400" : ""}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-900">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl hover:bg-zinc-900/50 hover:text-zinc-200 transition-colors text-left"
          >
            <LogOut className="w-5 h-5" />
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
