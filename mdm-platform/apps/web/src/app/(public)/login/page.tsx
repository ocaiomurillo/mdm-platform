"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRouter } from "next/navigation";
import { storeUser } from "../../../lib/auth";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres")
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (values: FormValues) => {
    if (!siteKey) {
      setError("Turnstile não configurado no ambiente.");
      return;
    }
    if (!turnstileToken) {
      setError("Confirme que você não é um robô antes de continuar.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        email: values.email,
        password: values.password,
        turnstileToken
      });
      localStorage.setItem("mdmToken", response.data.accessToken);
      if (response.data?.user) {
        storeUser(response.data.user);
      }
      router.push("/dashboard");
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(typeof message === "string" ? message : "Não foi possível autenticar.");
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      storeUser(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid place-items-center min-h-screen bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-4 text-xl font-semibold">Entrar</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <input
              {...register("email")}
              type="email"
              placeholder="Email"
              className="w-full rounded border px-3 py-2"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <input
              {...register("password")}
              type="password"
              placeholder="Senha"
              className="w-full rounded border px-3 py-2"
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
          </div>
          {siteKey ? (
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={setTurnstileToken}
              onExpire={() => {
                turnstileRef.current?.reset();
                setTurnstileToken(null);
              }}
              onError={() => {
                turnstileRef.current?.reset();
                setTurnstileToken(null);
              }}
              className="flex justify-center"
            />
          ) : (
            <p className="text-sm text-amber-600">Configure o NEXT_PUBLIC_TURNSTILE_SITE_KEY para habilitar o Turnstile.</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-black px-3 py-2 font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}