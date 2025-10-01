"use client";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const statusLabels: Record<string, string> = {
  draft: "Rascunhos",
  em_validacao: "Em validação",
  aprovado: "Aprovados",
  rejeitado: "Rejeitados",
  integrado: "Integrados"
};

type Partner = {
  id: string;
  status: keyof typeof statusLabels;
};

type Metrics = Record<keyof typeof statusLabels | "total", number>;

const initialMetrics: Metrics = {
  draft: 0,
  em_validacao: 0,
  aprovado: 0,
  rejeitado: 0,
  integrado: 0,
  total: 0
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      const token = localStorage.getItem("mdmToken");
      try {
        const response = await axios.get<Partner[]>(`${process.env.NEXT_PUBLIC_API_URL}/partners`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = response.data || [];
        const aggregated = data.reduce<Metrics>((acc, partner) => {
          const status = partner.status || "draft";
          if (status in acc) {
            acc[status as keyof typeof statusLabels] += 1;
          }
          acc.total += 1;
          return acc;
        }, { ...initialMetrics });
        setMetrics(aggregated);
        setError(null);
      } catch (err: any) {
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar os dados.");
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const cards = useMemo(() => (
    Object.entries(statusLabels).map(([key, label]) => ({
      key,
      label,
      value: metrics[key as keyof typeof statusLabels]
    }))
  ), [metrics]);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">Acompanhe o andamento dos cadastros de parceiros.</p>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : (
        <>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ key, label, value }) => (
              <article key={key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
                <div className="mt-2 text-3xl font-semibold text-zinc-900">{value}</div>
              </article>
            ))}
            <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-400">Total</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-900">{metrics.total}</div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}