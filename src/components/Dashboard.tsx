import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchTransactions,
  fetchSummary,
  classifyBackendCategory,
  type SpendingSummary,
} from '../lib/api';
import type { Transaction, Category } from '../types';
import { isProcessing as txIsProcessing } from '../lib/transactionStatus';
import { cn } from '../lib/utils';
import { CategoryIcon } from './CategoryIcon';
import { PlaceThumbnail } from './PlaceThumbnail';

interface DashboardProps {
  onSelectReceipt?: (receiptId: string) => void;
  onSelectMerchant?: (brandId: string) => void;
  onViewAllTransactions?: () => void;
}

interface SpendingCategorySlice {
  category: Category;
  total: number;
  count: number;
}

/**
 * Books — the home view in Variant B (Soft / Organic).
 *
 * Layout follows docs/2026-05-10_Mockup_frontend_redesign-B-soft.html (fig.01),
 * scoped to the current month. All data is live from the backend: no mocks,
 * no fixtures, no "demo mode" toggles (see memory feedback_no_mock_api.md).
 *
 * The mockup's "86% of $5000 plan" budget meter is intentionally omitted —
 * there is no /budget endpoint on the backend yet. The big spend card stands
 * on its own without an invented number.
 */
export default function Dashboard({ onSelectReceipt, onSelectMerchant, onViewAllTransactions }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<SpendingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const monthRange = useMemo(() => currentMonthRange(new Date()), []);

  useEffect(() => {
    Promise.all([
      fetchTransactions({ limit: 4, from: monthRange.from, to: monthRange.to }),
      fetchSummary({ from: monthRange.from, to: monthRange.to }),
    ])
      .then(([txs, sum]) => {
        setTransactions(txs);
        setSummary(sum);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [monthRange.from, monthRange.to]);

  const spendingByCategory = useMemo<SpendingCategorySlice[]>(() => {
    const buckets = new Map<Category, { total: number; count: number }>();
    for (const item of summary) {
      const { category, transactionType } = classifyBackendCategory(item.category);
      if (transactionType !== 'spending' || !category) continue;
      const amount = Math.abs(Number(item.total_spent));
      const existing = buckets.get(category);
      if (existing) {
        existing.total += amount;
        existing.count += item.count;
      } else {
        buckets.set(category, { total: amount, count: item.count });
      }
    }
    return Array.from(buckets, ([category, v]) => ({ category, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total);
  }, [summary]);

  const totalSpent = useMemo(
    () => spendingByCategory.reduce((s, c) => s + c.total, 0),
    [spendingByCategory],
  );
  const totalCount = useMemo(
    () => spendingByCategory.reduce((s, c) => s + c.count, 0),
    [spendingByCategory],
  );

  return (
    <div className="space-y-7">
      <GreetingRow />
      <MonthHeading date={monthRange.now} />

      <SpentCard amount={totalSpent} count={totalCount} loading={loading} />

      <SectionTitle title="where it went" />
      <CategoryGrid items={spendingByCategory} loading={loading} />

      <SectionTitle
        title="recent"
        more={totalCount > 0 ? `all ${totalCount} →` : undefined}
        onMore={onViewAllTransactions}
      />
      <RecentList
        items={transactions}
        loading={loading}
        onSelect={(tx) => {
          if (tx.merchantBrandId && onSelectMerchant) {
            onSelectMerchant(tx.merchantBrandId);
          } else {
            onSelectReceipt?.(tx.id);
          }
        }}
      />
    </div>
  );
}

/* ── Greeting ─────────────────────────────────────────────────── */

function GreetingRow() {
  return (
    <div className="flex items-center justify-between">
      <p className="font-hand text-2xl text-[var(--color-terracotta)] leading-none">
        Hi Daniel <span aria-hidden="true">🌿</span>
      </p>
      <div
        aria-hidden="true"
        className="h-9 w-9 rounded-full"
        style={{
          background: 'linear-gradient(135deg, var(--color-butter) 0%, var(--color-terracotta) 100%)',
        }}
      />
    </div>
  );
}

/* ── Month heading ────────────────────────────────────────────── */

function MonthHeading({ date }: { date: Date }) {
  const month = date.toLocaleString('en-US', { month: 'long' });
  return (
    <div>
      <h1 className="font-display italic font-normal text-4xl sm:text-5xl leading-[1.05] tracking-tight">
        Your <span className="font-medium not-italic">{month}</span>
      </h1>
      <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
        {weekProgressSentence(date)}
      </p>
    </div>
  );
}

/* ── Spent card ───────────────────────────────────────────────── */

function SpentCard({
  amount,
  count,
  loading,
}: {
  amount: number;
  count: number;
  loading: boolean;
}) {
  const { whole, cents } = splitAmount(amount);
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[18px] p-6',
        'border border-[var(--color-rule)] bg-[var(--color-surface)]',
        'shadow-[0_4px_16px_-8px_rgba(45,37,32,0.08)]',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, var(--color-butter), transparent 70%)',
        }}
      />

      <p className="relative text-xs font-medium text-[var(--color-ink-muted)] mb-2">SPENT</p>

      {loading ? (
        <p className="relative font-display italic text-4xl text-[var(--color-ink-muted)]">
          loading…
        </p>
      ) : (
        <p className="relative font-display italic font-medium text-[clamp(2.5rem,9vw,3.5rem)] leading-none tracking-tight tnum">
          <span className="text-[0.55em] font-normal text-[var(--color-terracotta)] align-top mr-[0.1em]">
            $
          </span>
          {whole.toLocaleString()}
          <span className="text-[0.5em] font-normal text-[var(--color-ink-muted)]">.{cents}</span>
        </p>
      )}

      <p className="relative mt-3 text-[13px] text-[var(--color-ink-muted)]">
        {loading
          ? ' '
          : count === 0
            ? 'No entries yet — capture your first receipt below.'
            : `${count} ${count === 1 ? 'receipt' : 'receipts'} this month`}
      </p>
    </section>
  );
}

/* ── Section title ────────────────────────────────────────────── */

function SectionTitle({
  title,
  more,
  onMore,
}: {
  title: string;
  more?: string;
  onMore?: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <h2 className="font-display italic font-medium text-2xl leading-none tracking-tight">
        {title}
      </h2>
      {more && (
        <button
          type="button"
          onClick={onMore}
          disabled={!onMore}
          className={cn(
            'font-hand text-lg text-[var(--color-terracotta)]',
            'leading-none',
            !onMore && 'cursor-default opacity-50',
            onMore && 'hover:text-[var(--color-terracotta-deep)]',
          )}
        >
          {more}
        </button>
      )}
    </div>
  );
}

/* ── Category grid (up to 7 spending categories) ─────────────── */

function CategoryGrid({ items, loading }: { items: SpendingCategorySlice[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[100px] rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)]"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="font-hand text-lg text-[var(--color-ink-muted)] py-4">
        nothing here yet —
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((c) => (
        <div
          key={c.category}
          className={cn(
            'rounded-[18px] p-4 min-h-[100px]',
            'border border-[var(--color-rule)] bg-[var(--color-surface)]',
            'flex flex-col justify-between',
          )}
        >
          <CategoryIcon category={c.category} size={28} />
          <div>
            <p className="text-[13px] font-medium text-[var(--color-ink-muted)] mb-0.5">
              {c.category}
            </p>
            <p className="font-display italic font-medium text-[1.375rem] leading-none tracking-tight tnum">
              ${Math.round(c.total).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Recent list ──────────────────────────────────────────────── */

function RecentList({
  items,
  loading,
  onSelect,
}: {
  items: Transaction[];
  loading: boolean;
  onSelect?: (tx: Transaction) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-6">
        <p className="font-hand text-lg text-[var(--color-ink-muted)]">loading…</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-6 text-center">
        <p className="font-display italic text-[var(--color-ink-muted)]">
          No entries this month yet.
        </p>
      </div>
    );
  }
  return (
    <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5">
      {items.map((tx, idx) => {
        const isProcessing = txIsProcessing(tx.rawStatus);
        const dateLabel = formatRelativeDate(tx.date);
        const isToday = dateLabel === 'Today';
        const categoryLine = tx.category
          ? prettyCategory(tx.category)
          : tx.transactionType !== 'spending'
            ? prettyCategory(tx.transactionType)
            : '';
        // Apple-Wallet style: location wins over payment method when
        // the receipt has a geocoded place. Payment method only shows
        // for online/no-location entries; category is the last resort.
        const subtitle =
          tx.placeCity ?? tx.paymentMethod?.trim() ?? categoryLine;
        return (
          <li
            key={tx.id}
            className={cn(
              'grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3',
              idx > 0 && 'border-t border-[var(--color-rule-soft)]',
            )}
          >
            {tx.placeMapUrl ? (
              <PlaceThumbnail
                src={tx.placeMapUrl}
                alt={tx.description}
                size={44}
                fallback={
                  <CategoryIcon
                    category={tx.category}
                    transactionType={tx.transactionType}
                    size={44}
                  />
                }
              />
            ) : (
              <CategoryIcon
                category={tx.category}
                transactionType={tx.transactionType}
                size={44}
              />
            )}
            <button
              type="button"
              onClick={() => !isProcessing && onSelect?.(tx)}
              disabled={isProcessing}
              className={cn(
                'text-left min-w-0',
                isProcessing ? 'cursor-default opacity-60' : 'cursor-pointer',
              )}
            >
              <p className="text-[15px] font-medium leading-snug truncate">
                {tx.description}
              </p>
              {subtitle && (
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] truncate">{subtitle}</p>
              )}
              <p
                className={cn(
                  'mt-0.5 text-xs tnum truncate',
                  isToday
                    ? 'text-[var(--color-terracotta)] font-medium'
                    : 'text-[var(--color-ink-muted)]',
                )}
              >
                {dateLabel}
              </p>
            </button>
            <span className="font-display italic font-medium text-[17px] tnum">
              ${Math.abs(tx.amount).toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function currentMonthRange(now: Date): { from: string; to: string; now: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: isoDay(first), to: isoDay(last), now };
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRelativeDate(isoDate: string): string {
  // Parse components directly so a "YYYY-MM-DD" string is interpreted in
  // local time, not UTC (which would shift the day for negative offsets).
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!y || !m || !d) return isoDate;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return `${m}/${d}/${String(y).slice(2)}`;
}

function weekProgressSentence(now: Date): string {
  const dayOfMonthNum = now.getDate();
  const weeksIn = Math.max(1, Math.floor(dayOfMonthNum / 7) + (dayOfMonthNum % 7 === 0 ? 0 : 1));
  if (weeksIn === 1) return 'Just getting started this month.';
  if (weeksIn === 2) return 'Two weeks in — pretty kind to you so far.';
  if (weeksIn === 3) return 'Three weeks in — pretty kind to you so far.';
  return 'Four weeks in — a full picture is taking shape.';
}

function splitAmount(amount: number): { whole: number; cents: string } {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const cents = abs.toFixed(2).split('.')[1] ?? '00';
  return { whole, cents };
}

function prettyCategory(c: string): string {
  if (!c) return 'Other';
  // Backend keys are sometimes lower-case slugs ("groceries"), the Transaction
  // type uses Title Case ("Dining"). Normalize either way to display.
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}
