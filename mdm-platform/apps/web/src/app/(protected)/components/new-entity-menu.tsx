"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";

type NewEntityMenuProps = {
  className?: string;
};

type ActionOption = {
  label: string;
  description?: string;
  href: string;
};

export function NewEntityMenu({ className }: NewEntityMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo<ActionOption[]>(
    () => [
      {
        label: "Novo Parceiro",
        description: "Cadastrar um novo parceiro",
        href: "/partners/new"
      },
      {
        label: "Nova solicitação de mudança",
        description: "Criar alteração em parceiro existente",
        href: "/change-requests"
      },
      {
        label: "Nova auditoria",
        description: "Disparar fluxo de auditoria de parceiros",
        href: "/audit"
      }
    ],
    []
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleNavigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const containerClasses = [
    "relative",
    "inline-flex",
    "items-stretch",
    "overflow-hidden",
    "rounded-lg",
    "border",
    "border-zinc-200",
    "bg-white",
    "shadow-sm"
  ];

  if (className) {
    containerClasses.push(className);
  }

  return (
    <div ref={containerRef} className={containerClasses.join(" ")}>
      <button
        type="button"
        onClick={() => handleNavigate("/partners/new")}
        className="inline-flex items-center gap-2 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        <Plus size={16} />
        <span>Novo</span>
      </button>
      <button
        type="button"
        aria-label="Abrir opções de criação"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center justify-center bg-zinc-900 px-2 text-white transition hover:bg-zinc-800"
      >
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <ul className="flex flex-col py-2">
            {options.map((option) => (
              <li key={option.href}>
                <button
                  type="button"
                  onClick={() => handleNavigate(option.href)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition hover:bg-zinc-50"
                >
                  <span className="text-sm font-semibold text-zinc-900">{option.label}</span>
                  {option.description ? (
                    <span className="text-xs text-zinc-500">{option.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default NewEntityMenu;
