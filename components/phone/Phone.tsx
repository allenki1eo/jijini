"use client";

import { AnimatePresence, m } from "motion/react";
import { BatteryMedium, Briefcase, HandCoins, IdCard, Megaphone, MessageSquare, PackageCheck, Phone as PhoneIcon, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Signal, Smartphone, Star, Wallet, X } from "lucide-react";
import { useEffect } from "react";
import { MISSION_ACCENT, MissionIcon } from "@/components/missions/MissionIcon";
import { formatDistance } from "@/components/missions/stopLabel";
import { IconButton } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import { clockText } from "@/game/systems/environment";
import { fmt, formatTzs, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePhone, type PhoneTab } from "@/stores/phone";
import { usePlayer } from "@/stores/player";
import { useHudTick } from "@/components/hud/useHudTick";

const AVATAR_COLORS = ["bg-sun text-night", "bg-coral text-cream", "bg-sky text-night", "bg-forest text-sun", "bg-[#7C3AED] text-cream", "bg-sun-600 text-night", "bg-forest-400 text-night"];

/** A round initials avatar with a color that stays the same for each name. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/);
  const initials = (parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full font-display font-extrabold", AVATAR_COLORS[h % AVATAR_COLORS.length], className)}>
      {initials}
    </span>
  );
}

/** The HUD's phone button, with an unread badge and a shake while it rings. */
export function PhoneButton() {
  const t = useT();
  const unread = usePhone((s) => s.messages.filter((msg) => !msg.read).length);
  const ringing = usePhone((s) => s.call !== null);
  const open = usePhone((s) => s.open);
  const set = usePhone((s) => s.set);
  return (
    <div className="relative">
      <IconButton label={t.phone.open} icon={<Smartphone />} active={open} className={cn(ringing && "animate-phone-shake")} onClick={() => set({ open: !open })} />
      {unread > 0 && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 font-display text-xs font-extrabold text-cream ring-2 ring-night">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </div>
  );
}

/** Incoming call: who's calling, what the job is, answer or decline (Y / N). */
export function IncomingCall({ game }: { game: Game }) {
  const t = useT();
  const call = usePhone((s) => s.call);

  useEffect(() => {
    if (!call) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyY") game.phone?.accept();
      if (e.code === "KeyN") game.phone?.decline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [call, game]);

  return (
    <AnimatePresence>
      {call && (
        <m.div
          role="alertdialog"
          aria-label={`${call.caller} · ${t.phone.incoming}`}
          className="pointer-events-auto w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[1.6rem] bg-night-800/95 shadow-2xl ring-1 ring-white/12 backdrop-blur"
          initial={{ opacity: 0, y: -30, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.96, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 460, damping: 30 }}
        >
          <div className="flex items-center gap-3 p-3 pb-2">
            <span className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-forest/50" />
              <Avatar name={call.caller} className="relative size-12 text-lg" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-forest-400">
                <PhoneIncoming className="size-3.5" /> {t.phone.incoming}
                {call.regular && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-sun/15 px-1.5 py-0.5 text-sun">
                    <Star className="size-3 fill-sun" /> {t.phone.regularTag}
                  </span>
                )}
              </p>
              <p className="truncate font-display text-xl leading-tight font-extrabold">{call.caller}</p>
            </div>
            <div className={cn("flex items-center gap-1.5 rounded-xl px-2 py-1", MISSION_ACCENT[call.offer.type])}>
              <MissionIcon type={call.offer.type} className="size-4" />
              <span className="font-display text-sm font-extrabold tabular">{formatTzs(call.offer.fare)}</span>
            </div>
          </div>
          <p className="mx-3 rounded-2xl rounded-tl-sm bg-night-600 px-3 py-2 text-sm leading-snug text-cream/90">“{call.text}”</p>
          <p className="mx-3 mt-1.5 text-xs text-cream/50">
            {t.missions.types[call.offer.type]} · {formatDistance(call.offer.distance)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 p-3 pt-1">
            <button
              type="button"
              onClick={() => game.phone?.decline()}
              className="chunky flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-coral font-display font-extrabold text-cream [--edge:var(--color-coral-700)]"
            >
              <PhoneOff className="size-5" /> {t.phone.decline}
            </button>
            <button
              type="button"
              onClick={() => game.phone?.accept()}
              className="chunky flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-forest font-display font-extrabold text-cream [--edge:var(--color-forest-800)]"
            >
              <PhoneIcon className="size-5" /> {t.phone.accept}
            </button>
          </div>
          <div className="h-1 bg-night-600">
            <m.div className="h-full bg-forest-400" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: call.ringsLeft, ease: "linear" }} />
          </div>
          <p className="hidden pb-2 text-center text-[11px] text-cream/40 pointer-fine:block">{t.phone.keys}</p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

const TABS: { id: PhoneTab; icon: typeof MessageSquare }[] = [
  { id: "messages", icon: MessageSquare },
  { id: "calls", icon: PhoneIcon },
  { id: "pesa", icon: Wallet },
  { id: "hustles", icon: Briefcase },
];

const HUSTLES = [
  { type: "delivery" as const, icon: PackageCheck, accent: "bg-sky-700 text-cream" },
  { type: "matangazo" as const, icon: Megaphone, accent: "bg-[#6A1B9A] text-sun" },
];

/** The boda phone: messages, calls and regulars, and the mobile-money wallet. */
export function PhonePanel({ game }: { game: Game }) {
  const t = useT();
  useHudTick(1);
  const { open, tab, messages, calls, set, markRead } = usePhone();
  const wallet = usePlayer((s) => s.wallet);
  const regulars = usePlayer((s) => s.regulars);
  const owed = usePlayer((s) => s.hesabuOwed);
  const licenceDays = Math.ceil(game.licenceHours / 24);

  useEffect(() => {
    if (open) markRead();
  }, [open, tab, messages.length, markRead]);

  const sms = messages.filter((msg) => msg.kind === "sms");
  const pesa = messages.filter((msg) => msg.kind === "pesa");
  const people = Object.entries(regulars).sort((a, b) => b[1] - a[1]);

  return (
    <AnimatePresence>
      {open && (
        <m.aside
          aria-label={t.phone.open}
          className="pointer-events-auto absolute right-3 bottom-3 z-30 flex h-[max(20rem,min(30rem,calc(100dvh-16rem)))] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[2.4rem] bg-night p-2 shadow-2xl ring-2 ring-night-500 short:h-[calc(100dvh-1.5rem)]"
          initial={{ y: 60, opacity: 0, rotate: 2 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 60, opacity: 0, rotate: 2 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-[1.9rem] bg-night-800">
            {/* Status bar */}
            <div className="relative flex items-center justify-between px-5 pt-2 pb-1 text-[11px] font-semibold text-cream/70">
              <span className="tabular">{clockText()}</span>
              <span className="absolute left-1/2 top-1.5 h-4 w-16 -translate-x-1/2 rounded-full bg-night" />
              <span className="flex items-center gap-1">
                <Signal className="size-3" /> <BatteryMedium className="size-3.5" />
              </span>
            </div>
            <header className="flex items-center gap-2 px-4 pt-1 pb-2">
              <h2 className="flex-1 font-display text-xl font-extrabold">{t.phone.tabs[tab]}</h2>
              <button type="button" onClick={() => set({ open: false })} aria-label={t.common.close} className="grid size-9 place-items-center rounded-full bg-night-600 text-cream/80">
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {tab === "messages" &&
                (sms.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-cream/50">{t.phone.empty}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {sms.map((msg) => (
                      <li key={msg.id} className="flex gap-2">
                        <Avatar name={msg.from} className="size-8 text-xs" />
                        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-night-600 px-3 py-2">
                          <p className="flex justify-between gap-2 text-xs">
                            <span className="truncate font-bold text-sun">{msg.from}</span>
                            <span className="text-cream/40 tabular">{msg.at}</span>
                          </p>
                          <p className="text-sm leading-snug text-cream/90">{msg.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === "calls" && (
                <div className="flex flex-col gap-3">
                  <section>
                    <h3 className="px-1 pb-1 text-xs font-bold tracking-wide text-cream/50 uppercase">{t.phone.regulars}</h3>
                    {people.length === 0 ? (
                      <p className="rounded-2xl bg-night-700 px-3 py-3 text-sm text-cream/60">
                        {t.phone.noRegulars} {t.phone.regularsHint}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {people.map(([name, rides]) => (
                          <li key={name} className="flex items-center gap-2 rounded-2xl bg-night-700 p-2">
                            <Avatar name={name} className="size-9 text-sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{name}</p>
                              <p className="text-xs text-cream/50">{fmt(t.phone.rides, { n: rides })}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const r = game.phone?.callRegular(name);
                                if (r === "busy") game.toast(t.phone.busy);
                                if (r === "ringing") set({ open: false });
                              }}
                              className="chunky flex items-center gap-1.5 rounded-xl bg-forest px-3 py-2 font-display text-sm font-extrabold text-cream [--edge:var(--color-forest-800)]"
                            >
                              <PhoneOutgoing className="size-4" /> {t.phone.call}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="px-1 pb-1 text-xs font-bold tracking-wide text-cream/50 uppercase">{t.phone.tabs.calls}</h3>
                    {calls.length === 0 ? (
                      <p className="px-1 text-sm text-cream/50">{t.phone.noCalls}</p>
                    ) : (
                      <ul className="divide-y divide-white/6">
                        {calls.map((c) => {
                          const Icon = c.outcome === "missed" ? PhoneMissed : c.outcome === "outgoing" ? PhoneOutgoing : c.outcome === "declined" ? PhoneOff : PhoneIncoming;
                          return (
                            <li key={c.id} className="flex items-center gap-2 px-1 py-2 text-sm">
                              <Icon className={cn("size-4", c.outcome === "missed" || c.outcome === "declined" ? "text-coral" : "text-forest-400")} />
                              <span className="flex-1 truncate font-semibold">{c.who}</span>
                              <span className="text-xs text-cream/50">{t.phone[c.outcome]}</span>
                              <span className="w-10 text-right text-xs text-cream/40 tabular">{c.at}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              )}

              {tab === "hustles" && (
                <div className="flex flex-col gap-2">
                  <p className="px-1 text-sm text-cream/60">{t.phone.hustles.intro}</p>
                  {HUSTLES.map(({ type, icon: Icon, accent }) => (
                    <div key={type} className="overflow-hidden rounded-2xl bg-night-700">
                      <div className={cn("flex items-center gap-2 px-3 py-2", accent)}>
                        <Icon className="size-5" />
                        <span className="font-display font-extrabold">{t.missions.types[type]}</span>
                      </div>
                      <div className="flex items-end gap-2 p-3">
                        <p className="flex-1 text-sm leading-snug text-cream/75">{t.phone.hustles[type]}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const r = game.startHustle(type);
                            if (r === "busy") game.toast(t.phone.busy);
                            else if (r === "none") game.toast(t.phone.hustles.none);
                            else set({ open: false });
                          }}
                          className="chunky shrink-0 rounded-xl bg-sun px-3 py-2 font-display text-sm font-extrabold text-night [--edge:var(--color-sun-800)]"
                        >
                          {t.phone.hustles.start}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "pesa" && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-3xl bg-gradient-to-br from-forest to-forest-800 p-4 text-cream shadow-lg">
                    <p className="text-xs font-semibold tracking-wide uppercase opacity-75">{t.phone.pesaName}</p>
                    <p className="mt-2 text-xs opacity-75">{t.phone.balance}</p>
                    <p className="font-display text-3xl leading-none font-extrabold tabular">TSh {formatTzs(wallet)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-night-700 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-cream/60">
                        <IdCard className="size-4" /> {t.hesabu.licence}
                      </p>
                      <p className={cn("mt-1 font-display text-lg leading-tight font-extrabold", licenceDays <= 0 ? "text-coral" : licenceDays <= 2 ? "text-sun" : "text-cream")}>
                        {licenceDays <= 0 ? t.hesabu.licenceExpired.split("!")[0] : fmt(t.hesabu.licenceLeft, { days: licenceDays })}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-night-700 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-cream/60">
                        <HandCoins className="size-4" /> {t.hesabu.today}
                      </p>
                      <p className="mt-1 font-display text-lg leading-tight font-extrabold tabular">{game.onLoanBike ? `${formatTzs(game.hesabu)} · 20:00` : "—"}</p>
                    </div>
                  </div>
                  {game.onLoanBike ? (
                    <p className="px-1 text-xs leading-snug text-cream/55">{t.hesabu.owner}</p>
                  ) : (
                    <p className="px-1 text-xs text-cream/55">{t.hesabu.none}</p>
                  )}
                  {owed > 0 && (
                    <div className="flex items-center gap-2 rounded-2xl bg-coral/15 p-2 pl-3">
                      <span className="flex-1 text-sm font-semibold text-coral">
                        {t.hesabu.owed}: TSh {formatTzs(owed)}
                      </span>
                      <button
                        type="button"
                        disabled={wallet < owed}
                        onClick={() => game.payHesabuDebt()}
                        className="chunky rounded-xl bg-sun px-3 py-2 font-display text-sm font-extrabold text-night [--edge:var(--color-sun-800)] disabled:opacity-50"
                      >
                        {t.hesabu.pay}
                      </button>
                    </div>
                  )}
                  {licenceDays <= 0 && <p className="px-1 text-xs text-coral">{t.hesabu.renewHint}</p>}
                  <ul className="flex flex-col gap-1.5">
                    {pesa.map((msg) => (
                      <li key={msg.id} className="flex items-center gap-2 rounded-2xl bg-night-700 px-3 py-2">
                        <span className={cn("font-display text-sm font-extrabold tabular", (msg.amount ?? 0) >= 0 ? "text-forest-400" : "text-coral")}>
                          {(msg.amount ?? 0) >= 0 ? "+" : "−"}
                          {formatTzs(Math.abs(msg.amount ?? 0))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-cream/70">{msg.text}</span>
                        <span className="text-[11px] text-cream/40 tabular">{msg.at}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <nav className="grid grid-cols-4 gap-1 border-t border-white/8 p-2" aria-label={t.phone.open}>
              {TABS.map(({ id, icon: Icon }) => {
                const unread = messages.some((msg) => !msg.read && (id === "pesa" ? msg.kind === "pesa" : id === "messages" && msg.kind === "sms"));
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tab === id}
                    onClick={() => set({ tab: id })}
                    className={cn("relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-bold", tab === id ? "bg-sun text-night" : "text-cream/60 hover:bg-white/6")}
                  >
                    <Icon className="size-5" />
                    {t.phone.tabs[id]}
                    {unread && tab !== id && <span className="absolute top-1 right-[30%] size-2 rounded-full bg-coral" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  );
}
