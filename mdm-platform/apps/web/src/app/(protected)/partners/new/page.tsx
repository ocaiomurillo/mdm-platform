"use client";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  type FieldPath,
  type FieldPathValue
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  onlyDigits,
  validateCEP,
  validateCNPJ,
  validateCPF,
  validateIbgeCode,
  validateIE
} from "@mdm/utils";

const contactSchema = z.object({
  nome: z.string().min(2, "Informe o nome do contato"),
  email: z.string().email("Email inválido"),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  padrao: z.boolean().optional()
});

const bankSchema = z.object({
  banco: z.string().min(2, "Informe o banco"),
  agencia: z.string().min(1, "Informe a agência"),
  conta: z.string().min(1, "Informe a conta"),
  pix: z.string().optional()
});

const transportSchema = z.object({
  sap_bp: z.string().min(1, "Informe o código BP")
});

const baseSchemaFields = {
  natureza: z.enum(["cliente", "fornecedor", "ambos"]),
  nome_fantasia: z.string().optional(),
  contatos: z.array(contactSchema).min(1, "Adicione ao menos um contato"),
  ie: z
    .string()
    .optional()
    .refine((value) => !value || validateIE(value, { allowIsento: true }), {
      message: "Inscrição estadual inválida"
    }),
  im: z.string().optional(),
  suframa: z.string().optional(),
  regime_tributario: z.string().optional(),
  cep: z
    .string()
    .min(1, "Informe o CEP")
    .refine((value) => validateCEP(value), "CEP inválido"),
  logradouro: z.string().min(2, "Informe o logradouro"),
  numero: z.string().min(1, "Informe o número"),
  complemento: z.string().optional(),
  bairro: z.string().min(2, "Informe o bairro"),
  municipio: z.string().min(2, "Informe o município"),
  municipio_ibge: z
    .string()
    .optional()
    .refine((value) => !value || !value.trim() || validateIbgeCode(value), {
      message: "Código IBGE inválido"
    }),
  uf: z.string().length(2, "Informe apenas a sigla da UF"),
  banks: z.array(bankSchema).min(1, "Inclua ao menos uma conta"),
  fornecedor_grupo: z.string().optional(),
  fornecedor_condicao: z.string().optional(),
  vendas_vendedor: z.string().optional(),
  vendas_grupo: z.string().optional(),
  fiscal_natureza_operacao: z.string().optional(),
  fiscal_tipo_beneficio: z.string().optional(),
  fiscal_regime_declaracao: z.string().optional(),
  transportadores: z.array(transportSchema).optional(),
  credito_parceiro: z.string().optional(),
  credito_modalidade: z.string().optional(),
  credito_montante: z
    .union([z.string().length(0), z.string().min(1)])
    .optional()
    .transform((value) => (value && value.trim().length ? value : undefined)),
  credito_validade: z.string().optional()
};

const createSchema = (tipo: "PJ" | "PF") => {
  const isPJ = tipo === "PJ";
  return z
    .object({
      ...baseSchemaFields,
      tipo_pessoa: z.literal(tipo),
      documento: z
        .string()
        .min(1, `Informe o ${isPJ ? "CNPJ" : "CPF"}`)
        .refine((value) => {
          const digits = onlyDigits(value || "");
          return isPJ ? validateCNPJ(digits) : validateCPF(digits);
        }, {
          message: isPJ ? "CNPJ inválido" : "CPF inválido"
        }),
      nome_legal: z.string().min(2, isPJ ? "Informe a razão social" : "Informe o nome completo")
    });
};

const schema = z
  .discriminatedUnion("tipo_pessoa", [createSchema("PJ"), createSchema("PF")])
  .superRefine((data, ctx) => {
    if (data.ie && !validateIE(data.ie, { allowIsento: true })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ie"],
        message: "Inscrição estadual inválida"
      });
    }
  });

type FormValues = z.infer<typeof schema>;
type ContactFormValue = z.infer<typeof contactSchema>;

const buildEmptyContact = (): ContactFormValue => ({
  nome: "",
  email: "",
  telefone: "",
  celular: "",
  padrao: true
});

type LookupResult = {
  nome?: string;
  nome_social?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  data_nascimento?: string;
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    municipio_ibge?: string;
    uf?: string;
  };
  inscricao_estadual?: string;
};

type ViaCepResponse = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service?: string;
  city_ibge?: string | number;
  ddd?: string;
  location?: {
    type: string;
    coordinates: {
      longitude: string;
      latitude: string;
    };
  };
};

const natureMatches = (natureza: string, targets: Array<'cliente' | 'fornecedor'>) => {
  return targets.some((target) => natureza === target || natureza === 'ambos');
};

const DRAFT_STORAGE_KEY = "mdm-partner-draft-id";

