/**
 * Banks a boda rider can use. Branches and ATMs come from OpenStreetMap
 * (amenity=bank / atm); a branch is matched to a bank by its name. Savings
 * earn interest (annual rates in the usual range for Tanzanian savings
 * accounts), and taking cash out costs a small fee. Colours are each bank's
 * familiar brand colours; names appear as mapped.
 *
 * BodaPesa is the game's mobile-money wallet: some customers pay with it,
 * it moves money to and from the banks in the app, and a wakala (agent)
 * swaps it for cash.
 */

export const BANK_IDS = ["crdb", "nmb", "tcb", "azania", "nbc", "exim", "equity", "stanbic", "kcb", "dtb", "absa", "akiba"] as const;
export type BankId = (typeof BANK_IDS)[number];

export interface Bank {
  id: BankId;
  name: string;
  short: string;
  /** Brand colour and accent, for signs, cards and the ATM booth. */
  color: string;
  accent: string;
  /** Text colour on the brand colour. */
  ink: string;
  /** Savings interest, % per year. */
  rate: number;
  /** Cash withdrawal at a branch or ATM, TZS. */
  withdrawFee: number;
  /** Bank ↔ BodaPesa transfer, TZS. */
  transferFee: number;
  /** Matches the bank's mapped name. */
  match: RegExp;
}

export const BANKS: Record<BankId, Bank> = {
  crdb: { id: "crdb", name: "CRDB Bank", short: "CRDB", color: "#00853F", accent: "#8DC63F", ink: "#FFFFFF", rate: 3, withdrawFee: 1500, transferFee: 1000, match: /crdb/i },
  nmb: { id: "nmb", name: "NMB Bank", short: "NMB", color: "#0A4F9E", accent: "#F7941D", ink: "#FFFFFF", rate: 3, withdrawFee: 1300, transferFee: 1000, match: /\bnmb\b|national microfinance/i },
  // Tanzania Postal Bank became Tanzania Commercial Bank (TCB).
  tcb: { id: "tcb", name: "TCB Bank", short: "TCB", color: "#C8102E", accent: "#FFD200", ink: "#FFFFFF", rate: 4, withdrawFee: 1000, transferFee: 800, match: /\btcb\b|\btpb\b|postal bank|tanzania commercial bank/i },
  azania: { id: "azania", name: "Azania Bank", short: "AZANIA", color: "#16367F", accent: "#E21E26", ink: "#FFFFFF", rate: 5, withdrawFee: 1200, transferFee: 900, match: /azania/i },
  nbc: { id: "nbc", name: "NBC Bank", short: "NBC", color: "#0057B8", accent: "#E4002B", ink: "#FFFFFF", rate: 2.5, withdrawFee: 1500, transferFee: 1000, match: /\bnbc\b|national bank of commerce/i },
  exim: { id: "exim", name: "Exim Bank", short: "EXIM", color: "#E31837", accent: "#1B1B1B", ink: "#FFFFFF", rate: 3.5, withdrawFee: 1500, transferFee: 1000, match: /exim/i },
  equity: { id: "equity", name: "Equity Bank", short: "EQUITY", color: "#A32A29", accent: "#F2B705", ink: "#FFFFFF", rate: 3, withdrawFee: 1200, transferFee: 900, match: /equity/i },
  stanbic: { id: "stanbic", name: "Stanbic Bank", short: "STANBIC", color: "#0033A1", accent: "#FFFFFF", ink: "#FFFFFF", rate: 2.5, withdrawFee: 2000, transferFee: 1200, match: /stanbic/i },
  kcb: { id: "kcb", name: "KCB Bank", short: "KCB", color: "#00A651", accent: "#1D3C6E", ink: "#FFFFFF", rate: 3, withdrawFee: 1500, transferFee: 1000, match: /\bkcb\b/i },
  dtb: { id: "dtb", name: "DTB Bank", short: "DTB", color: "#E2231A", accent: "#4A4A4A", ink: "#FFFFFF", rate: 3, withdrawFee: 1500, transferFee: 1000, match: /\bdtb\b|diamond trust/i },
  absa: { id: "absa", name: "Absa Bank", short: "ABSA", color: "#DC0032", accent: "#870A3C", ink: "#FFFFFF", rate: 2.5, withdrawFee: 2000, transferFee: 1200, match: /absa|barclays/i },
  akiba: { id: "akiba", name: "Akiba Commercial Bank", short: "AKIBA", color: "#F58220", accent: "#1F4E79", ink: "#FFFFFF", rate: 4, withdrawFee: 1000, transferFee: 800, match: /akiba/i },
};

/** The bank a mapped branch belongs to, if it's one we know. */
export const bankOf = (name: string | undefined): BankId | null => {
  if (!name) return null;
  for (const id of BANK_IDS) if (BANKS[id].match.test(name)) return id;
  return null;
};

/** Mapped mobile-money agents (shops and kiosks named for M-Pesa, wakala and the like). */
export const isWakala = (name: string | undefined) => Boolean(name && /m-?pesa|wakala|tigo ?pesa|airtel money|halo ?pesa|mobile money/i.test(name));

/** BodaPesa cash-out fee at a wakala: tiered, like Tanzanian mobile money. */
export const cashOutFee = (amount: number) => (amount <= 0 ? 0 : amount <= 10_000 ? 500 : amount <= 50_000 ? 1000 : amount <= 200_000 ? 2000 : 3500);

/** Share of fares customers pay by BodaPesa instead of cash. */
export const BODAPESA_FARE_SHARE = 0.35;

/** Carrying more cash than this at night in busy places draws vibaka (pickpockets). */
export const CASH_RISK_LEVEL = 150_000;
