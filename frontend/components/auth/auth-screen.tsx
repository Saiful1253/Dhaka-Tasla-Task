"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Route,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { RickshawIcon } from "@/components/rickshaw-icon";
import { Button } from "@/components/ui/button";
import { Field, inputClassName } from "@/components/ui/field";
import { NoticeBanner } from "@/components/ui/feedback";
import { apiFetch, getErrorCode } from "@/lib/api/client";
import type { AuthSession, Role } from "@/lib/api/types";
import { useAuth } from "@/providers/auth-provider";

type AuthMode = "login" | "signup";

interface DemoAccount {
  name: string;
  email: string;
  role: "Passenger" | "Driver";
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: "Jashim", email: "jashim@dhakatesla.bd", role: "Driver" },
  { name: "Nusrat", email: "nusrat@dhakatesla.bd", role: "Passenger" },
  { name: "Rafiq", email: "rafiq@dhakatesla.bd", role: "Passenger" },
  { name: "Shirin", email: "shirin@dhakatesla.bd", role: "Passenger" },
];

const DEMO_PASSWORD = "tesla123";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

export function AuthScreen() {
  const router = useRouter();
  const { session, hydrated, sessionNotice, signIn, clearSessionNotice } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("passenger");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!hydrated || !session) return;
    router.replace(session.user.role === "driver" ? "/driver" : "/passenger");
  }, [hydrated, router, session]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFormError(null);
    setFieldErrors({});
    setShowPassword(false);
  }

  function fillDemo(account: DemoAccount) {
    setMode("login");
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setName("");
    setFormError(null);
    setFieldErrors({});
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (mode === "signup" && name.trim().length === 0) {
      errors.name = "Enter your name so the driver can recognize you.";
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const result = await apiFetch<AuthSession>(path, {
        method: "POST",
        body:
          mode === "login"
            ? { email: email.trim().toLowerCase(), password }
            : {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                role,
              },
      });
      signIn(result);
      router.replace(result.user.role === "driver" ? "/driver" : "/passenger");
    } catch (error) {
      setFormError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated || session) {
    return (
      <main className="dispatch-grid flex min-h-screen items-center justify-center px-4 text-porcelain">
        <div className="text-center" role="status" aria-label="Loading your account">
          <BrandMark inverse className="justify-center" />
          <LoaderCircle aria-hidden="true" className="mx-auto mt-7 h-5 w-5 animate-spin text-lime" />
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.19em] text-cyan/60">
            Opening the dispatch board
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper xl:grid xl:grid-cols-[minmax(0,1.12fr)_minmax(460px,0.88fr)]">
      <section className="dispatch-grid relative flex min-h-[520px] flex-col overflow-hidden px-5 py-5 text-porcelain sm:px-8 sm:py-8 lg:px-12 xl:min-h-screen xl:py-10">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <BrandMark inverse />
          <span className="hidden items-center gap-2 border border-cyan/20 bg-cyan/5 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-lime" />
            Pool-ready mobility
          </span>
        </div>

        <RickshawIcon
          tone="outline"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-10 left-1/2 hidden h-auto w-[420px] -translate-x-1/2 text-porcelain/[0.04] xl:block"
        />

        <div className="relative z-10 my-auto grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center lg:py-16">
          <div className="max-w-2xl animate-reveal">
            <p className="dark-eyebrow">North Dhaka · shared seats · clear fares</p>
            <h1 className="mt-5 max-w-[720px] font-display text-5xl font-bold leading-[0.88] tracking-[-0.07em] text-porcelain sm:text-6xl lg:text-7xl xl:text-8xl 2xl:text-[6.6rem]">
              Share a seat.
              <span className="mt-1 block text-lime">Split the fare.</span>
              <span className="mt-1 block text-cyan">Survive traffic.</span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-porcelain/65 sm:text-lg">
              One calm place to request a pooled ride, follow every status change, and know your fare before the trip moves.
            </p>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-porcelain/10 pt-5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan/60">
              <span className="flex items-center gap-2">
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-lime" /> Live estimates
              </span>
              <span className="flex items-center gap-2">
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-lime" /> Owned rides only
              </span>
              <span className="flex items-center gap-2">
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-lime" /> Clear capacity
              </span>
            </div>
          </div>

          <div className="auth-crosshair relative hidden border border-cyan/15 bg-ink/45 p-5 lg:block">
            <div className="flex items-center justify-between border-b border-porcelain/10 pb-3">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-cyan/60">
                Route signal
              </span>
              <Route aria-hidden="true" className="h-4 w-4 text-lime" />
            </div>
            <div className="mt-5 flex items-start gap-3">
              <span className="mt-1 h-3 w-3 rounded-full border-2 border-porcelain bg-ink" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan/65">
                  Pickup
                </p>
                <p className="mt-1 font-display text-3xl font-bold tracking-[-0.06em]">
                  Your area
                </p>
              </div>
            </div>
            <div className="ml-[5px] h-16 w-px bg-[repeating-linear-gradient(to_bottom,rgba(85,221,224,.65)_0,rgba(85,221,224,.65)_6px,transparent_6px,transparent_12px)]" />
            <div className="flex items-start gap-3">
              <span className="mt-1 h-3 w-3 rounded-full border-2 border-porcelain bg-lime" />
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-lime/60">
                  Drop-off
                </p>
                <p className="mt-1 font-display text-3xl font-bold tracking-[-0.06em]">
                  Their area
                </p>
              </div>
            </div>
            <div className="mt-7 border-t border-dashed border-porcelain/15 pt-4">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em]">
                <span className="text-cyan/65">Your share</span>
                <span className="text-lime">Whole Taka</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Three rickshaw seats">
                <span className="h-2 bg-lime" />
                <span className="h-2 border border-cyan/35 bg-cyan/5" />
                <span className="h-2 border border-cyan/35 bg-cyan/5" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-porcelain/10 pt-4 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-cyan/65">
          <span>Dhaka route pooling MVP</span>
          <span className="flex items-center gap-2">
            <Zap aria-hidden="true" className="h-3 w-3 text-lime" /> Faster together
          </span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden border-l border-ink/10 px-4 py-10 sm:px-8 xl:px-12">
        <div className="absolute inset-y-0 right-0 w-16 border-l border-ink/5 bg-ink/[0.025]" />
        <div className="relative w-full max-w-[520px]">
          <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink/65">
              Passenger + driver access
            </p>
            <span className="h-2 w-2 bg-lime ring-1 ring-ink/15" />
          </div>

          <div className="section-panel paper-grid p-5 sm:p-7 lg:p-8">
            <div>
              <p className="eyebrow">Route access</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.055em] text-ink sm:text-4xl">
                {mode === "login" ? "Welcome back." : "Create your seat."}
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                {mode === "login"
                  ? "Sign in to follow your ride or dispatch your rickshaw."
                  : "Choose how you will move through Dhaka today."}
              </p>
            </div>

            {sessionNotice ? (
              <NoticeBanner
                tone="warning"
                title="Session ended"
                message={sessionNotice}
                onDismiss={clearSessionNotice}
                className="mt-5"
              />
            ) : null}

            <div
              className="mt-6 grid grid-cols-2 border border-ink/15 bg-paper p-1"
              role="tablist"
              aria-label="Authentication mode"
            >
              {(["login", "signup"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={mode === item}
                  onClick={() => switchMode(item)}
                  className={`min-h-11 px-4 font-display text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                    mode === item
                      ? "bg-ink text-porcelain shadow-sm"
                      : "text-ink/65 hover:bg-porcelain hover:text-ink"
                  }`}
                >
                  {item === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            {formError ? (
              <NoticeBanner
                tone="error"
                title={mode === "login" ? "Could not sign in" : "Could not create account"}
                code={getErrorCode(formError)}
                message={
                  formError instanceof Error
                    ? formError.message
                    : "An unexpected error occurred. Please try again."
                }
                className="mt-5"
                onDismiss={() => setFormError(null)}
              />
            ) : null}

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              {mode === "signup" ? (
                <Field id="name" label="Your name" required error={fieldErrors.name}>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Nusrat"
                    className={inputClassName}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "name-error" : undefined}
                  />
                </Field>
              ) : null}

              <Field
                id="email"
                label="Email address"
                required
                error={fieldErrors.email}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className={inputClassName}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                />
              </Field>

              <Field
                id="password"
                label="Password"
                required
                error={fieldErrors.password}
                hint={mode === "signup" ? "6+ characters" : undefined}
              >
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className={`${inputClassName} pr-12`}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-ink/65 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Eye aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </Field>

              {mode === "signup" ? (
                <fieldset>
                  <legend className="font-display text-xs font-bold uppercase tracking-[0.13em] text-ink">
                    I am joining as
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "passenger", label: "Passenger", icon: "passenger" },
                        { value: "driver", label: "Driver", icon: "rickshaw" },
                      ] as const
                    ).map(({ value, label, icon }) => (
                      <label
                        key={value}
                        className={`relative flex min-h-[74px] cursor-pointer items-center gap-3 border p-3 transition focus-within:ring-2 focus-within:ring-cyan ${
                          role === value
                            ? "border-ink bg-ink text-porcelain"
                            : "border-ink/15 bg-porcelain text-ink hover:border-ink/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={value}
                          checked={role === value}
                          onChange={() => setRole(value)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center ${
                            role === value ? "bg-lime text-ink" : "bg-paper text-ink"
                          }`}
                        >
                          {icon === "passenger" ? (
                            <UserRound aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <RickshawIcon
                              size={20}
                              tone={role === value ? "inverse" : "brand"}
                              className="h-5 w-5"
                            />
                          )}
                        </span>
                        <span>
                          <span className="block font-display text-sm font-bold">{label}</span>
                          <span
                            className={`mt-0.5 block font-mono text-[8px] uppercase tracking-[0.12em] ${
                              role === value ? "text-cyan/70" : "text-ink/65"
                            }`}
                          >
                            {value === "passenger" ? "Request a seat" : "Dispatch your rickshaw"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full"
                trailingIcon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              >
                {mode === "login" ? "Open my dashboard" : "Create account"}
              </Button>
            </form>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-ink/10" />
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-ink/65">
                Quick-fill demo accounts
              </p>
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemo(account)}
                  className="group flex min-h-14 items-center justify-between gap-2 border border-ink/10 bg-porcelain/70 px-3 py-2 text-left transition hover:border-ink/30 hover:bg-porcelain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-xs font-bold text-ink">
                      {account.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-[0.11em] text-ink/65">
                      {account.role}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-ink"
                  />
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 border border-amber/40 bg-amber/10 px-3 py-2.5 text-center">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6D470C]" />
              <p className="font-mono text-[9px] font-medium leading-4 text-[#63410C]">
                Demo password: <span className="font-semibold">{DEMO_PASSWORD}</span> · use a quick-fill account
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
