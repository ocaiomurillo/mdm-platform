import { Injectable } from "@nestjs/common";

import { HistoryListQueryDto } from "./dto/history-query.dto";

type Actor = {
  id: string;
  name: string;
  email: string;
};

type EventLog = {
  id: string;
  eventType: string;
  description: string;
  createdAt: string;
  actor?: Actor | null;
  metadata?: Record<string, any> | null;
};

@Injectable()
export class HistoryService {
  private readonly events: EventLog[] = [
    {
      id: "e-001",
      eventType: "partner.submitted",
      description: "Parceiro Comercial Alpha submetido para validação.",
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      actor: {
        id: "u-001",
        name: "Ana Lima",
        email: "ana.lima@example.com"
      },
      metadata: { partnerId: "p-001", approvalStage: "fiscal" }
    },
    {
      id: "e-002",
      eventType: "partner.stage.approved",
      description: "Etapa Fiscal aprovada para o parceiro Comercial Alpha.",
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      actor: {
        id: "u-001",
        name: "Ana Lima",
        email: "ana.lima@example.com"
      },
      metadata: { partnerId: "p-001", approvalStage: "fiscal" }
    },
    {
      id: "e-003",
      eventType: "integration.sap.triggered",
      description: "Envio de dados mestre agendado para o parceiro Tech Serviços.",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      actor: {
        id: "system",
        name: "Agendador MDM",
        email: "mdm-bot@example.com"
      },
      metadata: { partnerId: "p-010", segment: "dados_mestres" }
    },
    {
      id: "e-004",
      eventType: "user.permission.updated",
      description: "Responsabilidade de Dados Mestres atribuída a Camila Duarte.",
      createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      actor: {
        id: "u-005",
        name: "Gestor MDM",
        email: "gestor@example.com"
      },
      metadata: { userId: "u-003", responsibility: "partners.approval.dados_mestres" }
    }
  ];

  list(filters: HistoryListQueryDto = {}): EventLog[] {
    const { actorId, actorEmail } = filters;

    if (!actorId && !actorEmail) {
      return this.events;
    }

    return this.events.filter((event) => {
      if (actorId) {
        return event.actor?.id === actorId;
      }
      return event.actor?.email === actorEmail;
    });
  }
}
