import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchTransactions,
  extractProblemMessage,
  getDocument,
  getTransaction,
  hardDeleteTransaction,
  restoreDocument,
  documentContentUrl,
  type BackendDocument,
} from '../lib/api';
import { listTombstones, removeTombstone } from '../lib/tombstones';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';
import { isProcessing as txIsProcessing, statusBadge } from '../lib/transactionStatus';
import { CategoryIcon } from './CategoryIcon';
import { PlaceThumbnail } from './PlaceThumbnail';
import TransactionRowMenu from './TransactionRowMenu';
import ConfirmActionDialog from './ConfirmActionDialog';
import UnreconcileDialog from './UnreconcileDialog';
import DeletedBadge from './DeletedBadge';
import TransactionsFilters from './TransactionsFilters';
import {
  DEFAULT_FILTERS,
  effectiveDateRange,
  isFilterActive,
  type FilterState,
} from '../lib/transactionsFilterState';

interface TransactionsProps {
  onSelectReceipt?: (receiptId: string) => void;
  onSelectMerchant?: (brandId: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Reset the top-bar search input. The search lives in App.tsx so
   *  the table's `Clear filters` button needs a hook to reach it. */
  onClearSearch?: () => void;
}

interface TombstoneRow {
  status: 'loading' | 'present' | 'gone';
  id: string;
  doc?: BackendDocument;
}

/**
 * Ledger — the transactions browser in Variant B (Soft / Organic).
 * Visual language follows docs/2026-05-10_Mockup_frontend_redesign-B-soft.html
 * (fig.02): handwritten section labels, week-grouped entries, rounded cards.
 *
 * Backend wiring is unchanged from the previous Material-3 version: server-
 * side filters (date / status / payee / amount / q) re-fetch on debounced
 * change; category filtering stays client-side.
 */
export default function Transactions({
  onSelectReceipt,
  onSelectMerchant,
  searchQuery = '',
  onSearchChange,
  onClearSearch,
}: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ id: string; etag: string } | null>(null);
  const [unreconcileTarget, setUnreconcileTarget] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [showDeleted, setShowDeleted] = useState(false);
  const [tombstones, setTombstones] = useState<TombstoneRow[]>([]);
  const [tombstoneLoading, setTombstoneLoading] = useState(false);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const debouncedPayee = useDebouncedValue(filters.payeeContains, 300);
  const debouncedAmountMin = useDebouncedValue(filters.amountMinDollars, 300);
  const debouncedAmountMax = useDebouncedValue(filters.amountMaxDollars, 300);

  const dateRange = useMemo(() => effectiveDateRange(filters), [filters]);
  const hasActiveFilter = isFilterActive(filters, searchQuery);

