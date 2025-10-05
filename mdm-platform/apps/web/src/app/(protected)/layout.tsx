"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, LogOut, Bell, UserCog, Clock3, ShieldCheck, FileDiff, Share2 } from "lucide-react";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { getStoredUser, storeUser, StoredUser } from "../../lib/auth";

type TokenPayload = {
  email?: string;
  sub?: string;
  name?: string;
  exp?: number;
  profile?: string | null;
  responsibilities?: string[];
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/partners", label: "Parceiros", icon: Users },
  { href: "/integrations", label: "Integrações", icon: Share2 },
  { href: "/change-requests", label: "Solicitações", icon: FileDiff },
  { href: "/notifications", label: "Notificações", icon: Bell },
  { href: "/audit", label: "Auditorias", icon: ShieldCheck },
  { href: "/user-maintenance", label: "Usuários", icon: UserCog },
  { href: "/history", label: "Histórico", icon: Clock3 }
];

export default function ProtectedLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const token = globalThis.localStorage?.getItem("mdmToken");
    if (!token) {
      storeUser(null);
      router.replace("/login");
      return;
    }

    try {
      const payload = jwtDecode<TokenPayload>(token);
      if (payload?.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem("mdmToken");
        storeUser(null);
        router.replace("/login");
        return;
      }

      let stored = getStoredUser();
      if (!stored) {
        stored = {
          id: payload?.sub || "",
          email: payload?.email || "",
          name: payload?.name || payload?.email || "Usuário",
          profile: payload?.profile ?? null,
          responsibilities: payload?.responsibilities ?? []
        };
        storeUser(stored);
      }

      setUser(stored);
      const raw = stored?.name || stored?.email || payload?.name || payload?.email || "Usuário";
      setDisplayName(raw.split("@")[0]);
    } catch (err) {
      localStorage.removeItem("mdmToken");
      storeUser(null);
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  const activeMatcher = useMemo(() => {
    if (!pathname) return () => false;
    return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  }, [pathname]);

  const handleSignOut = () => {
    localStorage.removeItem("mdmToken");
    storeUser(null);
    router.push("/login");
  };

  if (!ready) {
    return <div className="min-h-screen bg-zinc-100" />;
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <aside className="flex w-16 flex-col border-r border-zinc-200 bg-white transition-all md:w-56">
          <div className="flex items-center justify-center border-b border-zinc-200 p-4 md:justify-start">
            <div className="text-sm font-semibold text-zinc-700 md:text-base">MDM</div>
          </div>
          <div className="hidden flex-col px-4 py-3 md:flex">
            <span className="text-xs uppercase tracking-wide text-zinc-400">Usuário</span>
            <span className="truncate text-sm font-medium text-zinc-700">{displayName}</span>
            {user?.profile && (
              <span className="text-xs capitalize text-zinc-400">{user.profile.replace(/_/g, " ")}</span>
            )}
          </div>
          <nav className="flex flex-1 flex-col gap-2 px-2 py-4">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = activeMatcher(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:justify-start ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <Icon size={20} />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <button
            onClick={handleSignOut}
            className="m-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <LogOut size={18} />
            <span className="hidden md:inline">Sair</span>
          </button>
        </aside>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}