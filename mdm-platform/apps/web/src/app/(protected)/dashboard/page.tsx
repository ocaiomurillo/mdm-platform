"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PartnerApprovalStage } from "@mdm/types";
import { getStoredUser } from "../../../lib/auth";
import { NewEntityMenu } from "../components/new-entity-menu";

const statusLabels: Record<string, string> = {
  draft: "Rascunhos",
  em_validacao: "Em validação",
  aprovado: "Aprovados",
  rejeitado: "Rejeitados",
  integrado: "Integrados"
};

const stageLabels: Record<PartnerApprovalStage, string> = {
  fiscal: "Fiscal",
  compras: "Compras/Vendas",
  dados_mestres: "Dados Mestres",
  finalizado: "Concluído"
};

const stagePermissions: Record<PartnerApprovalStage, string | null> = {
  fiscal: "partners.approval.fiscal",
  compras: "partners.approval.compras",
  dados_mestres: "partners.approval.dados_mestres",
  finalizado: null
};

type Partner = {
  id: string;
  status: keyof typeof statusLabels;
  approvalStage?: PartnerApprovalStage;
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

const initialStageMetrics: Record<PartnerApprovalStage, number> = {
  fiscal: 0,
  compras: 0,
  dados_mestres: 0,
  finalizado: 0
};

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [stageMetrics, setStageMetrics] = useState<Record<PartnerApprovalStage, number>>(initialStageMetrics);
  const [myPending, setMyPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [draftActionLoadingId, setDraftActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!draftFeedback) return;
    if (process.env.NODE_ENV === "test") return;
    const timeout = window.setTimeout(() => setDraftFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [draftFeedback]);

  useEffect(() => {
    const fetchMetrics = async () => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get<Partner[]>(`${process.env.NEXT_PUBLIC_API_URL}/partners`, { headers });
        const data = response.data || [];
        const stageAggregated: Record<PartnerApprovalStage, number> = { ...initialStageMetrics };
        const aggregated = data.reduce<Metrics>((acc, partner) => {
          const status = partner.status || "draft";
          if (status in acc) {
            acc[status as keyof typeof statusLabels] += 1;
          }
          acc.total += 1;
          return acc;
        }, { ...initialMetrics });
        data.forEach((partner) => {
          const stage = partner.approvalStage || "fiscal";
          if (stageAggregated[stage] !== undefined) {
            stageAggregated[stage] += 1;
          }
        });
        setStageMetrics(stageAggregated);

        let draftsData: any[] = [];
        try {
          const draftResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/partners/drafts`, { headers });
          draftsData = Array.isArray(draftResponse.data) ? draftResponse.data : [];
          setDrafts(draftsData);
          setDraftsError(null);
        } catch (draftErr: any) {
          if (draftErr?.response?.status === 401) {
            localStorage.removeItem("mdmToken");
            router.replace("/login");
            return;
          }
          const draftMessage = draftErr?.response?.data?.message;
          setDrafts([]);
          setDraftsError(typeof draftMessage === "string" ? draftMessage : "Não foi possível carregar seus rascunhos.");
        }

        aggregated.draft += draftsData.length;
        aggregated.total += draftsData.length;
        setMetrics(aggregated);

        const storedUser = getStoredUser();
        if (storedUser?.responsibilities?.length) {
          const responsibilities = new Set(storedUser.responsibilities);
          const pending = data.filter((partner) => {
            const stage = partner.approvalStage || "fiscal";
            const permission = stagePermissions[stage];
            return partner.status === "em_validacao" && permission && responsibilities.has(permission);
          }).length;
          setMyPending(pending);
        } else {
          setMyPending(0);
        }
        setError(null);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar os dados.");
        setDrafts([]);
        setDraftsError(typeof message === "string" ? message : "Não foi possível carregar seus rascunhos.");
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [router]);

  const handleResumeDraft = useCallback(
    (draftId: string) => {
      router.push(`/partners/new?draftId=${draftId}`);
    },
    [router]
  );

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      setDraftActionLoadingId(draftId);
      try {
        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/partners/drafts/${draftId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
        setMetrics((prev) => ({
          ...prev,
          draft: Math.max(0, (prev.draft ?? 0) - 1),
          total: Math.max(0, prev.total - 1)
        }));
        setDraftFeedback({ type: "success", message: "Rascunho removido com sucesso." });
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setDraftFeedback({
          type: "error",
          message: typeof message === "string" ? message : "Não foi possível excluir o rascunho."
        });
      } finally {
        setDraftActionLoadingId(null);
      }
    },
    [router]
  );

  const cards = useMemo(() => (
    Object.entries(statusLabels).map(([key, label]) => ({
      key,
      label,
      value: metrics[key as keyof typeof statusLabels]
    }))
  ), [metrics]);

  const stageCards = useMemo(() => (
    Object.entries(stageLabels).map(([key, label]) => ({
      key: key as PartnerApprovalStage,
      label,
      value: stageMetrics[key as PartnerApprovalStage]
    }))
  ), [stageMetrics]);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500">Acompanhe o andamento dos cadastros de parceiros.</p>
        </header>
        <NewEntityMenu className="self-start md:self-auto" />
      </div>

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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stageCards.map(({ key, label, value }) => (
              <article key={key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-zinc-400">Etapa: {label}</div>
                <div className="mt-2 text-3xl font-semibold text-zinc-900">{value}</div>
              </article>
            ))}
            <article className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-indigo-500">Pendências para você</div>
              <div className="mt-2 text-3xl font-semibold text-indigo-700">{myPending}</div>
              <p className="mt-1 text-xs text-zinc-500">Parceiros aguardando aprovação nas etapas sob sua responsabilidade.</p>
            </article>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Meus rascunhos</div>
                  <div className="mt-2 text-3xl font-semibold text-zinc-900">{drafts.length}</div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/partners/new")}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                >
                  Novo rascunho
                </button>
              </div>
              {draftFeedback && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    draftFeedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {draftFeedback.message}
                </div>
              )}
              {draftsError && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {draftsError}
                </div>
              )}
              <div className="mt-4 space-y-3">
                {drafts.length === 0 ? (
                  <p className="text-sm text-zinc-500">Você ainda não possui rascunhos salvos.</p>
                ) : (
                  drafts.map((draft) => {
                    const payload = draft?.payload ?? {};
                    const nomeLegal = payload?.nome_legal || payload?.nome_fantasia || "Rascunho sem nome";
                    const updatedLabel = draft?.updatedAt
                      ? new Date(draft.updatedAt).toLocaleString("pt-BR")
                      : null;
                    const natureza = payload?.natureza ? String(payload.natureza) : null;
                    return (
                      <div key={draft.id} className="rounded-xl border border-zinc-200 p-4">
                        <button
                          type="button"
                          onClick={() => handleResumeDraft(draft.id)}
                          className="flex w-full items-center justify-between text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-900">{nomeLegal}</p>
                            {natureza && <p className="text-xs text-zinc-500">Natureza: {natureza}</p>}
                            {updatedLabel && <p className="text-xs text-zinc-400">Atualizado em {updatedLabel}</p>}
                          </div>
                          <span className="text-xs font-semibold text-emerald-600">Retomar</span>
                        </button>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteDraft(draft.id)}
                            disabled={draftActionLoadingId === draft.id}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:bg-red-50"
                          >
                            {draftActionLoadingId === draft.id ? "Excluindo..." : "Excluir rascunho"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
