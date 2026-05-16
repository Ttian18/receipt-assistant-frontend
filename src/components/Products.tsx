import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ArrowLeft, RotateCw, GitMerge } from 'lucide-react';
import {
  listProducts,
  getProduct,
  patchProduct,
  mergeProductInto,
  recomputeProduct,
  listOwnedItems,
  extractProblemMessage,
  type BackendProduct,
  type BackendOwnedItem,
} from '../lib/api';
import { cn } from '../lib/utils';

/**
 * Products page (#84). Catalog SSOT — every line item with an extracted
 * normalized name is aggregated here, with `purchase_count` and
 * `total_spent_minor` recomputed from `transaction_items`.
 *
 * Surfaces:
 *  - Filter by item_class.
 *  - Search by canonical / custom name.
 *  - Detail: aggregates, owned_items list, edit custom_name / notes,
 *    Merge into another product, Recompute stats.
 */

type ProductClass = BackendProduct['item_class'];

const CLASSES: Array<{ value: ProductClass | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'durable', label: 'Durable' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'food_drink', label: 'Food & drink' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
];

const CLASS_BADGE: Record<ProductClass, string> = {
  durable: 'bg-[var(--color-paper-deep)] text-[var(--color-ink)]',
  consumable: 'bg-amber-50 text-amber-900',
  food_drink: 'bg-rose-50 text-rose-900',
  service: 'bg-sky-50 text-sky-900',
  other: 'bg-stone-100 text-stone-700',
};

function formatMinor(minor: number, currency: string = 'USD'): string {
  const sym = currency === 'USD' ? '$' : '';
  return `${sym}${(minor / 100).toFixed(2)}`;
}

interface ProductsProps {
  onBack: () => void;
}

