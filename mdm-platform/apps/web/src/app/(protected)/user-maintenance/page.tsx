"use client";

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RefreshCcw, Trash2, UserCog, X } from "lucide-react";

import { getStoredUser } from "../../../lib/auth";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  profile: string | null;
  responsibilities: string[];
  status: "active" | "invited" | "blocked";
  lastAccessAt?: string | null;
};

type ManagedUserResponse = ManagedUser[];

type FormState = {
  name: string;
  email: string;
  profile: string;
  responsibilities: string;
  status: ManagedUser["status"];
};

const statusLabels: Record<ManagedUser["status"], string> = {
  active: "Ativo",
  invited: "Convite pendente",
  blocked: "Bloqueado"
};

const statusOptions = Object.entries(statusLabels) as Array<
  [ManagedUser["status"], string]
>;

const createEmptyFormState = (): FormState => ({
  name: "",
  email: "",
  profile: "",
  responsibilities: "",
  status: "invited"
});

const sanitizeResponsibilities = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const formatResponsibilities = (responsibilities: string[]): string =>
  responsibilities.join(", ");

export default function UserMaintenancePage() {
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FormState>(createEmptyFormState());
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [statusUserId, setStatusUserId] = useState<string | null>(null);
  const [statusValue, setStatusValue] = useState<ManagedUser["status"]>("active");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);

  const [confirmUser, setConfirmUser] = useState<ManagedUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentUser = useMemo(() => getStoredUser(), []);

  useEffect(() => {
    const fetchUsers = async () => {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await axios.get<ManagedUserResponse>(
          `${apiBaseUrl}/user-maintenance`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data = Array.isArray(response.data) ? response.data : [];
        setUsers(data);
        setError(null);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(
          typeof message === "string"
            ? message
            : "Não foi possível carregar a lista de usuários."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [router]);

  const metrics = useMemo(() => {
    const totals = { active: 0, invited: 0, blocked: 0 } as Record<
      ManagedUser["status"],
      number
    >;
    users.forEach((user) => {
      totals[user.status] += 1;
    });
    return totals;
  }, [users]);

  const openCreateForm = () => {
    setFormMode("create");
    setFormState(createEmptyFormState());
    setFormError(null);
    setActiveUserId(null);
    setIsFormOpen(true);
  };

  const openEditForm = (user: ManagedUser) => {
    setFormMode("edit");
    setActiveUserId(user.id);
    setFormState({
      name: user.name,
      email: user.email,
      profile: user.profile ?? "",
      responsibilities: formatResponsibilities(user.responsibilities),
      status: user.status
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormError(null);
    setIsSubmitting(false);
    setActiveUserId(null);
  };

  const handleFormChange = (field: keyof FormState) => (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const name = formState.name.trim();
    const email = formState.email.trim();
    const responsibilities = sanitizeResponsibilities(formState.responsibilities);

    if (!name) {
      setFormError("Informe o nome do usuário.");
      return;
    }

    if (!email || !email.includes("@")) {
      setFormError("Informe um e-mail válido.");
      return;
    }

    if (responsibilities.length === 0) {
      setFormError("Informe ao menos uma responsabilidade.");
      return;
    }

    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = {
      name,
      email,
      profile: formState.profile.trim() ? formState.profile.trim() : null,
      responsibilities,
      status: formState.status
    };

    try {
      setIsSubmitting(true);
      if (formMode === "create") {
        const response = await axios.post<ManagedUser>(
          `${apiBaseUrl}/user-maintenance`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        setUsers((prev) => [...prev, response.data]);
      } else if (activeUserId) {
        const response = await axios.put<ManagedUser>(
          `${apiBaseUrl}/user-maintenance/${activeUserId}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        setUsers((prev) =>
          prev.map((user) => (user.id === activeUserId ? response.data : user))
        );
      }
      closeForm();
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setFormError(
        typeof message === "string"
          ? message
          : "Não foi possível salvar o usuário."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openStatusModal = (user: ManagedUser) => {
    setStatusUserId(user.id);
    setStatusValue(user.status);
    setStatusError(null);
    setIsStatusOpen(true);
  };

  const closeStatusModal = () => {
    setIsStatusOpen(false);
    setStatusUserId(null);
    setStatusError(null);
    setIsStatusSubmitting(false);
  };

  const handleStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statusUserId) {
      return;
    }

    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setIsStatusSubmitting(true);
      const response = await axios.patch<ManagedUser>(
        `${apiBaseUrl}/user-maintenance/${statusUserId}`,
        { status: statusValue },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setUsers((prev) =>
        prev.map((user) => (user.id === statusUserId ? response.data : user))
      );
      closeStatusModal();
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setStatusError(
        typeof message === "string"
          ? message
          : "Não foi possível atualizar o status do usuário."
      );
    } finally {
      setIsStatusSubmitting(false);
    }
  };

  const openDeleteConfirmation = (user: ManagedUser) => {
    setConfirmUser(user);
    setDeleteError(null);
  };

  const closeDeleteConfirmation = () => {
    setConfirmUser(null);
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleDelete = async () => {
    if (!confirmUser) {
      return;
    }

    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setIsDeleting(true);
      await axios.delete(`${apiBaseUrl}/user-maintenance/${confirmUser.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers((prev) => prev.filter((user) => user.id !== confirmUser.id));
      closeDeleteConfirmation();
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setDeleteError(
        typeof message === "string"
          ? message
          : "Não foi possível excluir o usuário."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-zinc-900 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Manutenção de Usuários</h1>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Novo usuário
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          Visualize perfis, responsabilidades e status de acesso dos colaboradores que atuam no processo de MDM.
        </p>
        {currentUser?.responsibilities?.length ? (
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Você possui {currentUser.responsibilities.length} permissão(ões) vinculada(s).
          </span>
        ) : null}
      </header>

      {loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </section>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {(Object.keys(metrics) as ManagedUser["status"][]).map((status) => (
              <article key={status} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <span className="text-xs uppercase tracking-wide text-zinc-400">{statusLabels[status]}</span>
                <strong className="mt-2 block text-3xl font-semibold text-zinc-900">{metrics[status]}</strong>
              </article>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-zinc-200 text-left">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Nome</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">E-mail</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Perfil</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Responsabilidades</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Último acesso</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm text-zinc-600">
                {users.map((user) => {
                  const lastAccess = user.lastAccessAt
                    ? new Date(user.lastAccessAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Nunca";

                  return (
                    <tr key={user.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{user.name}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3 capitalize">{user.profile ?? "-"}</td>
                      <td className="px-4 py-3">
                        {user.responsibilities.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.responsibilities.map((responsibility) => (
                              <span
                                key={responsibility}
                                className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500"
                              >
                                {responsibility}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs uppercase tracking-wide text-zinc-400">Sem responsabilidades</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : user.status === "blocked"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{lastAccess}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => openStatusModal(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" /> Alterar status
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteConfirmation(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum usuário encontrado.</div>
            )}
          </section>
        </>
      )}

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 id="user-form-title" className="text-lg font-semibold text-zinc-900">
                {formMode === "create" ? "Novo usuário" : "Editar usuário"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="name">
                Nome
                <input
                  id="name"
                  name="name"
                  value={formState.name}
                  onChange={handleFormChange("name")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Digite o nome completo"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="email">
                E-mail
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formState.email}
                  onChange={handleFormChange("email")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="usuario@empresa.com"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="profile">
                Perfil
                <input
                  id="profile"
                  name="profile"
                  value={formState.profile}
                  onChange={handleFormChange("profile")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Perfil do usuário"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="responsibilities">
                Responsabilidades (separe por vírgulas)
                <textarea
                  id="responsibilities"
                  name="responsibilities"
                  value={formState.responsibilities}
                  onChange={handleFormChange("responsibilities")}
                  className="min-h-[96px] rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="partners.approval.fiscal, partners.approval.compras"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="status">
                Status
                <select
                  id="status"
                  name="status"
                  value={formState.status}
                  onChange={handleFormChange("status")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  {statusOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Salvando..."
                    : formMode === "create"
                      ? "Criar usuário"
                      : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isStatusOpen && statusUserId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 id="status-modal-title" className="text-lg font-semibold text-zinc-900">
                Alterar status
              </h2>
              <button
                type="button"
                onClick={closeStatusModal}
                className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleStatusSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-zinc-600" htmlFor="status-select">
                Status do usuário
                <select
                  id="status-select"
                  name="status"
                  value={statusValue}
                  onChange={(event) =>
                    setStatusValue(event.target.value as ManagedUser["status"])
                  }
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  {statusOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {statusError ? <p className="text-sm text-red-600">{statusError}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isStatusSubmitting}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isStatusSubmitting ? "Atualizando..." : "Atualizar status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 id="delete-modal-title" className="text-lg font-semibold text-zinc-900">
                Excluir usuário
              </h2>
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p id="delete-modal-description" className="text-sm text-zinc-600">
              Tem certeza de que deseja remover {confirmUser.name}? Essa ação não poderá ser desfeita.
            </p>

            {deleteError ? <p className="mt-4 text-sm text-red-600">{deleteError}</p> : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
