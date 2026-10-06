"use client";

import { ArrowDownToLine, ArrowUpFromLine, Check, Smartphone } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import { BANKS, cashOutFee, type BankId } from "@/data/banks";
import { cashIn, cashOut, deposit, withdraw, type MoneyResult } from "@/game/systems/money";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer } from "@/stores/player";

const STEPS = [10_000, 50_000, 100_000];

/** Amount chips (10k, 50k, 100k and "all"), capped to what's available. */
export function AmountPicker({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {STEPS.map((v) => (
        <button
          key={v}
          type="button"
          disabled={v > max}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn("rounded-xl py-1.5 font-display text-sm font-extrabold tabular ring-1 transition-colors disabled:opacity-35", value === v ? "bg-cream text-night ring-cream" : "bg-white/6 text-cream ring-white/10")}
        >
          {v / 1000}k
        </button>
      ))}
      <button
        type="button"
        disabled={max <= 0}
        onClick={() => onChange(max)}
        aria-pressed={value === max && max > 0}
        className={cn("rounded-xl py-1.5 font-display text-sm font-extrabold ring-1 transition-colors disabled:opacity-35", value === max && max > 0 ? "bg-cream text-night ring-cream" : "bg-white/6 text-cream ring-white/10")}
      >
        {t.bank.all}
      </button>
    </div>
  );
}

/** Run a money move and flash a tick on success. */
const useMove = () => {
  const [done, setDone] = useState(0);
  const run = (fn: () => MoneyResult) => {
    if (fn().ok) setDone(performance.now());
  };
  return { done, run };
};

/** At a bank branch: your balance there, and deposit or withdraw cash. */
export function BankPanel({ bank, name }: { bank: BankId; name: string }) {
  const t = useT();
  const b = BANKS[bank];
  const cash = usePlayer((s) => s.wallet);
  const saved = usePlayer((s) => s.banks[bank] ?? 0);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState(0);
  const { done, run } = useMove();
  const max = mode === "deposit" ? cash : Math.max(0, saved - b.withdrawFee);
  const value = Math.min(amount, max);
  const ok = value > 0 && value <= max;

  return (
    <div className="pointer-events-auto flex w-72 flex-col gap-2.5 overflow-hidden rounded-2xl bg-night-800/95 p-3 shadow-xl ring-1 backdrop-blur" style={{ boxShadow: `inset 4px 0 0 ${b.color}`, borderColor: b.color }}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 min-w-12 place-items-center rounded-xl px-1.5 font-display text-xs font-extrabold tracking-tight" style={{ background: b.color, color: b.ink, boxShadow: `inset 0 -3px 0 ${b.accent}` }}>
          {b.short}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold">{name || b.name}</p>
          <p className="text-xs text-cream/55">{t.bank.branch}</p>
        </div>
        {done > 0 && <Check key={done} className="animate-pop-in ml-auto size-5 shrink-0 text-forest-400" />}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
          <p className="text-cream/55">{t.bank.account}</p>
          <p className="font-display text-base font-extrabold tabular">TSh {formatTzs(saved)}</p>
          <p className="text-[10px] text-forest-400">{fmt(t.bank.rate, { rate: b.rate })}</p>
        </div>
        <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
          <p className="text-cream/55">{t.bank.cash}</p>
          <p className="font-display text-base font-extrabold tabular">TSh {formatTzs(cash)}</p>
        </div>
      </div>
      <Segmented
        size="sm"
        label={t.bank.account}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setAmount(0);
        }}
        options={[
          { value: "deposit", label: t.bank.deposit, icon: <ArrowDownToLine /> },
          { value: "withdraw", label: t.bank.withdraw, icon: <ArrowUpFromLine /> },
        ]}
      />
      <AmountPicker value={value} max={max} onChange={setAmount} />
      <button
        type="button"
        disabled={!ok}
        onClick={() => {
          run(() => (mode === "deposit" ? deposit(bank, value) : withdraw(bank, value)));
          setAmount(0);
        }}
        className="chunky flex min-h-11 items-center justify-center gap-2 rounded-2xl font-display font-extrabold disabled:opacity-45"
        style={{ background: b.color, color: b.ink, ["--edge" as string]: b.accent }}
      >
        {!ok ? (max <= 0 ? t.bank.noFunds : t.bank[mode]) : fmt(mode === "deposit" ? t.bank.depositCta : t.bank.withdrawCta, { amount: formatTzs(value) })}
      </button>
      {mode === "withdraw" && <p className="-mt-1 text-center text-[11px] text-cream/50">{fmt(t.bank.fee, { fee: formatTzs(b.withdrawFee) })}</p>}
    </div>
  );
}

/** At a wakala (mobile-money agent): swap cash and BodaPesa. */
export function WakalaPanel({ name }: { name: string }) {
  const t = useT();
  const cash = usePlayer((s) => s.wallet);
  const bodapesa = usePlayer((s) => s.bodapesa);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState(0);
  const { done, run } = useMove();
  // The largest cash-out the balance covers, fee included.
  const maxOut = (() => {
    let v = bodapesa;
    while (v > 0 && v + cashOutFee(v) > bodapesa) v -= 500;
    return Math.max(0, v);
  })();
  const max = mode === "in" ? cash : maxOut;
  const value = Math.min(amount, max);
  const ok = value > 0;

  return (
    <div className="pointer-events-auto flex w-72 flex-col gap-2.5 rounded-2xl bg-night-800/95 p-3 shadow-xl ring-1 ring-forest-400/50 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-xl bg-forest text-sun">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display leading-tight font-extrabold">{name || t.bank.wakala}</p>
          <p className="text-xs text-cream/55">{t.bank.wakalaHint}</p>
        </div>
        {done > 0 && <Check key={done} className="animate-pop-in ml-auto size-5 shrink-0 text-forest-400" />}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
          <p className="text-cream/55">{t.bank.bodapesa}</p>
          <p className="font-display text-base font-extrabold tabular">TSh {formatTzs(bodapesa)}</p>
        </div>
        <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
          <p className="text-cream/55">{t.bank.cash}</p>
          <p className="font-display text-base font-extrabold tabular">TSh {formatTzs(cash)}</p>
        </div>
      </div>
      <Segmented
        size="sm"
        label={t.bank.wakala}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setAmount(0);
        }}
        options={[
          { value: "in", label: t.bank.cashIn, icon: <ArrowDownToLine /> },
          { value: "out", label: t.bank.cashOut, icon: <ArrowUpFromLine /> },
        ]}
      />
      <AmountPicker value={value} max={max} onChange={setAmount} />
      <button
        type="button"
        disabled={!ok}
        onClick={() => {
          run(() => (mode === "in" ? cashIn(value) : cashOut(value)));
          setAmount(0);
        }}
        className="chunky flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-forest font-display font-extrabold text-cream [--edge:var(--color-forest-800)] disabled:opacity-45"
      >
        {!ok ? (max <= 0 ? t.bank.noFunds : mode === "in" ? t.bank.cashIn : t.bank.cashOut) : `${mode === "in" ? t.bank.cashIn : t.bank.cashOut} · TSh ${formatTzs(value)}`}
      </button>
      {mode === "out" && value > 0 && <p className="-mt-1 text-center text-[11px] text-cream/50">{fmt(t.bank.fee, { fee: formatTzs(cashOutFee(value)) })}</p>}
    </div>
  );
}
