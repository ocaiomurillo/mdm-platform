import { Injectable } from "@nestjs/common";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  profile: string | null;
  responsibilities: string[];
  status: "active" | "invited" | "blocked";
  lastAccessAt?: string | null;
};

@Injectable()
export class UserMaintenanceService {
  private readonly users: ManagedUser[] = [
    {
      id: "u-001",
      name: "Ana Lima",
      email: "ana.lima@example.com",
      profile: "fiscal",
      responsibilities: ["partners.approval.fiscal"],
      status: "active",
      lastAccessAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
      id: "u-002",
      name: "Bruno Carvalho",
      email: "bruno.carvalho@example.com",
      profile: "compras",
      responsibilities: ["partners.approval.compras"],
      status: "active",
      lastAccessAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString()
    },
    {
      id: "u-003",
      name: "Camila Duarte",
      email: "camila.duarte@example.com",
      profile: "dados_mestres",
      responsibilities: ["partners.approval.dados_mestres"],
      status: "invited",
      lastAccessAt: null
    },
    {
      id: "u-004",
      name: "Daniel Freitas",
      email: "daniel.freitas@example.com",
      profile: null,
      responsibilities: [],
      status: "blocked",
      lastAccessAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString()
    }
  ];

  list(): ManagedUser[] {
    return this.users;
  }
}
