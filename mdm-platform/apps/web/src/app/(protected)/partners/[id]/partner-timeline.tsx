"use client";

import type {
  Partner,
  PartnerApprovalStage,
  PartnerRegistrationProgress,
  PartnerRegistrationStep,
  PartnerRegistrationStepStatus
} from "@mdm/types";
import type { SapOverallStatus } from "../sap-integration-helpers";

export type StageStatus = {
  stage: PartnerApprovalStage;
  state: "pending" | "current" | "complete" | "rejected";
};

type PartnerTimelineStage = StageStatus & {
  label: string;
  responsible: string;
  stateLabel: string;
};

type PartnerTimelineProps = {
  partner: Partner;
  registrationProgress: PartnerRegistrationProgress | null;
  approvalStages: PartnerTimelineStage[];
  currentStageLabel: string;
  pendingDescription: string;
  sapOverall: SapOverallStatus;
};

const registrationStatusLabels: Record<PartnerRegistrationStepStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  complete: "Concluído",
  blocked: "Bloqueado"
};

const registrationStatusStyles: Record<PartnerRegistrationStepStatus, string> = {
  pending: "border-zinc-200 bg-white",
  in_progress: "border-indigo-200 bg-indigo-50",
  complete: "border-emerald-200 bg-emerald-50",
  blocked: "border-red-200 bg-red-50"
};

const registrationStatusBadges: Record<PartnerRegistrationStepStatus, string> = {
  pending: "border-zinc-300 bg-zinc-50 text-zinc-600",
  in_progress: "border-indigo-300 bg-indigo-100 text-indigo-700",
  complete: "border-emerald-300 bg-emerald-100 text-emerald-700",
  blocked: "border-red-300 bg-red-100 text-red-700"
};

const overallStatusLabels: Record<PartnerRegistrationProgress["overallStatus"], string> = {
  pending: "Cadastro pendente",
  in_progress: "Cadastro em andamento",
  complete: "Cadastro concluído",
  blocked: "Cadastro bloqueado"
};

const approvalStatusBadges: Record<StageStatus["state"], string> = {
  pending: "border-zinc-300 bg-zinc-50 text-zinc-600",
  current: "border-indigo-300 bg-indigo-100 text-indigo-700",
  complete: "border-emerald-300 bg-emerald-100 text-emerald-700",
  rejected: "border-red-300 bg-red-100 text-red-700"
};

const normalizePercentage = (value: number) => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

const renderStepDetails = (step: PartnerRegistrationStep) => {
  if (step.status === "complete") {
    return (
      <p className="mt-1 text-xs text-zinc-500">
        {step.completedItems} de {step.totalItems} itens concluídos.
      </p>
    );
  }

  if (step.missing && step.missing.length) {
    return (
      <ul className="mt-1 list-disc pl-4 text-xs text-zinc-600">
        {step.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className="mt-1 text-xs text-zinc-500">
      {step.completedItems} de {step.totalItems} itens preenchidos.
    </p>
  );
};

export default function PartnerTimeline({
  partner,
  registrationProgress,
  approvalStages,
  currentStageLabel,
  pendingDescription,
  sapOverall
}: PartnerTimelineProps) {
  const completion = normalizePercentage(registrationProgress?.completionPercentage ?? 0);
  const steps = registrationProgress?.steps ?? [];

  return (
    <div className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Panorama geral</h2>
        <div className="space-y-1 text-xs text-zinc-500">
          <p>
            <span className="font-semibold text-zinc-800">Status do parceiro:</span> {partner.status}
          </p>
          <p>
            <span className="font-semibold text-zinc-800">Etapa atual:</span> {currentStageLabel}
          </p>
          <p>
            <span className="font-semibold text-zinc-800">Integração SAP:</span> {sapOverall.label}
          </p>
        </div>
        <p className="text-xs text-zinc-500">{sapOverall.description}</p>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span>Cadastro</span>
          <span>{completion}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${completion}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {registrationProgress ? overallStatusLabels[registrationProgress.overallStatus] : "Cadastro pendente."}
        </p>
        {steps.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">Nenhum passo cadastral disponível.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {steps.map((step) => (
              <li
                key={step.id}
                className={`rounded-xl border px-3 py-2 ${registrationStatusStyles[step.status]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-800">{step.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${registrationStatusBadges[step.status]}`}
                  >
                    {registrationStatusLabels[step.status]}
                  </span>
                </div>
                {renderStepDetails(step)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fluxo de aprovação</h3>
        {approvalStages.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">Nenhuma etapa registrada.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {approvalStages.map((stage) => (
              <li key={stage.stage} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-800">{stage.label}</div>
                    <div className="text-xs text-zinc-500">{stage.responsible}</div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${approvalStatusBadges[stage.state]}`}
                  >
                    {stage.stateLabel}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-500">{pendingDescription}</p>
      </div>
    </div>
  );
}
