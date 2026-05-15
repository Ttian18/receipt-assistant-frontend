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
  paymentMethod: string;
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
