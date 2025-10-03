"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";

import { getStoredUser } from "../../../lib/auth";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  profile: string | null;
  responsibilities: string[];
  status: "active" | "invited" | "blocked";
  lastAccessAt?: string | null;
};

type ManagedUserResponse = ManagedUser[];

const statusLabels: Record<ManagedUser["status"], string> = {
  active: "Ativo",
  invited: "Convite pendente",
  blocked: "Bloqueado"
};

export default function UserMaintenancePage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = useMemo(() => getStoredUser(), []);

  useEffect(() => {
    const fetchUsers = async () => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await axios.get<ManagedUserResponse>(
          `${process.env.NEXT_PUBLIC_API_URL}/user-maintenance`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data = Array.isArray(response.data) ? response.data : [];
        setUsers(data);
        setError(null);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar a lista de usuários.");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [router]);

  const metrics = useMemo(() => {
    const totals = { active: 0, invited: 0, blocked: 0 } as Record<ManagedUser["status"], number>;
    users.forEach((user) => {
      totals[user.status] += 1;
    });
    return totals;
  }, [users]);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-900">
          <UserCog className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Manutenção de Usuários</h1>
        </div>
        <p className="text-sm text-zinc-500">
          Visualize perfis, responsabilidades e status de acesso dos colaboradores que atuam no processo de MDM.
        </p>
        {currentUser?.responsibilities?.length ? (
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Você possui {currentUser.responsibilities.length} permissão(ões) vinculada(s).
          </span>
        ) : null}
      </header>

      {loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </section>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {(Object.keys(metrics) as ManagedUser["status"][]).map((status) => (
              <article key={status} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <span className="text-xs uppercase tracking-wide text-zinc-400">{statusLabels[status]}</span>
                <strong className="mt-2 block text-3xl font-semibold text-zinc-900">{metrics[status]}</strong>
              </article>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-zinc-200 text-left">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Nome</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">E-mail</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Perfil</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Responsabilidades</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Último acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm text-zinc-600">
                {users.map((user) => {
                  const lastAccess = user.lastAccessAt
                    ? new Date(user.lastAccessAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Nunca";

                  return (
                    <tr key={user.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{user.name}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3 capitalize">{user.profile ?? "-"}</td>
                      <td className="px-4 py-3">
                        {user.responsibilities.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.responsibilities.map((responsibility) => (
                              <span
                                key={responsibility}
                                className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500"
                              >
                                {responsibility}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs uppercase tracking-wide text-zinc-400">Sem responsabilidades</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : user.status === "blocked"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{lastAccess}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum usuário encontrado.</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
