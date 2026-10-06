"use client";

import { ArrowDownToLine, ArrowUpFromLine, Banknote, Check, Landmark, Wallet } from "lucide-react";
import { useState } from "react";
import { AmountPicker } from "@/components/missions/BankPanel";
import { BANK_IDS, BANKS, type BankId } from "@/data/banks";
import { fromBank, toBank } from "@/game/systems/money";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayer } from "@/stores/player";

/**
 * The BodaPesa app's money screen: the wallet balance, cash in the pocket,
 * savings at each bank, and moving money between BodaPesa and the banks
 * (fees shown). Cash itself only changes hands at a wakala or a bank.
 */
export function BodaPesaApp() {
  const t = useT();
  const bodapesa = usePlayer((s) => s.bodapesa);
  const cash = usePlayer((s) => s.wallet);
  const banks = usePlayer((s) => s.banks);
  const savings = Object.values(banks).reduce((a, b) => a + (b ?? 0), 0);
  const withMoney = BANK_IDS.filter((id) => (banks[id] ?? 0) > 0);
  const [bank, setBank] = useState<BankId>(withMoney[0] ?? "crdb");
  const [mode, setMode] = useState<"to" | "from">("to");
  const [amount, setAmount] = useState(0);
  const [done, setDone] = useState(0);
  const b = BANKS[bank];
  const max = mode === "to" ? Math.max(0, bodapesa - b.transferFee) : Math.max(0, (banks[bank] ?? 0) - b.transferFee);
  const value = Math.min(amount, max);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-forest to-forest-800 p-4 text-cream shadow-lg">
        <span className="absolute -top-8 -right-8 size-32 rounded-full bg-sun/15" aria-hidden="true" />
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase opacity-80">
          <Wallet className="size-3.5" /> {t.phone.pesaName}
        </p>
        <p className="mt-2 text-xs opacity-75">{t.phone.balance}</p>
        <p className="font-display text-3xl leading-none font-extrabold tabular">TSh {formatTzs(bodapesa)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-xl bg-black/15 px-2 py-1.5">
            <Banknote className="size-3.5 text-sun" />
            <span className="opacity-80">{t.bank.cash}</span>
            <b className="ml-auto font-display tabular">{formatTzs(cash)}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-xl bg-black/15 px-2 py-1.5">
            <Landmark className="size-3.5 text-sun" />
            <span className="opacity-80">{t.bank.banks}</span>
            <b className="ml-auto font-display tabular">{formatTzs(savings)}</b>
          </span>
        </div>
      </div>

      {withMoney.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {withMoney.map((id) => (
            <li key={id} className="flex items-center gap-2 rounded-2xl bg-night-700 px-2.5 py-2">
              <span className="grid h-7 min-w-10 place-items-center rounded-lg px-1 font-display text-[10px] font-extrabold" style={{ background: BANKS[id].color, color: BANKS[id].ink }}>
                {BANKS[id].short}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{BANKS[id].name}</span>
                <span className="block text-[11px] text-forest-400">{fmt(t.bank.rate, { rate: BANKS[id].rate })}</span>
              </span>
              <b className="font-display text-sm tabular">{formatTzs(banks[id] ?? 0)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-night-700 px-3 py-2 text-xs text-cream/60">{t.bank.noAccount}</p>
      )}

      {/* Move money between BodaPesa and a bank. */}
      <div className="flex flex-col gap-2 rounded-2xl bg-night-700 p-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {BANK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setBank(id);
                setAmount(0);
              }}
              aria-pressed={bank === id}
              className={cn("shrink-0 rounded-lg px-2 py-1 font-display text-[11px] font-extrabold ring-2 transition-opacity", bank === id ? "opacity-100" : "opacity-55")}
              style={{ background: BANKS[id].color, color: BANKS[id].ink, ["--tw-ring-color" as string]: bank === id ? BANKS[id].accent : "transparent" }}
            >
              {BANKS[id].short}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(["to", "from"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setAmount(0);
              }}
              aria-pressed={mode === m}
              className={cn("flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold", mode === m ? "bg-sun text-night" : "bg-white/6 text-cream/70")}
            >
              {m === "to" ? <ArrowUpFromLine className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />}
              {m === "to" ? t.bank.toBank : t.bank.fromBank}
            </button>
          ))}
        </div>
        <AmountPicker value={value} max={max} onChange={setAmount} />
        <button
          type="button"
          disabled={value <= 0}
          onClick={() => {
            if ((mode === "to" ? toBank(bank, value) : fromBank(bank, value)).ok) setDone(performance.now());
            setAmount(0);
          }}
          className="chunky flex min-h-10 items-center justify-center gap-2 rounded-xl font-display text-sm font-extrabold disabled:opacity-45"
          style={{ background: b.color, color: b.ink, ["--edge" as string]: b.accent }}
        >
          {done > 0 && <Check key={done} className="animate-pop-in size-4" />}
          {value > 0 ? `${mode === "to" ? t.bank.toBank : t.bank.fromBank} · TSh ${formatTzs(value)}` : max <= 0 ? t.bank.noFunds : `${b.short} · ${mode === "to" ? t.bank.toBank : t.bank.fromBank}`}
        </button>
        <p className="text-center text-[11px] text-cream/45">
          {fmt(t.bank.fee, { fee: formatTzs(b.transferFee) })} · {t.bank.appHint}
        </p>
      </div>
    </div>
  );
}
