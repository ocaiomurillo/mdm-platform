import "reflect-metadata";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartnersService } from "../partners.service";

vi.mock("../entities/partner.entity", () => ({ Partner: class {} }));
vi.mock("../entities/partner-change-request.entity", () => ({ PartnerChangeRequest: class {} }));
vi.mock("../entities/partner-audit-job.entity", () => ({ PartnerAuditJob: class {} }));
vi.mock("../entities/partner-audit-log.entity", () => ({ PartnerAuditLog: class {} }));
vi.mock("../entities/partner-note.entity", () => ({ PartnerNote: class {} }));
vi.mock("../entities/partner-draft.entity", () => ({ PartnerDraft: class {} }));

describe("PartnersService drafts", () => {
  const repo = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() };
  const changeRepo = { find: vi.fn(), save: vi.fn() };
  const auditJobRepo = { findOne: vi.fn(), update: vi.fn() };
  const auditLogRepo = { save: vi.fn() };
  const noteRepo = { find: vi.fn(), create: vi.fn(), save: vi.fn() };
  const draftRepo = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    delete: vi.fn()
  };
  const sapIntegration = {
    integratePartner: vi.fn(),
    retry: vi.fn(),
    markSegmentsAsError: vi.fn()
  };

  let service: InstanceType<typeof PartnersService>;

  beforeEach(() => {
    vi.restoreAllMocks();
    draftRepo.create.mockReset();
    draftRepo.save.mockReset();
    draftRepo.find.mockReset();
    draftRepo.findOne.mockReset();
    draftRepo.delete.mockReset();

    service = new PartnersService(
      repo as any,
      changeRepo as any,
      auditJobRepo as any,
      auditLogRepo as any,
      noteRepo as any,
      draftRepo as any,
      sapIntegration as any
    );
  });

  const user = { id: "user-1", email: "user@example.com", name: "User" } as const;

  it("rejects draft creation without authenticated user", async () => {
    await expect(service.createDraft({ payload: {} }, undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("creates a draft tied to the author", async () => {
    draftRepo.create.mockImplementation((value) => ({ id: "draft-1", ...value }));
    draftRepo.save.mockResolvedValue({ id: "draft-1", payload: { nome: "Teste" }, status: "draft", createdById: user.id });

    const result = await service.createDraft({ payload: { nome: "Teste" } }, user);

    expect(draftRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { nome: "Teste" },
        createdById: user.id,
        createdByName: user.name
      })
    );
    expect(result).toMatchObject({ id: "draft-1", payload: { nome: "Teste" }, createdById: user.id });
  });

  it("lists only drafts of the current author", async () => {
    draftRepo.find.mockResolvedValue([{ id: "draft-1" }, { id: "draft-2" }]);
    const result = await service.listDrafts(user as any);
    expect(draftRepo.find).toHaveBeenCalledWith({
      where: { createdById: user.id },
      order: { updatedAt: "DESC" }
    });
    expect(result).toHaveLength(2);
  });

  it("updates draft payload merging fields", async () => {
    const draft = { id: "draft-1", payload: { nome: "Antigo", documento: "123" }, createdById: user.id };
    draftRepo.findOne.mockResolvedValue(draft);
    draftRepo.save.mockImplementation(async (value) => value);

    const result = await service.updateDraft("draft-1", { payload: { nome: "Novo" } }, user as any);

    expect(result.payload).toEqual({ nome: "Novo", documento: "123" });
    expect(draftRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: "draft-1" }));
  });

  it("throws when updating draft from another user", async () => {
    draftRepo.findOne.mockResolvedValue({ id: "draft-1", payload: {}, createdById: "other" });
    await expect(service.updateDraft("draft-1", { payload: {} }, user as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws not found when draft is missing", async () => {
    draftRepo.findOne.mockResolvedValue(null);
    await expect(service.updateDraft("draft-unknown", { payload: {} }, user as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes draft after ownership validation", async () => {
    draftRepo.findOne.mockResolvedValue({ id: "draft-1", payload: {}, createdById: user.id });
    draftRepo.delete.mockResolvedValue({} as any);

    const response = await service.deleteDraft("draft-1", user as any);
    expect(draftRepo.delete).toHaveBeenCalledWith("draft-1");
    expect(response).toEqual({ success: true });
  });
});
