import { Injectable } from "@nestjs/common";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  category?: string | null;
};

@Injectable()
export class NotificationsService {
  private readonly notifications: NotificationItem[] = [
    {
      id: "n-001",
      title: "Parceiro aguardando validação",
      message: "O parceiro Comercial Alpha aguarda ação na etapa Fiscal.",
      category: "partners.approval.fiscal",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      read: false
    },
    {
      id: "n-002",
      title: "Integração concluída",
      message: "O parceiro Tech Serviços foi integrado ao SAP com sucesso.",
      category: "partners.approval.dados_mestres",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      read: true
    },
    {
      id: "n-003",
      title: "Atualização de fluxo",
      message: "Novas responsabilidades foram atribuídas ao seu perfil de aprovador.",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      read: true
    }
  ];

  list(): NotificationItem[] {
    return this.notifications;
  }
}