  useEffect(() => {
    setLoading(true);
    const dollarsToMinor = (s: string): number | undefined => {
      const trimmed = s.trim();
      if (!trimmed) return undefined;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return undefined;
      return Math.round(n * 100);
    };
    fetchTransactions({
      limit: 50,
      has_document: true,
      q: debouncedSearch.trim() || undefined,
      status: filters.status,
      payee_contains: debouncedPayee.trim() || undefined,
      amount_min_minor: dollarsToMinor(debouncedAmountMin),
      amount_max_minor: dollarsToMinor(debouncedAmountMax),
      from: dateRange.occurred_from,
      to: dateRange.occurred_to,
    })
      .then((rows) => {
        setTransactions(rows);
        setError(null);
      })
      .catch((e: unknown) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, [
    refreshKey,
    debouncedSearch,
    debouncedPayee,
    debouncedAmountMin,
    debouncedAmountMax,
    filters.status,
    dateRange.occurred_from,
    dateRange.occurred_to,
  ]);

  useEffect(() => {
    if (!showDeleted) {
      setTombstones([]);
      return;
    }
    const ids = listTombstones();
    if (ids.length === 0) {
      setTombstones([]);
      return;
    }
    setTombstoneLoading(true);
    setTombstones(ids.map((id) => ({ status: 'loading', id })));
    Promise.allSettled(
      ids.map(async (id): Promise<TombstoneRow> => {
        try {
          const { data } = await getDocument(id, { includeDeleted: true });
          if (!data.deleted_at) {
            removeTombstone(id);
            return { status: 'gone', id };
          }
          return { status: 'present', id, doc: data };
        } catch {
          removeTombstone(id);
          return { status: 'gone', id };
        }
      }),
    )
      .then((results) => {
        const next = results
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter((x): x is TombstoneRow => x !== null && x.status !== 'gone');
        setTombstones(next);
      })
      .finally(() => setTombstoneLoading(false));
  }, [showDeleted, refreshKey]);

  const filteredTransactions = useMemo(() => {
    let out = transactions;
    if (filters.transactionTypes.length > 0) {
      const typeSet = new Set(filters.transactionTypes);
      out = out.filter((tx) => typeSet.has(tx.transactionType));
    }
    if (filters.categories.length > 0) {
      const catSet = new Set<string>(filters.categories);
      out = out.filter((tx) => tx.category !== null && catSet.has(tx.category));
    }
    return out;
  }, [transactions, filters.categories, filters.transactionTypes]);

  const totalExpenses = filteredTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Group by ISO week (Mon-anchored) for the fig.02 week banners.
  const weeks = useMemo(() => groupByWeek(filteredTransactions), [filteredTransactions]);

  const handleHardDeleteRequest = async (txnId: string) => {
    setRowError(null);
    try {
      const fresh = await getTransaction(txnId);
      if (fresh.data.status === 'reconciled') {
        setUnreconcileTarget(txnId);
        return;
      }
      if (!fresh.etag) throw new Error('Missing ETag — refresh and retry.');
      setHardDeleteTarget({ id: txnId, etag: fresh.etag });
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteTarget) return;
    await hardDeleteTransaction(hardDeleteTarget.id, hardDeleteTarget.etag);
    setHardDeleteTarget(null);
    setRefreshKey((k) => k + 1);
  };

  const handleRestoreTombstone = async (id: string) => {
    try {
      await restoreDocument(id);
      removeTombstone(id);
      setTombstones((prev) => prev.filter((t) => t.id !== id));
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setRowError(extractProblemMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <Header total={Math.abs(totalExpenses)} count={filteredTransactions.length} />

      <SearchSoft
        value={searchQuery}
        onChange={(v) => onSearchChange?.(v)}
      />

      <TransactionsFilters
        filters={filters}
        onChange={setFilters}
        hasActiveFilter={hasActiveFilter}
        onClear={() => {
          setFilters(DEFAULT_FILTERS);
          onClearSearch?.();
        }}
        showDeleted={showDeleted}
        onToggleShowDeleted={() => setShowDeleted((s) => !s)}
      />

      {rowError && (
        <div className="rounded-[16px] border border-[var(--color-stamp)]/30 bg-[var(--color-stamp)]/5 px-4 py-3 text-sm text-[var(--color-stamp)] flex items-center justify-between">
          <span>{rowError}</span>
          <button
            onClick={() => setRowError(null)}
            className="font-medium text-[var(--color-stamp)]/80 hover:text-[var(--color-stamp)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {showDeleted && (
        <TombstonePanel
          loading={tombstoneLoading}
          rows={tombstones}
          onRestore={handleRestoreTombstone}
        />
      )}

      {loading ? (
        <EmptyState>
          <p className="font-hand text-xl text-[var(--color-ink-muted)]">loading…</p>
        </EmptyState>
      ) : error ? (
        <EmptyState>
          <p className="text-[var(--color-stamp)]">{error}</p>
        </EmptyState>
      ) : filteredTransactions.length === 0 ? (
        <EmptyState>
          <p className="font-display italic text-[var(--color-ink-muted)] text-lg">
            {hasActiveFilter
              ? 'No entries match the current filters.'
              : 'No entries yet — capture your first receipt.'}
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {weeks.map((wk) => (
            <WeekGroup
              key={wk.startIso}
              week={wk}
              onSelect={(tx) => {
                if (tx.merchantBrandId && onSelectMerchant) {
                  onSelectMerchant(tx.merchantBrandId);
                } else {
                  onSelectReceipt?.(tx.id);
                }
              }}
              onHardDelete={handleHardDeleteRequest}
              onUnreconcile={(id) => setUnreconcileTarget(id)}
            />
          ))}
        </div>
      )}

      <ConfirmActionDialog
        isOpen={hardDeleteTarget !== null}
        onClose={() => setHardDeleteTarget(null)}
        title="Permanently delete this transaction?"
        message={
          <>
            <p>
              Removes the transaction, its postings, and any document links. The
              underlying receipt image (if any) is kept — only the transaction is
              destroyed.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              This action cannot be undone.
            </p>
          </>
        }
        confirmLabel="Delete forever"
        destructive
        onConfirm={handleHardDeleteConfirm}
      />

      <UnreconcileDialog
        isOpen={unreconcileTarget !== null}
        onClose={() => setUnreconcileTarget(null)}
        transactionId={unreconcileTarget}
        onUnreconciled={() => {
          setUnreconcileTarget(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────── */

function Header({ total, count }: { total: number; count: number }) {
  const now = new Date();
  const monthShort = now.toLocaleString('en-US', { month: 'long' });
  const weekIn = Math.max(1, Math.ceil(now.getDate() / 7));
  const weekIn_text =
    weekIn === 1 ? 'first week in' :
    weekIn === 2 ? 'two weeks in' :
    weekIn === 3 ? 'three weeks in' :
    'a full month';
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display italic font-medium text-4xl leading-none tracking-tight">
          Ledger
        </h1>
        <p className="mt-2 font-hand text-2xl text-[var(--color-terracotta)] leading-none">
          {monthShort}, {weekIn_text}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-ink-muted)]">
          TOTAL
        </p>
        <p className="mt-1 font-display italic font-medium text-2xl tnum">
          ${Math.round(total).toLocaleString()}
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {count} {count === 1 ? 'entry' : 'entries'}
        </p>
      </div>
    </div>
  );
}

/* ── Search ───────────────────────────────────────────────────── */

function SearchSoft({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-[16px] border border-[var(--color-rule)]',
        'bg-[var(--color-surface)] px-4 py-3',
        'focus-within:border-[var(--color-terracotta)] transition-colors',
      )}
    >
      <span
        aria-hidden="true"
        className="relative inline-block h-[18px] w-[18px] flex-shrink-0"
      >
        <span className="absolute inset-0 border-2 border-[var(--color-ink-muted)] rounded-full" />
        <span
          className="absolute bottom-[-3px] right-[-4px] h-[2px] w-2 bg-[var(--color-ink-muted)] rounded"
          style={{ transform: 'rotate(45deg)' }}
        />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search merchants, notes…"
        className={cn(
          'flex-1 bg-transparent outline-none border-none',
          'text-[15px] text-[var(--color-ink)]',
          'placeholder:font-display placeholder:italic placeholder:text-[var(--color-ink-muted)]',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[var(--color-ink-muted)] text-sm font-medium hover:text-[var(--color-ink)]"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </label>
  );
}

/* ── Week group ───────────────────────────────────────────────── */

interface WeekBucket {
  startIso: string;
  label: string;
  total: number;
  txs: Transaction[];
}

function WeekGroup({
  week,
  onSelect,
  onHardDelete,
  onUnreconcile,
}: {
  week: WeekBucket;
  onSelect: (tx: Transaction) => void;
  onHardDelete: (id: string) => void;
  onUnreconcile: (id: string) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-hand text-xl text-[var(--color-terracotta)] leading-none">
          {week.label}
        </span>
        <span className="text-[11px] tracking-[0.12em] uppercase text-[var(--color-ink-muted)]">
          {week.txs.length} {week.txs.length === 1 ? 'entry' : 'entries'}
        </span>
        <span className="ml-auto font-display italic text-base font-medium tnum">
          ${Math.round(Math.abs(week.total)).toLocaleString()}
        </span>
      </div>
      <ul className="space-y-2">
        {week.txs.map((tx) => (
          <li key={tx.id}>
            <LedgerRow
              tx={tx}
              onSelect={onSelect}
              onHardDelete={onHardDelete}
              onUnreconcile={onUnreconcile}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LedgerRow({
  tx,
  onSelect,
  onHardDelete,
  onUnreconcile,
}: {
  tx: Transaction;
  onSelect: (tx: Transaction) => void;
  onHardDelete: (id: string) => void;
  onUnreconcile: (id: string) => void;
}) {
  const isProcessing = txIsProcessing(tx.rawStatus);
  const badge = statusBadge(tx.rawStatus);
  const hasDoc = Boolean(tx.documentId);
  return (
    <div
      data-testid={`txn-row-${tx.id}`}
      className={cn(
        'grid grid-cols-[48px_1fr_auto_auto] items-center gap-3',
        'rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] p-3 pr-2',
      )}
    >
      {/* Place thumbnail when geocoded; category icon otherwise (#96).
          Optional has-receipt ✦ badge sits on top of either. */}
      <div className="relative h-12 w-12 flex-shrink-0">
        {tx.placeMapUrl ? (
          <PlaceThumbnail
            src={tx.placeMapUrl}
            alt={tx.description}
            size={48}
            fallback={
              <CategoryIcon
                category={tx.category}
                transactionType={tx.transactionType}
                size={48}
              />
            }
          />
        ) : (
          <CategoryIcon
            category={tx.category}
            transactionType={tx.transactionType}
            size={48}
          />
        )}
        {hasDoc && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center',
              'rounded-full bg-[var(--color-terracotta)] text-white text-[9px] font-medium',
            )}
            title="Has receipt"
          >
            ✦
          </span>
        )}
      </div>

      {/* Body */}
      <button
        type="button"
        onClick={() => !isProcessing && onSelect(tx)}
        disabled={isProcessing}
        className={cn(
          'text-left min-w-0',
          isProcessing ? 'cursor-default opacity-60' : 'cursor-pointer',
        )}
      >
        <p className="font-display italic font-medium text-[17px] leading-tight tracking-tight truncate">
          {tx.description}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
          {rowLabelPrefix(tx)}{formatDay(tx.date)}
          {badge && (
            <span
              className={cn(
                'ml-1',
                badge.tone === 'red' && 'text-[var(--color-stamp)]',
                badge.tone === 'green' && 'text-[color:rgb(52,168,83)]',
              )}
            >
              · {badge.label}
            </span>
          )}
        </p>
      </button>

      {/* Amount */}
      <span
        className={cn(
          'font-display italic font-medium text-[18px] tnum px-1',
          badge?.strikethrough && 'line-through opacity-60',
        )}
      >
        ${Math.abs(tx.amount).toFixed(2)}
      </span>

      {/* Row menu */}
      <div onClick={(e) => e.stopPropagation()}>
        {!isProcessing && (
          <TransactionRowMenu
            rawStatus={tx.rawStatus}
            onHardDelete={() => onHardDelete(tx.id)}
            onUnreconcile={() => onUnreconcile(tx.id)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Tombstones ───────────────────────────────────────────────── */

function TombstonePanel({
  loading,
  rows,
  onRestore,
}: {
  loading: boolean;
  rows: TombstoneRow[];
  onRestore: (id: string) => void;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)] flex items-center gap-3">
        <h3 className="font-display italic font-medium text-lg">Recently deleted</h3>
        <span className="ml-auto text-xs text-[var(--color-ink-muted)] hidden sm:block">
          Tracked locally — restore brings the receipt back.
        </span>
      </div>
      {loading ? (
        <div className="py-10 text-center">
          <p className="font-hand text-lg text-[var(--color-ink-muted)]">loading…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--color-ink-muted)]">
          No recently deleted receipts in this browser.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-rule-soft)]">
          {rows.map((t) => (
            <li
              key={t.id}
              className="px-5 py-4 flex items-center gap-3"
              data-testid={`tombstone-${t.id}`}
            >
              <div
                className="h-12 w-12 rounded-[14px] overflow-hidden flex-shrink-0"
                style={{ background: 'var(--color-paper-deep)' }}
              >
                {t.doc && (
                  <img
                    src={documentContentUrl(t.id)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.doc?.file_path?.split('/').pop() ?? t.id}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <DeletedBadge deletedAt={t.doc?.deleted_at ?? null} />
                  <code className="text-[11px] text-[var(--color-ink-muted)] truncate">{t.id}</code>
                </div>
              </div>
              <button
                data-testid={`tombstone-restore-${t.id}`}
                onClick={() => onRestore(t.id)}
                className={cn(
                  'rounded-[10px] px-3 py-2 text-xs font-medium',
                  'bg-[var(--color-terracotta)] text-white hover:bg-[var(--color-terracotta-deep)]',
                  'transition-colors flex-shrink-0',
                )}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Empty / loading shells ───────────────────────────────────── */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-12 text-center">
      {children}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function groupByWeek(txs: Transaction[]): WeekBucket[] {
  const buckets = new Map<string, WeekBucket>();
  for (const tx of txs) {
    const start = isoWeekStart(tx.date);
    if (!start) continue;
    let bucket = buckets.get(start);
    if (!bucket) {
      bucket = { startIso: start, label: weekLabel(start), total: 0, txs: [] };
      buckets.set(start, bucket);
    }
    bucket.txs.push(tx);
    bucket.total += tx.amount;
  }
  return [...buckets.values()].sort((a, b) => (a.startIso < b.startIso ? 1 : -1));
}

/** Returns the Monday of the week containing this ISO date, as YYYY-MM-DD. */
function isoWeekStart(isoDate: string): string | null {
  // Parse manually to avoid TZ shifts on bare YYYY-MM-DD.
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const local = new Date(y, m - 1, d);
  const day = local.getDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7;  // distance back to Monday
  local.setDate(local.getDate() - diff);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function weekLabel(startIso: string): string {
  const today = new Date();
  const thisWeek = isoWeekStart(toIso(today));
  if (thisWeek === startIso) return 'this week';

  const lastWeek = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return isoWeekStart(toIso(d));
  })();
  if (lastWeek === startIso) return 'last week';

  // "Week of May 5" — pulled from the Monday date.
  const [y, m, d] = startIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const monthShort = dt.toLocaleString('en-US', { month: 'short' });
  return `week of ${monthShort} ${dt.getDate()}`;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDay(isoDate: string): string {
  // "Mon · May 5" — short, no year.
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleString('en-US', { weekday: 'short' });
  const mo = dt.toLocaleString('en-US', { month: 'short' });
  return `${dow.toUpperCase()} · ${mo} ${d}`;
}

/** Build the leading "<Category> · " (or "<Type> · ") label on a row.
 *  Spending rows with a known category render the category; spending
 *  rows with no category drop the label entirely rather than fall back
 *  to "spending". Non-spending rows show the transactionType (Income /
 *  Transfer / Investment), which IS meaningful for those flows. */
function rowLabelPrefix(tx: Transaction): string {
  if (tx.category) return `${tx.category} · `;
  if (tx.transactionType !== 'spending') {
    return `${tx.transactionType.charAt(0).toUpperCase()}${tx.transactionType.slice(1)} · `;
  }
  return '';
}
