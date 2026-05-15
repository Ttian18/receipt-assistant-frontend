import { useEffect, useState } from 'react';
import {
  extractProblemMessage,
  fetchMerchant,
  fetchMerchantTransactions,
  fetchPlace,
  patchPlace,
  pickCjk,
  placeName,
  type MerchantDetailResponse,
  type MerchantTransactionRow,
  type PlaceFull,
} from '../lib/api';
import { CATEGORY_META } from '../categoryMeta';
import type { Category } from '../types';
import { cn } from '../lib/utils';
import { CategoryIcon } from './CategoryIcon';
import { statusBadge } from '../lib/transactionStatus';

interface MerchantDetailProps {
  brandId: string;
  onBack: () => void;
  onSelectReceipt?: (receiptId: string) => void;
}

export default function MerchantDetail({ brandId, onBack, onSelectReceipt }: MerchantDetailProps) {
  const [detail, setDetail] = useState<MerchantDetailResponse | null>(null);
  const [txns, setTxns] = useState<MerchantTransactionRow[] | null>(null);
  const [place, setPlace] = useState<PlaceFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMerchant(brandId),
      fetchMerchantTransactions(brandId, { limit: 100 }),
    ])
      .then(([d, t]) => {
        if (cancelled) return;
        setDetail(d);
        setTxns(t.items);
        setLoading(false);
        // Pull the linked place separately so its multilingual fields
        // are available for the name fallback chain (#74). Best-effort —
        // a missing place_id or 404 just leaves Chinese rendering off.
        const pid = d.merchant.place_id;
        if (pid) {
          fetchPlace(pid)
            .then((p) => {
              if (!cancelled) setPlace(p);
            })
            .catch(() => {
              /* ignore — Chinese subtitle just won't render */
            });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(extractProblemMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const onEditChineseName = async () => {
    if (!place) return;
    const current =
      place.custom_name_zh ?? pickCjk(place.display_name_zh) ?? '';
    const next = window.prompt(
      'Chinese name for this merchant (clear to remove override):',
      current,
    );
    if (next === null) return; // user cancelled
    try {
      const updated = await patchPlace(place.id, {
        custom_name_zh: next.trim() === '' ? null : next.trim(),
      });
      setPlace(updated);
    } catch (e) {
      window.alert(`Could not save: ${extractProblemMessage(e)}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <p className="py-16 text-center font-hand text-xl text-[var(--color-ink-muted)]">loading…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-stamp)]">
          {error || 'Merchant not found'}
        </div>
      </div>
    );
  }

  const m = detail.merchant;
  const category = (m.category as Category | null) ?? null;
  const meta = category ? CATEGORY_META[category] : null;
  const heroBg = meta?.color ?? '#C7C7CC';

  return (
    <div className="space-y-6 pb-24">
      <BackBar onBack={onBack} />

      {/* Hero */}
      <div
        className="relative rounded-[20px] overflow-hidden h-[180px] sm:h-[220px] flex items-end p-5"
        style={
          m.photo_url
            ? {
                backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%), url(${m.photo_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: heroBg }
        }
      >
        {!m.photo_url && category && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
            <CategoryIcon category={category} size={120} />
          </div>
        )}
        <div className="relative z-10">
          {category && (
            <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-white/85">
              {category}
            </p>
          )}
          <h1 className={cn(
            'font-display italic font-medium text-3xl sm:text-4xl leading-tight tracking-tight',
            m.photo_url ? 'text-white' : 'text-white',
          )}>
            {m.canonical_name}
          </h1>
          {(() => {
            // Chinese-name subtitle. Renders when the linked place has
            // any source of a non-English display name (Google zh-CN,
            // photo-OCR fallback, or user override). When the place has
            // no Chinese yet, offer an "+ add" affordance so the user
            // can supply one. Either path opens an inline prompt.
            if (!place) return null;
            const zh = place.custom_name_zh ?? pickCjk(place.display_name_zh);
            if (zh && zh === m.canonical_name) return null;
            const source = zh
              ? place.custom_name_zh
                ? 'you'
                : place.display_name_zh_source === 'photo_ocr'
                  ? 'storefront'
                  : place.display_name_zh_source === 'receipt_ocr'
                    ? 'receipt'
                    : 'Google'
              : null;
            return (
              <button
                type="button"
                onClick={onEditChineseName}
                className="mt-1 inline-flex items-center gap-2 group"
                title={zh ? `Source: ${source}. Click to edit.` : 'Add Chinese name'}
              >
                {zh ? (
                  <>
                    <span className="font-display text-lg sm:text-xl text-white/90 group-hover:text-white">
                      {zh}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.15em] text-white/60 group-hover:text-white/80">
                      ✎ {source}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.15em] text-white/55 group-hover:text-white/85">
                    + add Chinese name
                  </span>
                )}
              </button>
            );
          })()}
        </div>
        {m.photo_url && m.photo_attribution && (
          <p className="absolute right-3 bottom-2 z-10 text-[10px] text-white/70">
            {m.photo_attribution}
          </p>
        )}
      </div>

      {/* Stats strip */}
      <StatsStrip
        currentMonthMinor={detail.stats.current_month_spend_minor}
        lifetimeMinor={detail.stats.lifetime_spend_minor}
        count={detail.stats.transaction_count}
        currency={detail.stats.currency}
      />

      {/* Address (when enriched) */}
      {m.address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(m.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-4 text-sm hover:bg-[var(--color-paper-deep)]/30 transition-colors"
        >
          {m.address}
        </a>
      )}

      {/* Transaction history */}
      <div className="space-y-3">
        <h2 className="font-display italic font-medium text-xl leading-none">
          Transaction history
        </h2>
        {(!txns || txns.length === 0) ? (
          <p className="font-hand text-lg text-[var(--color-ink-muted)] py-4">
            no entries yet —
          </p>
        ) : (
          <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] divide-y divide-[var(--color-rule-soft)]">
            {txns.map((tx) => (
              <li key={tx.id}>
                <MerchantTxnRow tx={tx} onSelect={onSelectReceipt} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display italic text-lg leading-none text-[var(--color-terracotta)]">←</span>
        Ledger
      </button>
    </div>
  );
}

function StatsStrip({
  currentMonthMinor,
  lifetimeMinor,
  count,
  currency,
}: {
  currentMonthMinor: number;
  lifetimeMinor: number;
  count: number;
  currency: string;
}) {
  const fmt = (minor: number) =>
    (minor / 100).toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCell label="This month" value={fmt(currentMonthMinor)} />
      <StatCell label="All-time" value={fmt(lifetimeMinor)} />
      <StatCell label="Entries" value={String(count)} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display italic font-medium text-xl leading-none tnum">
        {value}
      </p>
    </div>
  );
}

function MerchantTxnRow({
  tx,
  onSelect,
}: {
  tx: MerchantTransactionRow;
  onSelect?: (id: string) => void;
}) {
  const badge = statusBadge(tx.status);
  const isVoided = tx.status === 'voided';
  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx.id)}
      className="w-full text-left grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 hover:bg-[var(--color-paper-deep)]/30 transition-colors"
    >
      <div className="min-w-0">
        <p className="font-display italic font-medium text-[16px] leading-tight truncate">
          {tx.payee ?? '—'}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
          {formatDay(tx.occurred_on)}
          {badge && (
            <span className={cn(
              'ml-1',
              badge.tone === 'red' && 'text-[var(--color-stamp)]',
              badge.tone === 'green' && 'text-[color:rgb(52,168,83)]',
            )}>· {badge.label}</span>
          )}
        </p>
      </div>
      <span className={cn(
        'font-display italic font-medium text-[17px] tnum',
        isVoided && 'line-through opacity-60',
      )}>
        {(tx.total_minor / 100).toLocaleString(undefined, {
          style: 'currency',
          currency: tx.currency,
          maximumFractionDigits: 2,
        })}
      </span>
    </button>
  );
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
