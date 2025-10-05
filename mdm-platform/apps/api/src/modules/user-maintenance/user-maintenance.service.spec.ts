import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { UserMaintenanceService } from "./user-maintenance.service";
import { MANAGED_USER_STATUSES } from "./user-maintenance.types";

const samplePayload = {
  name: "Novo Usuário",
  email: "novo.usuario@example.com",
  profile: "fiscal",
  responsibilities: ["partners.approval.fiscal"],
  status: "active" as const
};

describe("UserMaintenanceService", () => {
  it("creates a new user and keeps it in memory", () => {
    const service = new UserMaintenanceService();

    const created = service.create(samplePayload);

    expect(created).toMatchObject({
      id: expect.any(String),
      name: "Novo Usuário",
      email: "novo.usuario@example.com",
      profile: "fiscal",
      responsibilities: ["partners.approval.fiscal"],
      status: "active"
    });

    const users = service.list();
    expect(users.some((user) => user.id === created.id)).toBe(true);
  });

  it("prevents duplicated e-mails", () => {
    const service = new UserMaintenanceService();
    const [existing] = service.list();

    expect(() =>
      service.create({
        ...samplePayload,
        email: existing.email
      })
    ).toThrow(ConflictException);
  });

  it("replaces an user information", () => {
    const service = new UserMaintenanceService();
    const [existing] = service.list();

    const updated = service.replace(existing.id, {
      ...samplePayload,
      email: "updated.email@example.com"
    });

    expect(updated.email).toBe("updated.email@example.com");
    expect(updated.name).toBe("Novo Usuário");

    const [persisted] = service.list().filter((user) => user.id === existing.id);
    expect(persisted?.email).toBe("updated.email@example.com");
  });

  it("updates partial information including status", () => {
    const service = new UserMaintenanceService();
    const [existing] = service.list();

    const newStatus = MANAGED_USER_STATUSES.find((status) => status !== existing.status) ?? "blocked";

    const updated = service.update(existing.id, {
      status: newStatus,
      responsibilities: []
    });

    expect(updated.status).toBe(newStatus);
    expect(updated.responsibilities).toHaveLength(0);
  });

  it("removes users and throws if id is unknown", () => {
    const service = new UserMaintenanceService();
    const [existing] = service.list();

    const removed = service.remove(existing.id);

    expect(removed.id).toBe(existing.id);
    expect(service.list().some((user) => user.id === existing.id)).toBe(false);

    expect(() => service.remove("unknown"))
      .toThrow(NotFoundException);
  });
});
