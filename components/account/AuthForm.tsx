"use client";

import { AlertCircle, KeyRound, LogIn, UserPlus } from "lucide-react";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Segmented } from "@/components/ui";
import { CITIES, CITY_ORDER } from "@/data/cities/config";
import { useT } from "@/i18n";
import { useAccount, type AccountError } from "@/lib/account";
import { cn } from "@/lib/cn";

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-sm font-bold text-cream/80">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-cream/50">{hint}</p>}
    </div>
  );
}

const INPUT = "h-13 w-full rounded-2xl bg-night-600 px-4 font-display text-lg font-bold ring-1 ring-white/10 outline-none select-text placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-cream/35 focus:ring-2 focus:ring-sun";

/** A PIN box: digits only, masked, with the dots showing how many are typed. */
export function PinInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <div className="relative">
      <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-cream/40" />
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        pattern="\d{4,6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={cn(INPUT, "pl-12 tracking-[0.5em] tabular")}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 flex -translate-y-1/2 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={cn("size-1.5 rounded-full transition-colors", i < value.length ? "bg-sun" : i < 4 ? "bg-cream/25" : "bg-cream/10")} />
        ))}
      </span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-coral/15 px-3 py-2.5 text-sm font-semibold text-coral ring-1 ring-coral/30">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

/** City chips for the rider's home city. */
export function CityPicker({ value, onChange, label }: { value: string; onChange: (city: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {CITY_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("rounded-full px-3.5 py-1.5 font-display text-sm font-bold ring-1 transition-colors", value === id ? "bg-sun text-night ring-sun" : "bg-night-600 text-cream/75 ring-white/10 hover:bg-night-500")}
        >
          {CITIES[id].name}
        </button>
      ))}
    </div>
  );
}

const noop = () => () => {};

/** Register or sign in (sign in first when the page was opened at #ingia). `onDone` runs after success. */
export function AuthForm({ defaultCity, onDone }: { defaultCity: string; onDone?: () => void }) {
  const t = useT();
  const register = useAccount((s) => s.register);
  const login = useAccount((s) => s.login);
  const signInLink = useSyncExternalStore(noop, () => window.location.hash === "#ingia", () => false);
  const [chosen, setMode] = useState<"register" | "login" | null>(null);
  const mode = chosen ?? (signInLink ? "login" : "register");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (mode === "register" && pin !== pin2) return setError(t.account.pinMismatch);
    setBusy(true);
    const out = mode === "register" ? await register(name, pin, city) : await login(name, pin);
    setBusy(false);
    // A new account's first backup can fail without failing the registration.
    if (out.ok || (mode === "register" && useAccount.getState().account)) return onDone?.();
    setError(t.account.errors[out.error as AccountError] ?? t.account.errors.bad);
  };

  const ready = name.trim().length >= 3 && pin.length >= 4 && (mode === "login" || pin2.length >= 4);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void submit();
      }}
    >
      <Segmented
        label={t.account.title}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: "register", label: t.account.register, icon: <UserPlus /> },
          { value: "login", label: t.account.login, icon: <LogIn /> },
        ]}
      />
      <Field label={t.account.name} hint={mode === "register" ? t.account.nameHint : undefined}>
        {(id) => (
          <input
            id={id}
            value={name}
            maxLength={16}
            autoComplete="username"
            autoCapitalize="words"
            placeholder={t.account.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        )}
      </Field>
      <Field label={t.account.pin} hint={mode === "register" ? t.account.pinHint : undefined}>
        {(id) => <PinInput id={id} value={pin} onChange={setPin} autoComplete={mode === "register" ? "new-password" : "current-password"} />}
      </Field>
      {mode === "register" && (
        <>
          <Field label={t.account.pinAgain}>{(id) => <PinInput id={id} value={pin2} onChange={setPin2} autoComplete="new-password" />}</Field>
          <div className="flex flex-col gap-1.5">
            <p className="font-display text-sm font-bold text-cream/80">{t.account.city}</p>
            <CityPicker value={city} onChange={setCity} label={t.account.city} />
          </div>
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="sun" size="lg" block disabled={!ready || busy} icon={mode === "register" ? <UserPlus /> : <LogIn />}>
        {busy ? t.common.loading : mode === "register" ? t.account.createCta : t.account.loginCta}
      </Button>
    </form>
  );
}
