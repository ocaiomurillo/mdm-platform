import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Dashboard from "../page";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();
const routerMock = {
  push: routerPushMock,
  replace: routerReplaceMock
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock
}));

type AxiosMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const axiosMock = axios as unknown as AxiosMock;

describe("Dashboard drafts section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockReset();
    axiosMock.delete.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    localStorage.clear();
    localStorage.setItem("mdmToken", "token");
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3333";
  });

  it("lists drafts with resume and delete actions", async () => {
    axiosMock.get.mockImplementation((url: string) => {
      if (url === "http://localhost:3333/partners") {
        return Promise.resolve({ data: [] });
      }
      if (url === "http://localhost:3333/partners/drafts") {
        return Promise.resolve({
          data: [
            {
              id: "draft-1",
              payload: { nome_legal: "Empresa X", natureza: "cliente" },
              updatedAt: "2024-05-10T12:00:00.000Z"
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });
    axiosMock.delete.mockResolvedValue({});

    render(<Dashboard />);

    await waitFor(() => {
      expect(axiosMock.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText(/meus rascunhos/i)).toBeInTheDocument();
    expect(screen.getByText(/empresa x/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /retomar/i }));
    expect(routerPushMock).toHaveBeenCalledWith("/partners/new?draftId=draft-1");

    await userEvent.click(screen.getByRole("button", { name: /excluir rascunho/i }));
    await waitFor(() => {
      expect(axiosMock.delete).toHaveBeenCalledWith(
        "http://localhost:3333/partners/drafts/draft-1",
        expect.objectContaining({ headers: { Authorization: "Bearer token" } })
      );
    });
  });
});
