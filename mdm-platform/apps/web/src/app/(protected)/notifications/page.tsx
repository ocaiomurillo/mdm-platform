"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { getStoredUser } from "../../../lib/auth";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read?: boolean;
  category?: string | null;
};

type NotificationResponse = NotificationItem[];

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await axios.get<NotificationResponse>(
          `${process.env.NEXT_PUBLIC_API_URL}/notifications`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data = Array.isArray(response.data) ? response.data : [];
        setItems(data);
        setError(null);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar as notificações.");
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [router]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const storedUser = useMemo(() => getStoredUser(), []);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-900">
          <Bell className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Notificações</h1>
        </div>
        <p className="text-sm text-zinc-500">Acompanhe os alertas e atualizações importantes do MDM.</p>
        {items.length > 0 && (
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {unreadCount > 0 ? `${unreadCount} pendente(s)` : "Todas lidas"}
          </span>
        )}
      </header>

      {loading ? (
        <section className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-white" />
          ))}
        </section>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Nenhuma notificação encontrada.
        </div>
      ) : (
        <section className="grid gap-3">
          {items.map((item) => {
            const createdAt = item.createdAt ? new Date(item.createdAt) : null;
            const formattedDate = createdAt?.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            });

            const isForCurrentProfile = item.category
              ? storedUser?.responsibilities?.includes(item.category)
              : true;

            return (
              <article
                key={item.id}
                className={`rounded-2xl border px-5 py-4 shadow-sm transition-colors ${
                  item.read ? "border-zinc-200 bg-white" : "border-indigo-200 bg-indigo-50"
                } ${!isForCurrentProfile ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <h2 className="text-base font-semibold text-zinc-900">{item.title}</h2>
                    <p className="text-sm text-zinc-600">{item.message}</p>
                    {item.category && (
                      <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {item.category}
                      </span>
                    )}
                  </div>
                  {formattedDate && (
                    <time className="shrink-0 text-xs text-zinc-400" dateTime={createdAt?.toISOString()}>
                      {formattedDate}
                    </time>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
