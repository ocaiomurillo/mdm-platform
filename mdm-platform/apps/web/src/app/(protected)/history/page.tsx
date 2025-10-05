"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

import { getStoredUser } from "../../../lib/auth";

type EventLog = {
  id: string;
  eventType: string;
  description: string;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
  metadata?: Record<string, any> | null;
};

type EventLogResponse = EventLog[];

export default function HistoryPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storedUser = useMemo(() => getStoredUser(), []);

  useEffect(() => {
    const fetchHistory = async () => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const actorId = storedUser?.id;
        const actorEmail = storedUser?.email;
        const response = await axios.get<EventLogResponse>(`${process.env.NEXT_PUBLIC_API_URL}/history`, {
          headers: { Authorization: `Bearer ${token}` },
          params: actorId ? { actorId } : undefined
        });
        const data = Array.isArray(response.data) ? response.data : [];
        const filteredEvents = actorId
          ? data.filter((event) => event.actor?.id === actorId)
          : actorEmail
            ? data.filter((event) => event.actor?.email === actorEmail)
            : data;
        setEvents(filteredEvents);
        setError(null);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar o histórico de eventos.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [router, storedUser]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, EventLog[]>();
    events.forEach((event) => {
      const date = event.createdAt ? new Date(event.createdAt).toISOString().split("T")[0] : "Sem data";
      const existing = groups.get(date) ?? [];
      existing.push(event);
      groups.set(date, existing);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
  }, [events]);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-900">
          <Clock3 className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Histórico de Eventos</h1>
        </div>
        <p className="text-sm text-zinc-500">
          Consulte as ações realizadas pelos usuários e integrações dentro da plataforma de MDM.
        </p>
      </header>

      {loading ? (
        <section className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </section>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Ainda não há eventos registrados para você.
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          {groupedEvents.map(([date, entries]) => {
            const formattedDate = date !== "Sem data"
              ? new Date(date).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })
              : date;

            return (
              <div key={date} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{formattedDate}</div>
                <div className="space-y-3">
                  {entries
                    .slice()
                    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
                    .map((event) => {
                      const createdAt = event.createdAt ? new Date(event.createdAt) : null;
                      const createdAtLabel = createdAt?.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit"
                      });
                      return (
                        <article key={event.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <h2 className="text-sm font-semibold text-zinc-900">{event.eventType}</h2>
                              {createdAtLabel && (
                                <time className="text-xs text-zinc-400" dateTime={createdAt?.toISOString()}>
                                  {createdAtLabel}
                                </time>
                              )}
                            </div>
                            <p className="text-sm text-zinc-600">{event.description}</p>
                            {event.actor ? (
                              <span className="text-xs text-zinc-500">
                                {event.actor.name} ({event.actor.email})
                              </span>
                            ) : null}
                            {event.metadata && Object.keys(event.metadata).length > 0 ? (
                              <details className="group mt-2 text-xs text-zinc-500">
                                <summary className="cursor-pointer font-medium text-zinc-600">Detalhes</summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-500">
                                  {JSON.stringify(event.metadata, null, 2)}
                                </pre>
                              </details>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
