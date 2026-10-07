"use client";

import { Check, Cloud, CloudDownload, CloudUpload, KeyRound, LogOut, MapPin, Smartphone, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthForm, CityPicker, ErrorNote, Field, PinInput } from "@/components/account/AuthForm";
import { RiderAvatar, TierBadge } from "@/components/account/RiderBadge";
import { KitengeStrip } from "@/components/brand/Kitenge";
import { Button, Card } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { CITIES, isCityId } from "@/data/cities/config";
import { NATIONAL } from "@/data/league";
import { fmt, formatTzs, useT } from "@/i18n";
import { useAccount, type AccountError } from "@/lib/account";
import { cn } from "@/lib/cn";
import { fetchBoard } from "@/lib/leaderboard";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { ScreenHeader } from "./ScreenHeader";

/** "5 minutes ago" in the rider's language. */
const ago = (ms: number, locale: string) => {
  const s = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(s) < 60) return rtf.format(s, "second");
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
};

/** Where to go after signing in (`?next=/ligi`), only ever a path on this site. */
const nextPath = () => {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && /^\/[a-z]*$/.test(next) ? next : null;
};

/**
 * Akaunti: register or sign in (name + PIN), then the rider's profile, the
 * online backup, home city, PIN and sign-out.
 */
export function AccountScreen() {
  const t = useT();
  const router = useRouter();
  const checked = useAccount((s) => s.checked);
  const configured = useAccount((s) => s.configured);
  const account = useAccount((s) => s.account);
  const choosing = useAccount((s) => s.choosing);
  const lastCity = usePlayer((s) => s.lastCity);

  const done = () => {
    const next = nextPath();
    if (next && !useAccount.getState().choosing) router.push(next);
  };

  return (
    <main className="grain relative min-h-dvh bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_0%_0%,rgb(79_195_247/0.14),transparent_60%),radial-gradient(60%_50%_at_100%_100%,rgb(255_199_44/0.12),transparent_60%)]" />
      <div className="safe-x safe-top safe-bottom relative mx-auto flex max-w-xl flex-col gap-5 py-4">
        <ScreenHeader title={t.account.title} />
        {checked && !configured ? (
          <Card className="p-5 text-center text-cream/70">{t.account.offline}</Card>
        ) : account ? (
          <Profile />
        ) : (
          <>
            <Card pattern className="overflow-hidden p-0">
              <KitengeStrip className="h-3 w-full" />
              <div className="p-5">
                <h2 className="font-display text-2xl font-extrabold">{t.league.joinTitle}</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {t.account.why.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-cream/85">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest text-cream">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <Card className="p-5">
              <AuthForm defaultCity={lastCity} onDone={done} />
            </Card>
          </>
        )}
      </div>
      <ChooseSave open={choosing} onDone={done} />
    </main>
  );
}

function Profile() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const account = useAccount((s) => s.account)!;
  const cloud = useAccount((s) => s.cloud);
  const syncing = useAccount((s) => s.syncing);
  const syncError = useAccount((s) => s.syncError);
  const { backup, restore, setCity, logout } = useAccount.getState();
  const [points, setPoints] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [panel, setPanel] = useState<"city" | "pin" | "delete" | null>(null);

  useEffect(() => {
    let live = true;
    fetchBoard(NATIONAL, "points")
      .then((b) => {
        if (!live) return;
        setPoints(b.me?.value ?? 0);
        setRank(b.me?.rank ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(null), 2600);
  };
  const city = isCityId(account.city) ? CITIES[account.city].name : account.city;

  return (
    <>
      {/* The rider's card. */}
      <Card pattern className="overflow-hidden p-0">
        <KitengeStrip className="h-3 w-full" />
        <div className="flex items-center gap-4 p-5">
          <RiderAvatar name={account.name} className="size-16 text-2xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl leading-tight font-extrabold">{account.name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-cream/60">
              <MapPin className="size-3.5" /> {city} · {fmt(t.account.memberSince, { date: new Date(account.created).toLocaleDateString(locale, { month: "short", year: "numeric" }) })}
            </p>
          </div>
        </div>
        <Link href="/ligi" className="flex items-center gap-3 border-t border-white/8 px-5 py-3 transition-colors hover:bg-white/4">
          <Trophy className="size-5 text-sun" />
          <span className="flex-1 font-display font-bold">{t.league.yourWeek}</span>
          {points !== null && (
            <>
              <span className="text-sm text-cream/60 tabular">
                {rank ? fmt(t.league.rank, { n: rank }) : t.league.unranked} · {formatTzs(points)} {t.league.pointsUnit}
              </span>
              <TierBadge points={points} />
            </>
          )}
        </Link>
      </Card>

      {note && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-forest/20 px-3 py-2.5 text-sm font-semibold text-forest-300 ring-1 ring-forest/40">
          <Check className="size-4" /> {note}
        </p>
      )}

      {/* Online backup. */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-sky/20 text-sky-300">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-extrabold">{t.account.cloud}</p>
            <p className={cn("text-sm", syncError ? "text-coral" : "text-cream/60")}>
              {syncing ? t.account.cloudSyncing : syncError ? t.account.cloudError : cloud ? fmt(t.account.cloudSaved, { when: ago(cloud.savedAt, locale) }) : t.account.cloudNever}
            </p>
          </div>
        </div>
        {cloud && <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-cream/70 tabular">{fmt(t.account.levelWallet, { level: cloud.level, wallet: formatTzs(cloud.wallet) })}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="sky" icon={<CloudUpload />} disabled={syncing} onClick={() => void backup().then((r) => r.ok && flash(t.account.saved))}>
            {t.account.backupNow}
          </Button>
          <Button
            variant="night"
            icon={<CloudDownload />}
            disabled={!cloud}
            onClick={() => {
              if (window.confirm(t.account.restoreConfirm)) void restore().then((r) => r.ok && flash(t.account.restored));
            }}
          >
            {t.account.restore}
          </Button>
        </div>
      </Card>

      {/* Settings. */}
      <Card className="flex flex-col p-2">
        <Row icon={<MapPin />} label={t.account.changeCity} value={city} open={panel === "city"} onToggle={() => setPanel(panel === "city" ? null : "city")}>
          <CityPicker
            label={t.account.city}
            value={account.city}
            onChange={(c) =>
              void setCity(c).then((r) => {
                if (r.ok) setPanel(null);
              })
            }
          />
        </Row>
        <Row icon={<KeyRound />} label={t.account.changePin} open={panel === "pin"} onToggle={() => setPanel(panel === "pin" ? null : "pin")}>
          <ChangePin
            onDone={() => {
              setPanel(null);
              flash(t.account.pinChanged);
            }}
          />
        </Row>
        <button type="button" onClick={() => void logout()} className="flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left font-display font-bold transition-colors hover:bg-white/5">
          <LogOut className="size-5 text-cream/60" /> {t.account.logout}
        </button>
      </Card>

      <Card className="p-2 ring-coral/25">
        <Row icon={<Trash2 />} label={t.account.deleteTitle} danger open={panel === "delete"} onToggle={() => setPanel(panel === "delete" ? null : "delete")}>
          <DeleteAccount />
        </Row>
      </Card>
    </>
  );
}

function Row({ icon, label, value, open, onToggle, danger, children }: { icon: React.ReactNode; label: string; value?: string; open: boolean; onToggle: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl transition-colors", open && "bg-white/4")}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left font-display font-bold transition-colors hover:bg-white/5">
        <span className={cn("[&_svg]:size-5", danger ? "text-coral" : "text-cream/60")}>{icon}</span>
        <span className={cn("flex-1", danger && "text-coral")}>{label}</span>
        {value && <span className="text-sm font-semibold text-cream/50">{value}</span>}
      </button>
      {open && <div className="px-3 pb-4">{children}</div>}
    </div>
  );
}

function ChangePin({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [old, setOld] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void useAccount
          .getState()
          .changePin(old, pin)
          .then((r) => (r.ok ? onDone() : setError(t.account.errors[r.error as AccountError] ?? t.account.errors.bad)));
      }}
    >
      <Field label={t.account.oldPin}>{(id) => <PinInput id={id} value={old} onChange={setOld} autoComplete="current-password" />}</Field>
      <Field label={t.account.newPin} hint={t.account.pinHint}>
        {(id) => <PinInput id={id} value={pin} onChange={setPin} autoComplete="new-password" />}
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="sun" disabled={old.length < 4 || pin.length < 4}>
        {t.account.changePin}
      </Button>
    </form>
  );
}

function DeleteAccount() {
  const t = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void useAccount
          .getState()
          .remove(pin)
          .then((r) => !r.ok && setError(t.account.errors[r.error as AccountError] ?? t.account.errors.bad));
      }}
    >
      <p className="text-sm text-cream/70">{t.account.deleteText}</p>
      <Field label={t.account.pin}>{(id) => <PinInput id={id} value={pin} onChange={setPin} autoComplete="current-password" />}</Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="coral" icon={<Trash2 />} disabled={pin.length < 4}>
        {t.account.deleteCta}
      </Button>
    </form>
  );
}

