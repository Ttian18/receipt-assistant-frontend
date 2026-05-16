import React, { useEffect, useState } from 'react';
import { ChevronRight, ArrowLeft, Lock, Globe } from 'lucide-react';
import {
  listBrands,
  getBrand,
  patchBrand,
  listBrandAssets,
  extractProblemMessage,
  type BackendBrand,
  type BackendBrandAsset,
} from '../lib/api';
import { cn } from '../lib/utils';

/**
 * Brands page (#101 Phase 1). Brand layer + multi-candidate icon assets.
 *
 * Phase 1 surfaces only:
 *  - Browse all brands (global, workspace-agnostic).
 *  - View each brand's candidate icon assets (`brand_assets`).
 *  - Pick a `preferred_asset_id` → stamps `user_chose_at`, which Layer-3
 *    locks against re-extract overrides.
 *
 * Phase 2 (deferred) will plug in agent acquisition (iTunes / svgl /
 * logo.dev / simple_icons sources) and `GET /v1/brands/:id/icon`
 * streaming — right now that endpoint returns 501 so we display the
 * asset's `source_url` / `local_path` instead of an `<img>` for now.
 */

interface BrandsProps {
  onBack: () => void;
}

export default function Brands({ onBack }: BrandsProps) {
  const [brands, setBrands] = useState<BackendBrand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    listBrands()
      .then(setBrands)
      .catch((e: unknown) => setError(extractProblemMessage(e)));
  }, []);

  if (selected) {
    return (
      <BrandDetail
        brandId={selected}
        onBack={() => setSelected(null)}
        onPatched={(b) => {
          // Update the cached list in-place so the locked indicator
          // refreshes without a roundtrip.
          setBrands((prev) =>
            prev ? prev.map((x) => (x.brand_id === b.brand_id ? b : x)) : prev,
          );
        }}
      />
    );
  }

  const filtered = brands?.filter((b) =>
    search.trim() === ''
      ? true
      : b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.brand_id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <BackBar onBack={onBack} title="Brands" subtitle="Global brand registry + icon asset picker (#101 Phase 1)" />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search brands by name or id…"
        className="w-full px-4 py-2.5 rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-ink)]"
      />

      {error && (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {brands === null && !error && (
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          Loading…
        </div>
      )}

      {brands && filtered && filtered.length === 0 && (
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          {search.trim() ? 'No brands match that search.' : 'No brands yet.'}
        </div>
      )}

      {brands && filtered && filtered.length > 0 && (
        <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-rule-soft)]">
          {filtered.map((b) => (
            <li key={b.brand_id}>
              <button
                onClick={() => setSelected(b.brand_id)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{b.name}</span>
                    {b.user_chose_at && (
                      <Lock size={11} className="text-[var(--color-ink-muted)]" aria-label="locked by user" />
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)] tnum truncate">
                    {b.brand_id}
                    {b.domain && (
                      <>
                        <span className="mx-1.5">·</span>
                        {b.domain}
                      </>
                    )}
                  </div>
                </div>
                {b.preferred_asset_id ? (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                    asset set
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-stone-400">
                    no asset
                  </span>
                )}
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

const TIER_LABEL: Record<BackendBrandAsset['tier'], string> = {
  itunes: 'iTunes',
  svgl: 'SVGL',
  logo_dev: 'logo.dev',
  simple_icons: 'Simple Icons',
  user_upload: 'User upload',
  manual_url: 'Manual URL',
};

const TIER_BADGE: Record<BackendBrandAsset['tier'], string> = {
  itunes: 'bg-rose-50 text-rose-900',
  svgl: 'bg-violet-50 text-violet-900',
  logo_dev: 'bg-emerald-50 text-emerald-900',
  simple_icons: 'bg-stone-100 text-stone-700',
  user_upload: 'bg-amber-50 text-amber-900',
  manual_url: 'bg-sky-50 text-sky-900',
};

function BrandDetail({
  brandId,
  onBack,
  onPatched,
}: {
  brandId: string;
  onBack: () => void;
  onPatched: (b: BackendBrand) => void;
}) {
  const [brand, setBrand] = useState<BackendBrand | null>(null);
  const [assets, setAssets] = useState<BackendBrandAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = () => {
    Promise.all([getBrand(brandId), listBrandAssets(brandId)])
      .then(([b, a]) => {
        setBrand(b);
        setAssets(a);
      })
      .catch((e: unknown) => setError(extractProblemMessage(e)));
  };

  useEffect(loadAll, [brandId]);

  const setPreferred = async (assetId: string | null) => {
    if (!brand) return;
    setBusy(assetId ?? 'clear');
    setBanner(null);
    try {
      const updated = await patchBrand(brand.brand_id, { preferred_asset_id: assetId });
      setBrand(updated);
      onPatched(updated);
      setBanner({
        tone: 'ok',
        text: assetId
          ? 'Preferred asset set — locked from re-extract overrides.'
          : 'Preferred asset cleared.',
      });
    } catch (e: unknown) {
      setBanner({ tone: 'err', text: extractProblemMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title="Brand" />
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          {error}
        </div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} title="Brand" />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-ink-muted)]">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackBar onBack={onBack} title="Brand" />

      <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display italic font-medium text-2xl leading-tight">{brand.name}</h2>
          {brand.user_chose_at && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">
              <Lock size={11} /> locked
            </span>
          )}
        </div>
        <div className="text-[12px] text-[var(--color-ink-muted)] tnum">{brand.brand_id}</div>
        {brand.domain && (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink-muted)]">
            <Globe size={11} />
            <a
              href={`https://${brand.domain}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {brand.domain}
            </a>
          </div>
        )}
        {brand.parent_id && (
          <div className="text-[12px] text-[var(--color-ink-muted)]">
            parent: <span className="tnum">{brand.parent_id}</span>
          </div>
        )}
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

      <Section title={`Candidate assets (${assets?.length ?? 0})`}>
        <p className="text-[12px] text-[var(--color-ink-muted)] mb-3">
          Pick one to set <code className="tnum">preferred_asset_id</code> — re-extract will respect your choice.
          Icon streaming (<code className="tnum">GET /v1/brands/:id/icon</code>) is a 501 stub in Phase 1; we
          display the raw asset metadata until Phase 2 lands.
        </p>

        {assets === null && (
          <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
        )}

        {assets && assets.length === 0 && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No candidate assets yet. Phase 2 will populate via agent acquisition (iTunes / SVGL / logo.dev / Simple Icons).
          </p>
        )}

        {assets && assets.length > 0 && (
          <ul className="space-y-2">
            {assets.map((a) => {
              const isPreferred = a.id === brand.preferred_asset_id;
              return (
                <li
                  key={a.id}
                  className={cn(
                    'rounded-[14px] border px-4 py-3 flex items-start gap-3',
                    isPreferred
                      ? 'border-[var(--color-ink)] bg-[var(--color-paper-deep)]/40'
                      : 'border-[var(--color-rule)] bg-[var(--color-surface)]',
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none', TIER_BADGE[a.tier])}>
                        {TIER_LABEL[a.tier]}
                      </span>
                      {a.user_uploaded && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                          user-uploaded
                        </span>
                      )}
                      {a.retired_at && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-stamp)]">
                          retired
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-muted)] tnum break-all">
                      {a.source_url ?? a.local_path}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-muted)] tnum">
                      {a.content_type}
                      {a.width != null && a.height != null && ` · ${a.width}×${a.height}`}
                      {a.bytes != null && ` · ${(a.bytes / 1024).toFixed(1)}kb`}
                      {a.agent_relevance != null && ` · agent rel. ${a.agent_relevance.toFixed(2)}`}
                    </div>
                    {a.agent_notes && (
                      <div className="text-[11px] italic text-[var(--color-ink-muted)]">{a.agent_notes}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setPreferred(isPreferred ? null : a.id)}
                    disabled={busy !== null}
                    className={cn(
                      'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors disabled:opacity-40',
                      isPreferred
                        ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                        : 'border border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                    )}
                  >
                    {busy === a.id ? '…' : isPreferred ? 'Preferred' : 'Pick'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