export default function NewPartner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting, dirtyFields }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_pessoa: "PJ",
      natureza: "cliente",
      contatos: [{ nome: "", email: "", telefone: "", celular: "", padrao: true }],
      banks: [{ banco: "", agencia: "", conta: "", pix: "" }],
      transportadores: []
    }
  });

  const natureza = watch("natureza");
  const tipoPessoa = watch("tipo_pessoa");
  const formValues = watch();
  const cepValue = watch("cep");
  const lastCepLookup = useRef<string | null>(null);
  const draftParam = searchParams.get("draftId");

  const applyDraftPayload = useCallback(
    (payload: Partial<FormValues>) => {
      if (!payload) return;
      const emailEntries = Array.isArray((payload as any).comunicacao_emails)
        ? ((payload as any).comunicacao_emails as FormValues["comunicacao_emails"])
        : undefined;
      const bankEntries = Array.isArray((payload as any).banks)
        ? ((payload as any).banks as FormValues["banks"])
        : undefined;
      const transportEntries = Array.isArray((payload as any).transportadores)
        ? ((payload as any).transportadores as FormValues["transportadores"])
        : undefined;

      reset(
        {
          tipo_pessoa: (payload.tipo_pessoa as FormValues["tipo_pessoa"]) ?? "PJ",
          natureza: (payload.natureza as FormValues["natureza"]) ?? "cliente",
          comunicacao_emails:
            emailEntries && emailEntries.length
              ? emailEntries
              : [{ endereco: "", padrao: true }],
          banks:
            bankEntries && bankEntries.length
              ? bankEntries
              : [{ banco: "", agencia: "", conta: "", pix: "" }],
          transportadores: transportEntries ?? [],
          ...payload
        } as FormValues,
        { keepDefaultValues: false }
      );
    },
    [reset]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftParam) {
      setCurrentDraftId(draftParam);
      localStorage.setItem(DRAFT_STORAGE_KEY, draftParam);
      return;
    }
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (stored) {
      setCurrentDraftId(stored);
    } else {
      setCurrentDraftId(null);
    }
  }, [draftParam]);

  useEffect(() => {
    if (!currentDraftId) {
      setDraftLoading(false);
      setDraftError(null);
      return;
    }
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    const fetchDraft = async () => {
      setDraftLoading(true);
      setDraftError(null);
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/partners/drafts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const drafts = Array.isArray(response.data) ? response.data : [];
        const matched = drafts.find((entry: any) => entry?.id === currentDraftId);
        if (!matched) {
          if (!cancelled) {
            setDraftError("Rascunho não encontrado ou indisponível.");
          }
          return;
        }
        if (!cancelled && matched.payload) {
          applyDraftPayload(matched.payload as Partial<FormValues>);
        }
      } catch (error: any) {
        if (error?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = error?.response?.data?.message;
        if (!cancelled) {
          setDraftError(typeof message === "string" ? message : "Não foi possível carregar o rascunho.");
        }
      } finally {
        if (!cancelled) {
          setDraftLoading(false);
        }
      }
    };
    fetchDraft();
    return () => {
      cancelled = true;
    };
  }, [applyDraftPayload, currentDraftId, router]);

  useEffect(() => {
    if (!draftSuccess) return;
    if (process.env.NODE_ENV === "test") return;
    const timeout = window.setTimeout(() => setDraftSuccess(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [draftSuccess]);

  const natureLabels: Record<FormValues["natureza"], string> = {
    cliente: "Cliente",
    fornecedor: "Fornecedor",
    ambos: "Cliente e fornecedor"
  };

  const getErrorAtPath = (fieldPath: string) => {
    const segments = fieldPath.split(".") as any;
    let current: any = errors;
    for (const segment of segments) {
      if (!current) break;
      current = current[segment];
    }
    return current ?? null;
  };

  const isFilledString = (value: unknown) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return Boolean(value);
  };

  const contacts = formValues?.contatos ?? [];
  const banks = formValues?.banks ?? [];
  const transporters = formValues?.transportadores ?? [];

  const requiresFornecedor = useMemo(() => natureMatches(natureza, ["fornecedor"]), [natureza]);
  const requiresCliente = useMemo(() => natureMatches(natureza, ["cliente"]), [natureza]);

  const hasAnyError = (paths: string[]) => paths.some((path) => Boolean(getErrorAtPath(path)));

  const timelineSteps = useMemo(() => {
    const typeLabel = tipoPessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";

    const identificationComplete =
      isFilledString(formValues?.documento) &&
      isFilledString(formValues?.nome_legal) &&
      !hasAnyError(["documento", "nome_legal"]);

    const addressComplete =
      ["cep", "logradouro", "numero", "bairro", "municipio", "uf"].every((field) =>
        isFilledString((formValues as any)?.[field])
      ) && !hasAnyError(["cep", "logradouro", "numero", "bairro", "municipio", "uf", "municipio_ibge"]);

    const contactComplete =
      contacts.length > 0 &&
      contacts.every((contact) => isFilledString(contact?.nome) && isFilledString(contact?.email)) &&
      contacts.some((contact) => contact?.padrao) &&
      !hasAnyError(["contatos"]);

    const financeComplete =
      banks.length > 0 &&
      banks.every((bank) => isFilledString(bank?.banco) && isFilledString(bank?.agencia) && isFilledString(bank?.conta)) &&
      !hasAnyError(["banks"]);

    const fornecedorComplete = !requiresFornecedor
      ? true
      : isFilledString(formValues?.fornecedor_grupo) &&
        isFilledString(formValues?.fornecedor_condicao) &&
        !hasAnyError(["fornecedor_grupo", "fornecedor_condicao"]);

    const vendasComplete = !requiresCliente
      ? true
      : isFilledString(formValues?.vendas_vendedor) &&
        isFilledString(formValues?.vendas_grupo) &&
        !hasAnyError(["vendas_vendedor", "vendas_grupo"]);

    const fiscalComplete = !hasAnyError([
      "fiscal_natureza_operacao",
      "fiscal_tipo_beneficio",
      "fiscal_regime_declaracao"
    ]);

    const transportComplete =
      (transporters.length === 0 || transporters.every((item) => isFilledString(item?.sap_bp))) &&
      !hasAnyError(["transportadores"]);

    const creditComplete = !hasAnyError([
      "credito_parceiro",
      "credito_modalidade",
      "credito_montante",
      "credito_validade"
    ]);

    const steps = [
      {
        id: "classificacao",
        label: "Natureza",
        description: `${typeLabel} · ${natureLabels[natureza] ?? "Selecionar"}`,
        completed: !hasAnyError(["tipo_pessoa", "natureza"])
      },
      {
        id: "identificacao",
        label: "Identificação",
        description: "Documentos e dados legais",
        completed: identificationComplete
      },
      {
        id: "endereco",
        label: "Endereço",
        description: "Localização e CEP",
        completed: addressComplete
      },
      {
        id: "contato",
        label: "Contato",
        description: "Responsável e comunicação",
        completed: contactComplete
      },
      {
        id: "financeiro",
        label: "Financeiro",
        description: "Contas bancárias",
        completed: financeComplete
      }
    ];

    if (requiresFornecedor) {
      steps.push({
        id: "fornecedor",
        label: "Fornecimento",
        description: "Dados de fornecedor",
        completed: fornecedorComplete
      });
    }

    if (requiresCliente) {
      steps.push({
        id: "vendas",
        label: "Vendas",
        description: "Informações comerciais",
        completed: vendasComplete
      });
    }

    steps.push(
      {
        id: "fiscal",
        label: "Fiscal",
        description: "Regras fiscais",
        completed: fiscalComplete
      },
      {
        id: "transporte",
        label: "Transporte",
        description: "Transportadores",
        completed: transportComplete
      },
      {
        id: "credito",
        label: "Crédito",
        description: "Limites e condições",
        completed: creditComplete
      }
    );

    return steps;
  }, [banks, contacts, errors, formValues, natureza, requiresCliente, requiresFornecedor, tipoPessoa, transporters]);

  const activeStepId = useMemo(
    () => timelineSteps.find((step) => !step.completed)?.id ?? timelineSteps[timelineSteps.length - 1]?.id,
    [timelineSteps]
  );

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactModalError, setContactModalError] = useState<string | null>(null);
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactFormValue>(buildEmptyContact);

  const {
    fields: bankFields,
    append: appendBank,
    remove: removeBank
  } = useFieldArray({ control, name: "banks" });

  const {
    fields: transportFields,
    append: appendTransport,
    remove: removeTransport
  } = useFieldArray({ control, name: "transportadores" });

  const setFieldIfEmpty = <K extends FieldPath<FormValues>>(
    field: K,
    value: FieldPathValue<FormValues, K>,
    options?: Parameters<typeof setValue>[2]
  ) => {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === "string" && !value.trim()) {
      return;
    }

    const currentValue = watch(field);
    const isEmpty =
      currentValue === undefined ||
      currentValue === null ||
      (typeof currentValue === "string" && currentValue.trim().length === 0);

    if (isEmpty) {
      setValue(field, value, options);
    }
  };

  const setContactsValue = (
    nextContacts: ContactFormValue[],
    options: { shouldValidate?: boolean } = {}
  ) => {
    setValue("contatos", nextContacts, {
      shouldDirty: true,
      shouldValidate: options.shouldValidate ?? true
    });
  };

  const openNewContactModal = () => {
    const current = getValues("contatos") ?? [];
    const empty = buildEmptyContact();
    if (current.some((contact) => contact?.padrao)) {
      empty.padrao = false;
    }
    setContactDraft(empty);
    setEditingContactIndex(null);
    setContactModalError(null);
    setContactModalOpen(true);
  };

  const openEditContactModal = (index: number) => {
    const current = getValues("contatos") ?? [];
    const target = current[index];
    if (!target) return;
    setContactDraft({
      nome: target.nome ?? "",
      email: target.email ?? "",
      telefone: target.telefone ?? "",
      celular: target.celular ?? "",
      padrao: target.padrao ?? false
    });
    setEditingContactIndex(index);
    setContactModalError(null);
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setContactModalError(null);
    setContactDraft(buildEmptyContact());
    setEditingContactIndex(null);
  };

  const handleSetDefaultContact = (index: number) => {
    const current = getValues("contatos") ?? [];
    if (!current[index]) {
      return;
    }
    const updated = current.map((contact, idx) => ({
      nome: contact.nome ?? "",
      email: contact.email ?? "",
      telefone: contact.telefone ?? "",
      celular: contact.celular ?? "",
      padrao: idx === index
    }));
    setContactsValue(updated);
  };

  const handleRemoveContact = (index: number) => {
    const current = getValues("contatos") ?? [];
    if (current.length <= 1) {
      return;
    }
    const updated = current
      .filter((_, idx) => idx !== index)
      .map((contact) => ({
        nome: contact.nome ?? "",
        email: contact.email ?? "",
        telefone: contact.telefone ?? "",
        celular: contact.celular ?? "",
        padrao: contact.padrao ?? false
      }));
    if (!updated.some((contact) => contact.padrao)) {
      updated[0] = { ...updated[0], padrao: true };
    }
    setContactsValue(updated);
  };

  const handleSaveContact = () => {
    const trimmedNome = contactDraft.nome?.trim() ?? "";
    const trimmedEmail = contactDraft.email?.trim() ?? "";
    const trimmedTelefone = contactDraft.telefone?.trim() ?? "";
    const trimmedCelular = contactDraft.celular?.trim() ?? "";

    const validation = contactSchema.safeParse({
      nome: trimmedNome,
      email: trimmedEmail,
      telefone: trimmedTelefone,
      celular: trimmedCelular,
      padrao: contactDraft.padrao ?? false
    });

    if (!validation.success) {
      const issue = validation.error.issues[0];
      setContactModalError(issue?.message ?? "Revise os dados do contato.");
      return;
    }

    const sanitized: ContactFormValue = {
      nome: trimmedNome,
      email: trimmedEmail,
      telefone: trimmedTelefone,
      celular: trimmedCelular,
      padrao: validation.data.padrao ?? false
    };

    const current = getValues("contatos") ?? [];
    let updated = current.map((contact) => ({
      nome: contact.nome ?? "",
      email: contact.email ?? "",
      telefone: contact.telefone ?? "",
      celular: contact.celular ?? "",
      padrao: contact.padrao ?? false
    }));

    if (editingContactIndex === null) {
      updated = [...updated, sanitized];
      const shouldBeDefault = sanitized.padrao || !current.some((contact) => contact?.padrao);
      updated = updated.map((contact, index) => ({
        ...contact,
        padrao: shouldBeDefault ? index === updated.length - 1 : contact.padrao ?? false
      }));
    } else {
      updated = updated.map((contact, index) =>
        index === editingContactIndex ? { ...sanitized } : { ...contact }
      );
      if (sanitized.padrao) {
        updated = updated.map((contact, index) => ({
          ...contact,
          padrao: index === editingContactIndex
        }));
      } else if (!updated.some((contact) => contact.padrao)) {
        updated = updated.map((contact, index) => ({
          ...contact,
          padrao: index === 0
        }));
      }
    }

    setContactsValue(updated);
    closeContactModal();
  };

  const fillDefaultContactIfEmpty = (updates: Partial<ContactFormValue>) => {
    if (!updates) return;
    const current = getValues("contatos") ?? [];
    let normalized = current.map((contact) => ({
      nome: contact.nome ?? "",
      email: contact.email ?? "",
      telefone: contact.telefone ?? "",
      celular: contact.celular ?? "",
      padrao: contact.padrao ?? false
    }));

    if (normalized.length === 0) {
      const next = { ...buildEmptyContact(), ...updates, padrao: true };
      setContactsValue([next], { shouldValidate: true });
      return;
    }

    if (!normalized.some((contact) => contact.padrao)) {
      normalized = normalized.map((contact, index) => ({
        ...contact,
        padrao: index === 0
      }));
    }

    const defaultIndex = normalized.findIndex((contact) => contact.padrao);
    if (defaultIndex < 0) {
      return;
    }

    const defaultContact = { ...normalized[defaultIndex] };
    let changed = false;

    if (typeof updates.nome === "string" && !defaultContact.nome.trim() && updates.nome.trim()) {
      defaultContact.nome = updates.nome.trim();
      changed = true;
    }

    if (typeof updates.email === "string" && !defaultContact.email.trim() && updates.email.trim()) {
      defaultContact.email = updates.email.trim();
      changed = true;
    }

    if (
      typeof updates.telefone === "string" &&
      !(defaultContact.telefone ?? "").trim() &&
      updates.telefone.trim()
    ) {
      defaultContact.telefone = updates.telefone.trim();
      changed = true;
    }

    if (
      typeof updates.celular === "string" &&
      !(defaultContact.celular ?? "").trim() &&
      updates.celular.trim()
    ) {
      defaultContact.celular = updates.celular.trim();
      changed = true;
    }

    if (changed) {
      normalized[defaultIndex] = { ...defaultContact, padrao: true };
      setContactsValue(normalized, { shouldValidate: true });
    }
  };

  useEffect(() => {
    if (!contactModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContactModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeContactModal, contactModalOpen]);

  type AddressField =
    | "cep"
    | "logradouro"
    | "numero"
    | "complemento"
    | "bairro"
    | "municipio"
    | "municipio_ibge"
    | "uf";

  const isAddressFieldDirty = (field: AddressField) => {
    const dirtyMap = dirtyFields as Record<string, unknown> | undefined;
    const state = dirtyMap?.[field];
    if (typeof state === "boolean") {
      return state;
    }
    return Boolean(state);
  };

  const setAddressFieldValue = (
    field: AddressField,
    rawValue: unknown,
    options: {
      uppercase?: boolean;
      allowEmpty?: boolean;
      force?: boolean;
      shouldDirty?: boolean;
      transform?: (value: string) => string;
    } = {}
  ) => {
    const { uppercase = true, allowEmpty = false, force = false, shouldDirty = false, transform } = options;

    if (rawValue === undefined || rawValue === null) {
      return;
    }

    let value = typeof rawValue === "string" ? rawValue : String(rawValue);
    const trimmed = value.trim();

    if (!allowEmpty && !trimmed) {
      return;
    }

    value = trimmed;

    if (transform) {
      value = transform(value);
    }

    if (uppercase) {
      value = value.toUpperCase();
    }

    if (!force && isAddressFieldDirty(field)) {
      return;
    }

    setValue(field as FieldPath<FormValues>, value as any, {
      shouldValidate: true,
      shouldDirty
    });
  };

  const applyAddressData = (
    address: Partial<Record<AddressField, unknown>> | null | undefined,
    options: { forceCep?: boolean; markCepDirty?: boolean } = {}
  ) => {
    if (!address) return;

    const { forceCep = false, markCepDirty = false } = options;

    setAddressFieldValue("cep", address.cep, { uppercase: false, force: forceCep, shouldDirty: markCepDirty });
    setAddressFieldValue("logradouro", address.logradouro);
    setAddressFieldValue("numero", address.numero, { uppercase: false });
    setAddressFieldValue("complemento", address.complemento);
    setAddressFieldValue("bairro", address.bairro);
    setAddressFieldValue("municipio", address.municipio);
    setAddressFieldValue("municipio_ibge", address.municipio_ibge, { uppercase: false });
    setAddressFieldValue("uf", address.uf, { transform: (value) => value.slice(0, 2) });
  };

  const applyLookupData = (data: LookupResult) => {
    if (!data) return;
    if (data.nome) {
      setFieldIfEmpty("nome_legal", data.nome, { shouldValidate: true });
    }
    if (data.nome_social) {
      setValue("nome_fantasia", data.nome_social, { shouldValidate: false });
    }
    const contactUpdates: Partial<ContactFormValue> = {};
    if (data.nome) {
      contactUpdates.nome = data.nome;
    }
    if (data.email) {
      contactUpdates.email = data.email;
    }
    if (data.telefone) {
      contactUpdates.telefone = data.telefone;
    }
    if (data.celular) {
      contactUpdates.celular = data.celular;
    }
    if (Object.keys(contactUpdates).length > 0) {
      fillDefaultContactIfEmpty(contactUpdates);
    }
    if (data.inscricao_estadual) {
      setFieldIfEmpty("ie", data.inscricao_estadual);
    }
    applyAddressData(data.endereco);
  };

  const handleLookupDocumento = async () => {
    const rawDoc = watch("documento") || "";
    const digits = onlyDigits(rawDoc);
    const isValidDocument = tipoPessoa === "PJ" ? validateCNPJ(digits) : validateCPF(digits);
    if (!isValidDocument) {
      setDocError(`Informe um ${tipoPessoa === "PJ" ? "CNPJ" : "CPF"} válido para buscar.`);
      return;
    }
    setDocError(null);
    setDocLoading(true);

    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const urlSuffix = tipoPessoa === "PJ" ? `cnpj/${digits}` : `cpf/${digits}`;
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/partners/${urlSuffix}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data as LookupResult;
      applyLookupData(data);
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        setDocError("Sessão expirada. Faça login novamente.");
        return;
      }
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : error?.message;
      setDocError(typeof message === "string" ? message : "Não foi possível obter dados do documento.");
    } finally {
      setDocLoading(false);
    }
  };

  const handleLookupCep = async (input?: string) => {
    if (cepLoading) return;

    const rawCep = (typeof input === "string" ? input : watch("cep") || "") as string;
    const digits = onlyDigits(rawCep);

    setCepError(null);

    if (digits.length === 0) {
      return;
    }

    if (digits.length !== 8) {
      setCepError("CEP inválido.");
      return;
    }
    setCepLoading(true);

    try {
      const response = await axios.get<ViaCepResponse>(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      const data = response.data;

      if (!data || !data.cep) {
        setCepError("CEP inválido.");
        return;
      }

      const normalizedAddress = {
        cep: data.cep,
        logradouro: data.street,
        bairro: data.neighborhood,
        municipio: data.city,
        municipio_ibge: data.city_ibge ? `${data.city_ibge}` : undefined,
        uf: data.state
      } satisfies Partial<Record<AddressField, unknown>>;

      applyAddressData(normalizedAddress, { forceCep: true, markCepDirty: true });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setCepError("CEP inválido.");
        return;
      }
      setCepError("CEP inválido.");
    } finally {
      setCepLoading(false);
    }
  };

  useEffect(() => {
    const digits = onlyDigits(cepValue || "");
    if (digits.length !== 8) {
      if (digits.length < 8) {
        lastCepLookup.current = null;
      }
      return;
    }
    if (cepLoading) {
      return;
    }
    if (lastCepLookup.current === digits) {
      return;
    }
    lastCepLookup.current = digits;
    void handleLookupCep(cepValue || "");
  }, [cepLoading, cepValue, handleLookupCep]);

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    setDraftSuccess(null);
    setDraftError(null);
    const token = localStorage.getItem("mdmToken");
    if (!token) {
      setSubmitError("Sessão expirada. Faça login novamente.");
      router.replace("/login");
      return;
    }

    const sanitize = (value?: string | null) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    };

    const documentoLimpo = onlyDigits(values.documento);
    const nomeFantasia = sanitize(values.nome_fantasia);
    const inscricaoEstadual = sanitize(values.ie);
    const inscricaoMunicipal = sanitize(values.im);
    const regimeTributario = sanitize(values.regime_tributario);
    const suframa = sanitize(values.suframa);
    const complemento = sanitize(values.complemento);
    const municipioIbge = sanitize(values.municipio_ibge);
    const municipioValor = values.municipio.trim();
    const municipioUpper = municipioValor.toUpperCase();
    const ufValor = values.uf.trim().toUpperCase();
    const fornecedorGrupo = sanitize(values.fornecedor_grupo);
    const fornecedorCondicao = sanitize(values.fornecedor_condicao);
    const vendasVendedor = sanitize(values.vendas_vendedor);
    const vendasGrupo = sanitize(values.vendas_grupo);
    const fiscalNatureza = sanitize(values.fiscal_natureza_operacao);
    const fiscalBeneficio = sanitize(values.fiscal_tipo_beneficio);
    const fiscalRegime = sanitize(values.fiscal_regime_declaracao);
    const creditoParceiro = sanitize(values.credito_parceiro);
    const creditoModalidade = sanitize(values.credito_modalidade);
    const creditoMontanteRaw = sanitize(values.credito_montante);
    const creditoValidade = sanitize(values.credito_validade);

    const contactsPayload = values.contatos.map((contact, index) => {
      const nomeContato = contact.nome.trim();
      const emailContato = contact.email.trim();
      const telefoneContato = sanitize(contact.telefone);
      const celularContato = sanitize(contact.celular);
      const isPadrao = contact.padrao ?? index === 0;
      return {
        nome: nomeContato,
        email: emailContato,
        telefone: telefoneContato,
        celular: celularContato,
        padrao: isPadrao
      };
    });

    const defaultContact = contactsPayload.find((contact) => contact.padrao) ?? contactsPayload[0];

    const payload = {
      tipo_pessoa: values.tipo_pessoa,
      natureza: values.natureza,
      documento: documentoLimpo,
      nome_legal: values.nome_legal.trim(),
      ...(nomeFantasia ? { nome_fantasia: nomeFantasia } : {}),
      ...(values.tipo_pessoa === "PJ"
        ? {
            ...(inscricaoEstadual ? { ie: inscricaoEstadual } : {}),
            ...(inscricaoMunicipal ? { im: inscricaoMunicipal } : {}),
            ...(regimeTributario ? { regime_tributario: regimeTributario } : {}),
            ...(suframa ? { suframa } : {})
          }
        : {
            ...(suframa ? { suframa } : {})
          }),
      contato_principal: {
        nome: defaultContact?.nome ?? "",
        email: defaultContact?.email ?? "",
        ...(defaultContact?.telefone
          ? { fone: defaultContact.telefone }
          : defaultContact?.celular
          ? { fone: defaultContact.celular }
          : {})
      },
      comunicacao: {
        ...(defaultContact?.telefone ? { telefone: defaultContact.telefone } : {}),
        ...(defaultContact?.celular ? { celular: defaultContact.celular } : {}),
        emails: contactsPayload.map((contact, index) => ({
          endereco: contact.email,
          padrao: contact.padrao ?? index === 0
        })),
        ...(contactsPayload.length
          ? {
              contatos: contactsPayload.map((contact) => {
                const entry: Record<string, unknown> = {
                  nome: contact.nome,
                  email: contact.email,
                  padrao: contact.padrao ?? false
                };
                if (contact.telefone) {
                  entry.telefone = contact.telefone;
                }
                if (contact.celular) {
                  entry.celular = contact.celular;
                }
                return entry;
              })
            }
          : {})
      },
      addresses: [
        {
          tipo: "fiscal",
          cep: onlyDigits(values.cep),
          logradouro: values.logradouro.trim(),
          numero: values.numero.trim(),
          ...(complemento ? { complemento } : {}),
          bairro: values.bairro.trim(),
          municipio_ibge: municipioIbge || municipioValor,
          uf: ufValor,
          municipio: municipioUpper,
          pais: "BR"
        }
      ],
      banks: values.banks.map((bank) => {
        const pix = sanitize(bank.pix);
        return {
          banco: bank.banco.trim(),
          agencia: bank.agencia.trim(),
          conta: bank.conta.trim(),
          ...(pix ? { pix } : {})
        };
      }),
      fornecedor_info: requiresFornecedor
        ? {
            ...(fornecedorGrupo ? { grupo: fornecedorGrupo } : {}),
            ...(fornecedorCondicao ? { condicao_pagamento: fornecedorCondicao } : {})
          }
        : {},
      vendas_info: requiresCliente
        ? {
            ...(vendasVendedor ? { vendedor: vendasVendedor } : {}),
            ...(vendasGrupo ? { grupo_clientes: vendasGrupo } : {})
          }
        : {},
      fiscal_info: {
        ...(fiscalNatureza ? { natureza_operacao: fiscalNatureza } : {}),
        ...(fiscalBeneficio ? { tipo_beneficio_suframa: fiscalBeneficio } : {}),
        ...(fiscalRegime ? { regime_declaracao: fiscalRegime } : {})
      },
      transportadores: (values.transportadores || [])
        .map((item) => item.sap_bp?.trim())
        .filter((sapBp): sapBp is string => Boolean(sapBp))
        .map((sapBp) => ({ sap_bp: sapBp })),
      credito_info: {
        ...(creditoParceiro ? { parceiro: creditoParceiro } : {}),
        ...(creditoModalidade ? { modalidade: creditoModalidade } : {}),
        ...(creditoMontanteRaw
          ? {
              montante: Number(creditoMontanteRaw.replace(/[^0-9.,-]/g, "").replace(",", "."))
            }
          : {}),
        ...(creditoValidade ? { validade: creditoValidade } : {})
      },
      sap_segments: []
    };

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/partners`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push("/partners");
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setSubmitError(typeof message === "string" ? message : "Não foi possível salvar o parceiro.");
    }
  };

  const handleSaveDraft = async () => {
    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      return;
    }
    setDraftSaving(true);
    setDraftError(null);
    setDraftSuccess(null);
    try {
      const payload = watch();
      const headers = { Authorization: `Bearer ${token}` };
      let response;
      if (currentDraftId) {
        response = await axios.patch(
          `${process.env.NEXT_PUBLIC_API_URL}/partners/drafts/${currentDraftId}`,
          { payload },
          { headers }
        );
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/partners/drafts`,
          { payload },
          { headers }
        );
      }
      const saved = response?.data;
      if (saved?.id) {
        setCurrentDraftId(saved.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(DRAFT_STORAGE_KEY, saved.id);
        }
        if (!currentDraftId) {
          router.replace(`/partners/new?draftId=${saved.id}`);
        }
      }
      setDraftSuccess("Rascunho salvo com sucesso.");
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setDraftError(typeof message === "string" ? message : "Não foi possível salvar o rascunho.");
    } finally {
      setDraftSaving(false);
    }
  };

  const renderError = (fieldPath: keyof FormValues | string) => {
    const segments = String(fieldPath).split(".") as Array<string>;
    let current: any = errors;
    for (const segment of segments) {
      if (!current) break;
      current = current[segment];
    }
    if (!current) return null;
    const message = current?.message || current?.root?.message;
    if (!message) return null;
    return <p className="text-sm text-red-600">{message}</p>;
  };

  return (
    <main className="p-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">Novo Parceiro</h1>
          <p className="text-sm text-zinc-500">Preencha todas as informações necessárias para integrar o parceiro ao SAP.</p>
        </header>

        {draftLoading && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Carregando rascunho salvo...
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-6 lg:h-[calc(100vh-220px)] lg:grid-cols-[minmax(0,260px),1fr] lg:items-start lg:overflow-hidden"
        >
          <aside className="lg:self-start">
            <nav
              aria-label="Etapas do cadastro"
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none"
            >
              <ol className="flex gap-4 overflow-x-auto lg:flex-col lg:gap-6 lg:overflow-visible">
                {timelineSteps.map((step, index) => {
                  const isActive = activeStepId === step.id;
                  const isCompleted = step.completed;
                  const indicatorClass = isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isActive
                    ? "border-zinc-900 text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-400";
                  const labelClass = isCompleted
                    ? "text-emerald-700"
                    : isActive
                    ? "text-zinc-900"
                    : "text-zinc-600";

                  return (
                    <li key={step.id} className="flex-shrink-0 lg:flex-shrink">
                      <a
                        href={`#${step.id}`}
                        aria-label={`Etapa ${index + 1}: ${step.label}`}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex min-w-[160px] items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:w-full lg:min-w-0 lg:rounded-lg ${
                          isActive ? "bg-white shadow-sm lg:bg-zinc-50" : "hover:bg-white/70"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${indicatorClass}`}
                          aria-hidden="true"
                        >
                          {isCompleted ? (
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                              <path
                                d="M5 10.5l3 3 7-7"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span className={`text-sm font-medium ${labelClass}`}>{step.label}</span>
                          {step.description && (
                            <span className="text-xs text-zinc-500">{step.description}</span>
                          )}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </aside>

          <div className="space-y-6 lg:h-full lg:overflow-y-auto lg:pr-4">
            <section id="classificacao" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Classificação</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Tipo de pessoa</label>
                  <select {...register("tipo_pessoa")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <option value="PJ">Pessoa Jurídica</option>
                    <option value="PF">Pessoa Física</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Natureza</label>
                  <select {...register("natureza")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <option value="cliente">Cliente</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
              </div>
            </section>

            <section id="identificacao" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Identificação</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Documento</label>
                  <div className="flex gap-2">
                    <input
                      {...register("documento")}
                      placeholder={tipoPessoa === "PJ" ? "CNPJ" : "CPF"}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleLookupDocumento}
                      disabled={docLoading}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {docLoading ? "Buscando..." : `Buscar ${tipoPessoa === "PJ" ? 'CNPJ' : 'CPF'}`}
                    </button>
                  </div>
                  {renderError("documento")}
                  {docError && <p className="mt-1 text-sm text-red-600">{docError}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Inscrição Estadual</label>
                  <input {...register("ie")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Nome legal</label>
                  <input {...register("nome_legal")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Razão social / Nome completo" />
                  {renderError("nome_legal")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Nome fantasia</label>
                  <input {...register("nome_fantasia")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Inscrição Municipal</label>
                  <input {...register("im")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">SUFRAMA</label>
                  <input {...register("suframa")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Regime tributário</label>
                  <input {...register("regime_tributario")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Simples, Lucro Presumido..." />
                </div>
              </div>
            </section>

            <section id="endereco" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Endereço</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-6">
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">CEP</label>
                  <div className="flex items-center gap-2">
                    <input
                      {...register("cep")}
                      onBlur={handleLookupCep}
                      placeholder="00000-000"
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                    {cepLoading ? <span className="text-xs text-zinc-500">Buscando...</span> : null}
                  </div>
                  {renderError("cep")}
                  {cepError && <p className="mt-1 text-sm text-red-600">{cepError}</p>}
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Logradouro</label>
                  <input
                    {...register("logradouro")}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Rua, avenida..."
                  />
                  {renderError("logradouro")}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-6">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Número</label>
                  <input
                    {...register("numero")}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="000"
                  />
                  {renderError("numero")}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Complemento</label>
                  <input
                    {...register("complemento")}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Apartamento, sala..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Bairro</label>
                  <input
                    {...register("bairro")}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Bairro"
                  />
                  {renderError("bairro")}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-6">
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Município</label>
                  <input
                    {...register("municipio")}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Cidade"
                  />
                  {renderError("municipio")}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">UF</label>
                  <input
                    {...register("uf")}
                    maxLength={2}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm uppercase"
                    placeholder="UF"
                  />
                  {renderError("uf")}
                </div>
              </div>
              <input type="hidden" {...register("municipio_ibge")} />
              {renderError("municipio_ibge")}
            </section>

          <section id="contato" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Contatos</h2>
                <p className="text-xs text-zinc-500">
                  Cadastre os responsáveis pela comunicação do parceiro. É obrigatório definir um contato padrão.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewContactModal}
                className="self-start text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
              >
                Adicionar contato
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {contacts.length ? (
                contacts.map((contact, index) => {
                  const nome = contact?.nome?.trim();
                  const email = contact?.email?.trim();
                  const telefoneValue = contact?.telefone?.trim();
                  const celularValue = contact?.celular?.trim();
                  const isDefault = contact?.padrao ?? index === 0;
                  return (
                    <div key={`contact-${index}`} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-zinc-800">{nome || "Contato sem nome"}</p>
                          <p className="text-sm text-zinc-600">{email || "—"}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                            {telefoneValue ? <span>Telefone: {telefoneValue}</span> : null}
                            {celularValue ? <span>Celular: {celularValue}</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          {isDefault ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Contato padrão
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultContact(index)}
                              className="text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
                            >
                              Definir como padrão
                            </button>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditContactModal(index)}
                              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveContact(index)}
                              disabled={contacts.length === 1}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500">Adicione ao menos um contato para este parceiro.</p>
              )}
            </div>
            <div className="mt-2">{renderError("contatos")}</div>
          </section>

            <section id="financeiro" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Dados bancários</h2>
                <button
                  type="button"
                  onClick={() => appendBank({ banco: "", agencia: "", conta: "", pix: "" })}
                  className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Adicionar conta
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Conta bancária deve estar em nome da empresa ou pessoa física cadastrada.</p>
              <div className="mt-3 space-y-3">
                {bankFields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Banco</label>
                        <input {...register(`banks.${index}.banco` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                        {renderError(`banks.${index}.banco`)}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Agência</label>
                        <input {...register(`banks.${index}.agencia` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                        {renderError(`banks.${index}.agencia`)}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Conta</label>
                        <input {...register(`banks.${index}.conta` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                        {renderError(`banks.${index}.conta`)}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Chave PIX</label>
                        <input {...register(`banks.${index}.pix` as const)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeBank(index)}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                        disabled={bankFields.length === 1}
                      >
                        Remover conta
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {requiresFornecedor && (
              <section id="fornecedor" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de fornecimento</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Grupo de fornecedores</label>
                    <input {...register("fornecedor_grupo")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Condição de pagamento padrão</label>
                    <input {...register("fornecedor_condicao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                  </div>
                </div>
              </section>
            )}

            {requiresCliente && (
              <section id="vendas" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de vendas</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Vendedor responsável</label>
                    <input {...register("vendas_vendedor")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Grupo de clientes</label>
                    <input {...register("vendas_grupo")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                  </div>
                </div>
              </section>
            )}

            <section id="fiscal" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações fiscais</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Natureza da operação</label>
                  <select {...register("fiscal_natureza_operacao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <option value="">Selecione</option>
                    <option value="comercializacao">Comercialização</option>
                    <option value="consumo">Consumo</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Benefício SUFRAMA</label>
                  <input {...register("fiscal_tipo_beneficio")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Opcional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Regime de declaração</label>
                  <input {...register("fiscal_regime_declaracao")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="EFD, Simples, etc." />
                </div>
              </div>
            </section>

            <section id="transporte" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de transporte</h2>
                <button
                  type="button"
                  onClick={() => appendTransport({ sap_bp: "" })}
                  className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Adicionar BP transportador
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {transportFields.length ? (
                  transportFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-3">
                      <input
                        {...register(`transportadores.${index}.sap_bp` as const)}
                        className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="BP SAP transportador"
                      />
                      <button
                        type="button"
                        onClick={() => removeTransport(index)}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
                      >
                        Remover
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">Nenhum transportador adicionado.</p>
                )}
              </div>
            </section>

            <section id="credito" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Informações de crédito</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Parceiro de crédito</label>
                  <input {...register("credito_parceiro")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Inferior / Dinâmica" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Modalidade</label>
                  <input {...register("credito_modalidade")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Inferior ou Dinâmica" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Montante aprovado</label>
                  <input {...register("credito_montante")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="Ex.: 50000" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Validade</label>
                  <input type="date" {...register("credito_validade")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </section>

            {submitError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>}
            {draftError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{draftError}</div>}
            {draftSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{draftSuccess}</div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={draftSaving || draftLoading || isSubmitting}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:border-zinc-300 hover:bg-zinc-50"
              >
                {draftSaving ? "Salvando..." : "Salvar esboço"}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Salvar parceiro"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {contactModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 px-4 py-6"
          onClick={closeContactModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingContactIndex === null ? "Novo contato" : "Editar contato"}
                </h3>
                <p className="text-xs text-zinc-500">
                  Informe os dados do contato responsável pela comunicação.
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactModal}
                className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Nome</label>
                <input
                  value={contactDraft.nome}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, nome: event.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Email</label>
                <input
                  type="email"
                  value={contactDraft.email}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Telefone</label>
                  <input
                    value={contactDraft.telefone ?? ""}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, telefone: event.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="(00) 0000-0000"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-zinc-500">Celular</label>
                  <input
                    value={contactDraft.celular ?? ""}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, celular: event.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={Boolean(contactDraft.padrao)}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, padrao: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border border-zinc-300"
                />
                Definir como contato padrão
              </label>
              {contactModalError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {contactModalError}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeContactModal}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveContact}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {editingContactIndex === null ? "Adicionar contato" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
