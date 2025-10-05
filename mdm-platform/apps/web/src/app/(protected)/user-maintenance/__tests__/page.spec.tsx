import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UserMaintenancePage from "../page";
import { getStoredUser } from "../../../../lib/auth";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const routerReplaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock })
}));

vi.mock("../../../../lib/auth", () => ({
  getStoredUser: vi.fn()
}));

type AxiosMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const axiosMock = axios as unknown as AxiosMock;
const getStoredUserMock = getStoredUser as unknown as ReturnType<typeof vi.fn>;

const apiBaseUrl = "http://localhost:3333";

describe("UserMaintenancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockReset();
    axiosMock.post.mockReset();
    axiosMock.put.mockReset();
    axiosMock.patch.mockReset();
    axiosMock.delete.mockReset();
    routerReplaceMock.mockReset();
    getStoredUserMock.mockReset();
    localStorage.clear();
    localStorage.setItem("mdmToken", "token");
    process.env.NEXT_PUBLIC_API_URL = apiBaseUrl;
    getStoredUserMock.mockReturnValue({
      id: "admin",
      email: "admin@example.com",
      responsibilities: ["partners.admin"]
    });
    axiosMock.get.mockResolvedValue({ data: [] });
  });

  it("allows creating a new user and updates the table", async () => {
    const user = userEvent.setup();
    const createdUser = {
      id: "u-100",
      name: "Maria Souza",
      email: "maria.souza@example.com",
      profile: "fiscal",
      responsibilities: ["partners.approval.fiscal"],
      status: "active" as const,
      lastAccessAt: null
    };

    axiosMock.post.mockResolvedValue({ data: createdUser });

    render(<UserMaintenancePage />);

    await screen.findByText("Nenhum usuário encontrado.");

    await user.click(screen.getByRole("button", { name: /novo usuário/i }));

    await user.type(screen.getByLabelText(/nome/i), "Maria Souza");
    await user.type(screen.getByLabelText(/e-mail/i), "maria.souza@example.com");
    await user.type(screen.getByLabelText(/perfil/i), "fiscal");
    await user.type(screen.getByLabelText(/responsabilidades/i), "partners.approval.fiscal");
    await user.selectOptions(screen.getByLabelText(/^status$/i), "active");

    await user.click(screen.getByRole("button", { name: /criar usuário/i }));

    expect(axiosMock.post).toHaveBeenCalled();
    const [createUrl, createPayload, createConfig] = axiosMock.post.mock.calls[0];
    expect(createUrl).toMatch(/\/user-maintenance$/);
    expect(createPayload).toMatchObject({
      name: "Maria Souza",
      email: "maria.souza@example.com",
      responsibilities: ["partners.approval.fiscal"],
      status: "active"
    });
    expect(createConfig?.headers?.Authorization).toBe("Bearer token");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /novo usuário/i })).not.toBeInTheDocument();
    });
  });

  it("edits, updates status and deletes an user", async () => {
    const user = userEvent.setup();
    const baseUser = {
      id: "u-001",
      name: "Ana Lima",
      email: "ana.lima@example.com",
      profile: "fiscal",
      responsibilities: ["partners.approval.fiscal"],
      status: "active" as const,
      lastAccessAt: null
    };

    axiosMock.get.mockResolvedValue({ data: [baseUser] });

    const updatedUser = {
      ...baseUser,
      name: "Ana Atualizada",
      responsibilities: ["partners.review"],
      profile: "compras"
    };

    axiosMock.put.mockResolvedValue({ data: updatedUser });

    const statusUpdatedUser = {
      ...updatedUser,
      status: "blocked" as const
    };

    axiosMock.patch.mockResolvedValue({ data: statusUpdatedUser });
    axiosMock.delete.mockResolvedValue({ data: {} });

    render(<UserMaintenancePage />);

    const row = await screen.findByRole("row", { name: /ana lima/i });

    await user.click(within(row).getByRole("button", { name: /editar/i }));

    const nameInput = screen.getByLabelText(/nome/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Atualizada");

    const profileInput = screen.getByLabelText(/perfil/i);
    await user.clear(profileInput);
    await user.type(profileInput, "compras");

    const responsibilitiesInput = screen.getByLabelText(/responsabilidades/i);
    await user.clear(responsibilitiesInput);
    await user.type(responsibilitiesInput, "partners.review");

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(axiosMock.put).toHaveBeenCalled();
    const [updateUrl, updatePayload, updateConfig] = axiosMock.put.mock.calls[0];
    expect(updateUrl).toMatch(new RegExp(`/user-maintenance/${baseUser.id}$`));
    expect(updatePayload).toMatchObject({
      name: "Ana Atualizada",
      profile: "compras",
      responsibilities: ["partners.review"]
    });
    expect(updateConfig?.headers?.Authorization).toBe("Bearer token");

    // Debugging output to inspect DOM and calls when the test fails
    // console.log("PUT calls", axiosMock.put.mock.calls);
    // console.log("Rendered HTML", document.body.innerHTML);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /editar usuário/i })).not.toBeInTheDocument();
    });

    await user.click(within(row).getByRole("button", { name: /alterar status/i }));
    await user.selectOptions(screen.getByLabelText(/status do usuário/i), "blocked");
    await user.click(screen.getByRole("button", { name: /atualizar status/i }));

    expect(axiosMock.patch).toHaveBeenCalled();
    const [statusUrl, statusPayload, statusConfig] = axiosMock.patch.mock.calls[0];
    expect(statusUrl).toMatch(new RegExp(`/user-maintenance/${baseUser.id}$`));
    expect(statusPayload).toMatchObject({ status: "blocked" });
    expect(statusConfig?.headers?.Authorization).toBe("Bearer token");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /alterar status/i })).not.toBeInTheDocument();
    });

    await screen.findByText("Bloqueado");

    await user.click(within(row).getByRole("button", { name: /excluir/i }));
    const confirmDialog = await screen.findByRole("alertdialog", { name: /excluir usuário/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^excluir$/i }));

    expect(axiosMock.delete).toHaveBeenCalled();
    const [deleteUrl, deleteConfig] = axiosMock.delete.mock.calls[0];
    expect(deleteUrl).toMatch(new RegExp(`/user-maintenance/${baseUser.id}$`));
    expect(deleteConfig?.headers?.Authorization).toBe("Bearer token");

    await waitFor(() => {
      expect(screen.queryByText(/ana atualizada/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("alertdialog", { name: /excluir usuário/i })).not.toBeInTheDocument();
    });
  });
});
