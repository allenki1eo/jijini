/**
 * Money moves between the rider's three pockets: cash (`wallet`), the
 * BodaPesa wallet on the phone, and savings at the banks. Every move checks
 * the balance, takes its fee, and sends the SMS a real bank or mobile-money
 * service would. Savings earn daily interest.
 */
import { BANKS, cashOutFee, type BankId } from "@/data/banks";
import { clockText } from "@/game/systems/environment";
import { currentDictionary, fmt, formatTzs } from "@/i18n";
import { usePhone } from "@/stores/phone";
import { usePlayer } from "@/stores/player";
import { dayKey } from "./progression";

const tzs = (n: number) => formatTzs(Math.round(n));

/** A money alert in the phone. `amount` is the change to BodaPesa or cash (for the history colours). */
const alert = (from: string, text: string, amount: number) => usePhone.getState().push({ from, kind: "pesa", amount, at: clockText(), text });

const balance = (bank: BankId) => usePlayer.getState().banks[bank] ?? 0;
const setBank = (bank: BankId, value: number) => {
  const p = usePlayer.getState();
  p.patch({ banks: { ...p.banks, [bank]: Math.max(0, Math.round(value)) } });
};

export type MoneyResult = { ok: true } | { ok: false; reason: "amount" | "funds" };
const fail = (reason: "amount" | "funds"): MoneyResult => ({ ok: false, reason });
const OK: MoneyResult = { ok: true };

/** Cash → bank, at a branch or ATM. Free. */
export const deposit = (bank: BankId, amount: number): MoneyResult => {
  const p = usePlayer.getState();
  if (amount <= 0) return fail("amount");
  if (p.wallet < amount) return fail("funds");
  p.patch({ wallet: p.wallet - amount });
  setBank(bank, balance(bank) + amount);
  const t = currentDictionary().bank;
  alert(BANKS[bank].name, fmt(t.smsDeposit, { amount: tzs(amount), balance: tzs(balance(bank)) }), -amount);
  return OK;
};

/** Bank → cash, at a branch or ATM. The bank's withdrawal fee comes off the account. */
export const withdraw = (bank: BankId, amount: number): MoneyResult => {
  const fee = BANKS[bank].withdrawFee;
  if (amount <= 0) return fail("amount");
  if (balance(bank) < amount + fee) return fail("funds");
  setBank(bank, balance(bank) - amount - fee);
  const p = usePlayer.getState();
  p.patch({ wallet: p.wallet + amount });
  const t = currentDictionary().bank;
  alert(BANKS[bank].name, fmt(t.smsWithdraw, { amount: tzs(amount), fee: tzs(fee), balance: tzs(balance(bank)) }), amount);
  return OK;
};

/** BodaPesa → bank, from the app anywhere. */
export const toBank = (bank: BankId, amount: number): MoneyResult => {
  const p = usePlayer.getState();
  const fee = BANKS[bank].transferFee;
  if (amount <= 0) return fail("amount");
  if (p.bodapesa < amount + fee) return fail("funds");
  p.patch({ bodapesa: p.bodapesa - amount - fee });
  setBank(bank, balance(bank) + amount);
  const t = currentDictionary();
  alert(t.phone.pesaName, fmt(t.bank.smsToBank, { amount: tzs(amount), bank: BANKS[bank].short, fee: tzs(fee) }), -(amount + fee));
  return OK;
};

/** Bank → BodaPesa, from the app anywhere. */
export const fromBank = (bank: BankId, amount: number): MoneyResult => {
  const fee = BANKS[bank].transferFee;
  if (amount <= 0) return fail("amount");
  if (balance(bank) < amount + fee) return fail("funds");
  setBank(bank, balance(bank) - amount - fee);
  const p = usePlayer.getState();
  p.patch({ bodapesa: p.bodapesa + amount });
  const t = currentDictionary();
  alert(t.phone.pesaName, fmt(t.bank.smsFromBank, { amount: tzs(amount), bank: BANKS[bank].short, fee: tzs(fee) }), amount);
  return OK;
};

/** Cash → BodaPesa at a wakala. Free, as depositing is. */
export const cashIn = (amount: number): MoneyResult => {
  const p = usePlayer.getState();
  if (amount <= 0) return fail("amount");
  if (p.wallet < amount) return fail("funds");
  p.patch({ wallet: p.wallet - amount, bodapesa: p.bodapesa + amount });
  const t = currentDictionary();
  alert(t.phone.pesaName, fmt(t.bank.smsCashIn, { amount: tzs(amount), balance: tzs(usePlayer.getState().bodapesa) }), amount);
  return OK;
};

/** BodaPesa → cash at a wakala, with the tiered cash-out fee. */
export const cashOut = (amount: number): MoneyResult => {
  const p = usePlayer.getState();
  const fee = cashOutFee(amount);
  if (amount <= 0) return fail("amount");
  if (p.bodapesa < amount + fee) return fail("funds");
  p.patch({ wallet: p.wallet + amount, bodapesa: p.bodapesa - amount - fee });
  const t = currentDictionary();
  alert(t.phone.pesaName, fmt(t.bank.smsCashOut, { amount: tzs(amount), fee: tzs(fee), balance: tzs(usePlayer.getState().bodapesa) }), -(amount + fee));
  return OK;
};

/** A customer pays the fare by BodaPesa: the money (already counted as earnings) moves from cash to the wallet. */
export const fareByBodaPesa = (amount: number, who: string) => {
  const p = usePlayer.getState();
  const moved = Math.min(amount, p.wallet);
  if (moved <= 0) return;
  p.patch({ wallet: p.wallet - moved, bodapesa: p.bodapesa + moved });
  const t = currentDictionary();
  alert(t.phone.pesaName, fmt(t.phone.pesaIn, { amount: tzs(moved), who }), moved);
};

/** Interest on savings, paid daily (catching up on missed days, at most a month). */
export const accrueInterest = () => {
  const p = usePlayer.getState();
  const today = dayKey();
  if (!p.interestDay) {
    p.patch({ interestDay: today });
    return;
  }
  if (p.interestDay === today) return;
  const days = Math.min(30, Math.max(1, Math.round((Date.parse(today) - Date.parse(p.interestDay)) / 86_400_000)));
  const banks = { ...p.banks };
  const t = currentDictionary().bank;
  for (const [id, value] of Object.entries(banks) as [BankId, number][]) {
    if (!value) continue;
    const interest = Math.floor(value * (BANKS[id].rate / 100 / 365) * days);
    if (interest < 1) continue;
    banks[id] = value + interest;
    alert(BANKS[id].name, fmt(t.smsInterest, { amount: tzs(interest), balance: tzs(banks[id]) }), 0);
  }
  p.patch({ banks, interestDay: today });
};

/** Everything the rider owns in money: cash, BodaPesa and savings. */
export const netWorth = () => {
  const p = usePlayer.getState();
  return p.wallet + p.bodapesa + Object.values(p.banks).reduce((a, b) => a + (b ?? 0), 0);
};

/** League prizes, paid into BodaPesa with the usual SMS. */
export const leaguePrize = (amount: number, week: string) => {
  if (amount <= 0) return;
  const p = usePlayer.getState();
  p.patch({ bodapesa: p.bodapesa + amount });
  const t = currentDictionary();
  alert(t.league.prizeFrom, fmt(t.league.prizeSms, { amount: tzs(amount), week: week.replace("-W", " · ") }), amount);
};
