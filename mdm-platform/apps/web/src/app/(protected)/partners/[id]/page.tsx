"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import type { Partner } from "@mdm/types";
import { ChangeRequestPayload } from "@mdm/types";

type ChangeRequestItem = {
  id: string;
  partnerId: string;
  requestType: "individual" | "massa" | "auditoria";
  status: string;
  motivo?: string;
  requestedBy?: string;
  payload?: ChangeRequestPayload;
  createdAt: string;
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada"
};

const typeLabels: Record<string, string> = {
  individual: "Individual",
  massa: "Em massa",
  auditoria: "Auditoria"
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

export default function PartnerDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const partnerId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [tab, setTab] = useState<"dados" | "solicitacoes">("dados");

  useEffect(() => {
    if (!partnerId) return;
    const fetchPartner = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/details`;
        const response = await axios.get(url);
        setPartner(response.data?.partner ?? null);
      } catch (error: any) {
        const message = error?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar o parceiro.");
      } finally {
        setLoading(false);
      }
    };
    fetchPartner();
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    const fetchRequests = async () => {
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/change-requests?page=1&pageSize=10`;
        const response = await axios.get(url);
        setChangeRequests(response.data?.items ?? []);
      } catch (error: any) {
        const message = error?.response?.data?.message;
        setRequestsError(typeof message === "string" ? message : "Não foi possível carregar as solicitações.");
      } finally {
        setRequestsLoading(false);
      }
    };
    fetchRequests();
  }, [partnerId]);

  const selectedPartnerSummary = useMemo(() => {
    if (!partner) return [] as Array<{ label: string; value: string }>;
    return [
      { label: "Nome legal", value: partner.nome_legal },
      { label: "Nome fantasia", value: partner.nome_fantasia || "-" },
      { label: "Documento", value: partner.documento },
      { label: "Natureza", value: partner.natureza },
      { label: "Status", value: partner.status }
    ];
  }, [partner]);

  if (!partnerId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-600">
        ID do parceiro não informado.
      </main>
    );
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">Carregando parceiro...</main>;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">
        Parceiro não encontrado.
      </main>
    );
  }

  const solicitacoesAtivas = changeRequests;

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="self-start text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900"
        >
          Voltar
        </button>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{partner.nome_legal}</h1>
            <p className="text-sm text-zinc-500">Documento: {partner.documento}</p>
          </div>
          <Link
            href={`/partners/change-request?partner=${partnerId}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Solicitar alteração
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
          <span className="rounded-full bg-zinc-100 px-3 py-1">Natureza: {partner.natureza}</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">Status: {partner.status}</span>
          {partner.sapBusinessPartnerId && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">SAP BP {partner.sapBusinessPartnerId}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setTab("dados")}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${
            tab === "dados" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Dados
        </button>
        <button
          type="button"
          onClick={() => setTab("solicitacoes")}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${
            tab === "solicitacoes" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Solicitações
        </button>
      </div>

      {tab === "dados" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Resumo cadastral</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {selectedPartnerSummary.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="text-xs font-medium uppercase text-zinc-500">{item.label}</span>
                <span className="text-sm text-zinc-800">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "solicitacoes" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Solicitações de alteração</h2>
            <p className="text-xs text-zinc-500">Últimas 10 entradas</p>
          </div>
          {requestsError && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{requestsError}</div>}
          {requestsLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Carregando solicitações...</p>
          ) : solicitacoesAtivas.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Nenhuma solicitação registrada para este parceiro.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Criado em</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {solicitacoesAtivas.map((item) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-4 py-2 text-xs text-zinc-500">{item.id}</td>
                      <td className="px-4 py-2 text-sm text-zinc-800">{typeLabels[item.requestType] ?? item.requestType}</td>
                      <td className="px-4 py-2 text-sm text-zinc-800">{statusLabels[item.status] ?? item.status}</td>
                      <td className="px-4 py-2 text-sm text-zinc-700">{item.motivo || "-"}</td>
                      <td className="px-4 py-2 text-xs text-zinc-500">{formatDateTime(item.createdAt)}</td>
                      <td className="px-4 py-2 text-xs">
                        <Link
                          href={`/partners/change-request?partner=${partnerId}`}
                          className="font-medium text-zinc-600 transition-colors hover:text-zinc-900"
                        >
                          Revisar no wizard
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
