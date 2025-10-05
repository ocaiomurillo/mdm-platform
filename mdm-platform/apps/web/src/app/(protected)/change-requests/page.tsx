"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const modeOptions = [
  {
    key: "individual" as const,
    title: "Solicitação individual",
    description: "Indique um parceiro específico para solicitar alterações pontuais."
  },
  {
    key: "massa" as const,
    title: "Solicitação em massa",
    description: "Prepare uma solicitação para vários parceiros a partir de uma planilha ou lista de códigos."
  }
];

type ModeKey = typeof modeOptions[number]["key"];

export default function ChangeRequestsHome() {
  const router = useRouter();
  const [partnerCode, setPartnerCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const navigateToWizard = (mode: ModeKey) => {
    const trimmed = partnerCode.trim();
    if (!trimmed) {
      setError("Informe o código do parceiro que deseja alterar.");
      return;
    }
    const params = new URLSearchParams({ partner: trimmed });
    if (mode === "massa") {
      params.set("mode", "massa");
    }
    router.push(`/partners/change-request?${params.toString()}`);
  };

  return (
    <main className="min-h-screen bg-zinc-100 p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900">Solicitações de mudança</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Informe o parceiro que deseja atualizar e escolha o tipo de solicitação para continuar.
          </p>
          <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="partner-code" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Código do parceiro
              </label>
              <input
                id="partner-code"
                value={partnerCode}
                onChange={(event) => {
                  setPartnerCode(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Ex.: PARC12345"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {modeOptions.map((option) => (
            <article key={option.key} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">{option.title}</h2>
              <p className="mt-2 text-sm text-zinc-500">{option.description}</p>
              <button
                type="button"
                onClick={() => navigateToWizard(option.key)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Continuar
              </button>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-sm text-zinc-600">
          <h3 className="text-base font-semibold text-zinc-900">Acompanhar solicitações existentes</h3>
          <p className="mt-2">
            Após criar uma solicitação, utilize o histórico na tela do parceiro para acompanhar aprovações, anexar documentos e consultar o status atual.
          </p>
          <p className="mt-2">
            Para solicitações em massa, utilize a aba "+Solicitações existentes" dentro do assistente para visualizar o andamento das mudanças enviadas.
          </p>
        </section>
      </div>
    </main>
  );
}