export default function Products({ onBack }: ProductsProps) {
  const [klass, setKlass] = useState<ProductClass | 'all'>('all');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<BackendProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setProducts(null);
    setError(null);
    listProducts({
      class: klass === 'all' ? undefined : klass,
      search: search.trim() || undefined,
      limit: 100,
    })
      .then(setProducts)
      .catch((e: unknown) => setError(extractProblemMessage(e)));
  }, [klass, search]);

  if (selectedId) {
    return (
      <ProductDetail
        productId={selectedId}
        onBack={() => setSelectedId(null)}
        onMerged={() => {
          setSelectedId(null);
          // Trigger refetch by twiddling the filter (cheap idempotent).
          setProducts(null);
          listProducts({ class: klass === 'all' ? undefined : klass, limit: 100 })
            .then(setProducts)
            .catch((e: unknown) => setError(extractProblemMessage(e)));
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <BackBar onBack={onBack} title="Products" subtitle="Catalog SSOT — aggregated from receipt line items" />

      <div className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full px-4 py-2.5 rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-ink)]"
        />
        <div className="flex flex-wrap gap-2">
          {CLASSES.map((c) => (
            <button
              key={c.value}
              onClick={() => setKlass(c.value)}
              className={cn(
                'px-3 py-1 rounded-full text-[12px] font-medium transition-colors',
                klass === c.value
                  ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                  : 'bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {products === null && !error && (
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          Loading…
        </div>
      )}

      {products && products.length === 0 && (
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          No products yet. Upload receipts with extracted line items to populate the catalog.
        </div>
      )}

      {products && products.length > 0 && (
        <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-rule-soft)]">
          {products.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {p.custom_name || p.canonical_name}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none',
                        CLASS_BADGE[p.item_class],
                      )}
                    >
                      {p.item_class.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--color-ink-muted)] tnum">
                    {p.purchase_count}× · spent {formatMinor(p.total_spent_minor)}
                    {p.last_purchased_on && ` · last ${p.last_purchased_on}`}
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--color-ink-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────

function ProductDetail({
  productId,
  onBack,
  onMerged,
}: {
  productId: string;
  onBack: () => void;
  onMerged: () => void;
}) {
  const [product, setProduct] = useState<BackendProduct | null>(null);
  const [owned, setOwned] = useState<BackendOwnedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');
  const [editDirty, setEditDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = () => {
    Promise.all([getProduct(productId), listOwnedItems({ product_id: productId, limit: 50 })])
      .then(([p, o]) => {
        setProduct(p);
        setOwned(o);
        setCustomName(p.custom_name ?? '');
        setNotes(p.notes ?? '');
        setEditDirty(false);
      })
      .catch((e: unknown) => setError(extractProblemMessage(e)));
  };

  useEffect(loadAll, [productId]);

  const onSave = async () => {
    if (!product) return;
    setSaving(true);
    setBanner(null);
    try {
      const patch: { custom_name?: string | null; notes?: string | null } = {};
      if (customName !== (product.custom_name ?? '')) {
        patch.custom_name = customName.trim() === '' ? null : customName.trim();
      }
      if (notes !== (product.notes ?? '')) {
        patch.notes = notes.trim() === '' ? null : notes.trim();
      }
      const updated = await patchProduct(product.id, patch);
      setProduct(updated);
      setEditDirty(false);
      setBanner({ tone: 'ok', text: 'Saved.' });
    } catch (e: unknown) {
      setBanner({ tone: 'err', text: extractProblemMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const onMerge = async () => {
    const target = mergeTarget.trim();
    if (!target || !product) return;
    setMergeBusy(true);
    setBanner(null);
    try {
      const r = await mergeProductInto(product.id, target);
      setBanner({
        tone: 'ok',
        text: `Merged → moved ${r.moved_transaction_items} line items, ${r.moved_owned_items} owned items.`,
      });
      setMergeTarget('');
      setTimeout(onMerged, 800);
    } catch (e: unknown) {
      setBanner({ tone: 'err', text: extractProblemMessage(e) });
    } finally {
      setMergeBusy(false);
    }
  };

  const onRecompute = async () => {
    if (!product) return;
    setRecomputing(true);
    setBanner(null);
    try {
      const r = await recomputeProduct(product.id);
      setProduct({ ...product, purchase_count: r.purchase_count, total_spent_minor: r.total_spent_minor, first_purchased_on: r.first_purchased_on, last_purchased_on: r.last_purchased_on });
      setBanner({ tone: 'ok', text: `Recomputed: ${r.purchase_count}× / ${formatMinor(r.total_spent_minor)}.` });
    } catch (e: unknown) {
      setBanner({ tone: 'err', text: extractProblemMessage(e) });
    } finally {
      setRecomputing(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title="Product" />
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          {error}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title="Product" />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackBar onBack={onBack} title="Product" />

      <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display italic font-medium text-2xl leading-tight">
            {product.custom_name || product.canonical_name}
          </h2>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', CLASS_BADGE[product.item_class])}>
            {product.item_class.replace('_', ' ')}
          </span>
        </div>
        {product.custom_name && product.canonical_name && product.custom_name !== product.canonical_name && (
          <p className="text-[12px] text-[var(--color-ink-muted)]">canonical: {product.canonical_name}</p>
        )}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <Stat label="Purchases" value={String(product.purchase_count)} />
          <Stat label="Total spent" value={formatMinor(product.total_spent_minor)} />
          <Stat label="Last on" value={product.last_purchased_on ?? '—'} />
        </div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)] pt-1">
          product_key: <span className="tnum">{product.product_key}</span>
        </p>
      </div>

      {banner && (
        <div
          className={cn(
            'rounded-[14px] px-4 py-3 text-sm',
            banner.tone === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-rose-200 bg-rose-50 text-rose-900',
          )}
        >
          {banner.text}
        </div>
      )}

      <Section title="Customize">
        <label className="block text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
          Custom name (your label)
        </label>
        <input
          type="text"
          value={customName}
          onChange={(e) => {
            setCustomName(e.target.value);
            setEditDirty(true);
          }}
          placeholder={product.canonical_name}
          className="mt-1 w-full px-4 py-2 rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-ink)]"
        />
        <label className="block text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)] mt-3">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setEditDirty(true);
          }}
          rows={2}
          className="mt-1 w-full px-4 py-2 rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-ink)]"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={onSave}
            disabled={!editDirty || saving}
            className="px-4 py-2 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] text-sm font-medium disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="px-4 py-2 rounded-full border border-[var(--color-rule)] text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <RotateCw size={14} /> {recomputing ? 'Recomputing…' : 'Recompute stats'}
          </button>
        </div>
      </Section>

      <Section title={`Owned items (${owned?.length ?? 0})`}>
        {owned === null && (
          <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
        )}
        {owned && owned.length === 0 && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No physical instances tracked. Owned items are auto-created from receipt lines tagged as durable.
          </p>
        )}
        {owned && owned.length > 0 && (
          <ul className="divide-y divide-[var(--color-rule-soft)] -mx-5">
            {owned.map((o) => (
              <li key={o.id} className="px-5 py-2.5 grid grid-cols-[1fr_auto] items-baseline gap-3">
                <div className="min-w-0">
                  <div className="text-sm">
                    {o.location ?? <span className="text-[var(--color-ink-muted)]">no location</span>}
                    {o.serial_number && (
                      <span className="ml-2 text-[11px] text-[var(--color-ink-muted)] tnum">
                        s/n {o.serial_number}
                      </span>
                    )}
                    {o.condition && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                        {o.condition}
                      </span>
                    )}
                  </div>
                  {(o.acquired_on || o.warranty_until) && (
                    <div className="text-[11px] text-[var(--color-ink-muted)]">
                      {o.acquired_on && `acquired ${o.acquired_on}`}
                      {o.acquired_on && o.warranty_until && ' · '}
                      {o.warranty_until && `warranty → ${o.warranty_until}`}
                    </div>
                  )}
                </div>
                {o.retired_at && (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-stamp)]">
                    retired
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Merge into another product">
        <p className="text-[12px] text-[var(--color-ink-muted)] mb-2">
          Re-points all transaction_items and owned_items to the target, retires this product, recomputes the target. Cannot be undone (but you can manually re-add).
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            placeholder="Target product UUID"
            className="flex-1 px-4 py-2 rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] text-sm tnum focus:outline-none focus:border-[var(--color-ink)]"
          />
          <button
            onClick={onMerge}
            disabled={!mergeTarget.trim() || mergeBusy}
            className="px-4 py-2 rounded-full bg-[var(--color-stamp)]/10 text-[var(--color-stamp)] border border-[var(--color-stamp)]/20 text-sm font-medium flex items-center gap-1.5 disabled:opacity-40"
          >
            <GitMerge size={14} /> {mergeBusy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </Section>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────

function BackBar({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[12px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <h1 className="font-display italic font-medium text-3xl tracking-tight">{title}</h1>
      {subtitle && <p className="text-[13px] text-[var(--color-ink-muted)]">{subtitle}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-4">
      <h3 className="font-display italic font-medium text-lg leading-none mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-0.5 font-display italic font-medium text-lg tnum">{value}</p>
    </div>
  );
}
