import { randomUUID } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  MANAGED_USER_STATUSES,
  ManagedUser,
  ManagedUserStatus
} from "./user-maintenance.types";
import { CreateManagedUserDto } from "./dto/create-managed-user.dto";
import { UpdateManagedUserDto } from "./dto/update-managed-user.dto";

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
    return this.users.map((user) => ({
      ...user,
      responsibilities: [...user.responsibilities]
    }));
  }

  create(payload: CreateManagedUserDto): ManagedUser {
    this.ensureEmailIsUnique(payload.email);

    const newUser: ManagedUser = {
      id: randomUUID(),
      name: payload.name.trim(),
      email: payload.email.toLowerCase(),
      profile: payload.profile?.trim() || null,
      responsibilities: this.normalizeResponsibilities(payload.responsibilities),
      status: payload.status,
      lastAccessAt: payload.lastAccessAt ?? null
    };

    this.users.push(newUser);

    return { ...newUser, responsibilities: [...newUser.responsibilities] };
  }

  replace(id: string, payload: CreateManagedUserDto): ManagedUser {
    const user = this.findById(id);
    this.ensureEmailIsUnique(payload.email, id);

    user.name = payload.name.trim();
    user.email = payload.email.toLowerCase();
    user.profile = payload.profile?.trim() || null;
    user.responsibilities = this.normalizeResponsibilities(payload.responsibilities);
    user.status = payload.status;
    if (payload.lastAccessAt !== undefined) {
      user.lastAccessAt = payload.lastAccessAt;
    }

    return { ...user, responsibilities: [...user.responsibilities] };
  }

  update(id: string, payload: UpdateManagedUserDto): ManagedUser {
    const user = this.findById(id);

    if (payload.email && payload.email !== user.email) {
      this.ensureEmailIsUnique(payload.email, id);
      user.email = payload.email.toLowerCase();
    }

    if (payload.name) {
      user.name = payload.name.trim();
    }

    if (payload.profile !== undefined) {
      user.profile = payload.profile?.trim() || null;
    }

    if (payload.responsibilities !== undefined) {
      user.responsibilities = this.normalizeResponsibilities(payload.responsibilities);
    }

    if (payload.status) {
      this.assertValidStatus(payload.status);
      user.status = payload.status;
    }

    if (payload.lastAccessAt !== undefined) {
      user.lastAccessAt = payload.lastAccessAt;
    }

    return { ...user, responsibilities: [...user.responsibilities] };
  }

  remove(id: string): ManagedUser {
    const index = this.users.findIndex((user) => user.id === id);

    if (index === -1) {
      throw new NotFoundException("Usuário não encontrado.");
    }

    const [removed] = this.users.splice(index, 1);
    return { ...removed, responsibilities: [...removed.responsibilities] };
  }

  private ensureEmailIsUnique(email: string, ignoreId?: string) {
    const normalized = email.toLowerCase();
    const conflict = this.users.find(
      (user) => user.email === normalized && user.id !== ignoreId
    );

    if (conflict) {
      throw new ConflictException("Já existe um usuário com este e-mail cadastrado.");
    }
  }

  private findById(id: string): ManagedUser {
    const user = this.users.find((item) => item.id === id);

    if (!user) {
      throw new NotFoundException("Usuário não encontrado.");
    }

    return user;
  }

  private normalizeResponsibilities(responsibilities: string[]): string[] {
    return responsibilities
      .map((responsibility) => responsibility.trim())
      .filter((responsibility) => responsibility.length > 0);
  }

  private assertValidStatus(status: ManagedUserStatus) {
    if (!MANAGED_USER_STATUSES.includes(status)) {
      throw new ConflictException("Status de usuário inválido.");
    }
  }
}