/** After signing in on a device with its own progress: keep this device's, or take the cloud save. */
function ChooseSave({ open, onDone }: { open: boolean; onDone: () => void }) {
  const t = useT();
  const cloud = useAccount((s) => s.cloud);
  const level = usePlayer((s) => s.level);
  const wallet = usePlayer((s) => s.wallet);
  const [busy, setBusy] = useState(false);
  // Closing only puts the question off: syncing stays paused until the rider picks.
  const [later, setLater] = useState(false);
  const pick = (use: "cloud" | "device") => {
    setBusy(true);
    void useAccount
      .getState()
      .choose(use)
      .finally(() => {
        setBusy(false);
        onDone();
      });
  };
  return (
    <Modal open={open && !later} onClose={() => setLater(true)} title={t.account.chooseTitle} closeLabel={t.common.close}>
      <p className="text-cream/75">{t.account.chooseText}</p>
      <div className="mt-4 flex gap-3">
        <SaveOption busy={busy} onPick={() => pick("cloud")} icon={<Cloud />} title={t.account.useCloud} detail={cloud ? fmt(t.account.levelWallet, { level: cloud.level, wallet: formatTzs(cloud.wallet) }) : ""} />
        <SaveOption busy={busy} onPick={() => pick("device")} icon={<Smartphone />} title={t.account.useDevice} detail={fmt(t.account.levelWallet, { level, wallet: formatTzs(wallet) })} />
      </div>
    </Modal>
  );
}

function SaveOption({ busy, onPick, icon, title, detail }: { busy: boolean; onPick: () => void; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onPick}
      className="flex flex-1 flex-col items-center gap-2 rounded-2xl bg-night-600 p-4 text-center ring-1 ring-white/10 transition-colors hover:bg-night-500 hover:ring-sun/60 disabled:opacity-50"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-sun/15 text-sun [&_svg]:size-6">{icon}</span>
      <span className="font-display font-extrabold">{title}</span>
      <span className="text-sm text-cream/60 tabular">{detail}</span>
    </button>
  );
}
