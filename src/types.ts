export const CATEGORIES = [
  'Food & Drinks',
  'Transportation',
  'Shopping',
  'Travel',
  'Entertainment',
  'Health',
  'Services',
] as const;

export type Category = typeof CATEGORIES[number];

export const TRANSACTION_TYPES = [
  'spending',
  'income',
  'transfer',
  'investment',
] as const;

export type TransactionType = typeof TRANSACTION_TYPES[number];

export type RawTransactionStatus =
  | 'draft'
  | 'posted'
  | 'voided'
  | 'reconciled'
  | 'error';

export interface Transaction {
  id: string;
  description: string;
  /** Null when transactionType !== 'spending'. */
  category: Category | null;
  transactionType: TransactionType;
  date: string;
  /** Null when the receipt's OCR didn't extract a payment method
   *  (e.g. cash, illegible, missing footer). UI views fall back to
   *  `placeCity` or category in that case. */
  paymentMethod: string | null;
  /** "City, ST" derived from `place.formatted_address` when the
   *  transaction has a geocoded place (US-only heuristic; non-US
   *  best-effort). Used as a row-subtitle fallback in Apple-Wallet
   *  style when `paymentMethod` is unavailable. */
  placeCity?: string | null;
  /** Proxied Google Static Maps URL (#96) for a small map thumbnail
   *  of the place. Null when the transaction has no linked place or
   *  no lat/lng. Row renderers swap `<CategoryIcon />` for
   *  `<PlaceThumbnail src={placeMapUrl} />` when this is set. */
  placeMapUrl?: string | null;
  amount: number;
  /** Single source of truth for state. UI-visible status labels are derived
   *  via `statusBadge(rawStatus)` from `src/lib/transactionStatus.ts`. */
  rawStatus: RawTransactionStatus;
  /** Primary linked document id, if any — needed for tombstone toggle and
   *  delete-receipt cascade flows from the list. */
  documentId?: string | null;
  /** Canonical merchant brand id (kebab-case, e.g. "costco"). Populated
   *  from `metadata.merchant.brand_id` on rows ingested after #64. Drives
   *  navigation from list rows → merchant aggregation page. */
  merchantBrandId?: string | null;
}

export interface Metric {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  subText?: string;
  icon?: string;
}

export interface Achievement {
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
}

export interface CategoryBreakdown {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
}

export interface YearlySummary {
  quarter: string;
  inflow: number;
  outflow: number;
  netSavings: number;
  status: 'SURPLUS' | 'PEAK';
}
