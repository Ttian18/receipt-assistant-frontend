import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import {
  classifyBackendCategory,
  fetchReceiptDetail,
  documentContentUrl,
  extractProblemMessage,
  getTransaction,
  postReExtractDocument,
  toReceiptView,
  voidTransaction,
  restoreDocument,
  type ReceiptView,
  type BackendTransaction,
  type ReExtractDocumentResult,
} from '../lib/api';
import { statusBadge } from '../lib/transactionStatus';
import { cn } from '../lib/utils';
import { CategoryIcon } from './CategoryIcon';
import EditReceiptModal from './EditReceiptModal';
import ConfirmActionDialog from './ConfirmActionDialog';
import DeleteReceiptDialog from './DeleteReceiptDialog';
import DeletedBadge from './DeletedBadge';
import { removeTombstone } from '../lib/tombstones';

interface ReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
  /** Navigate to the merchant aggregation page (#33). Optional so existing
   *  callers don't break; the link affordance hides when absent. */
  onSelectMerchant?: (brandId: string) => void;
  /** Bumped when a delete completes so the parent's transaction list
   *  refetches. */
  onAfterMutation?: () => void;
}

type Metadata = Record<string, unknown>;

function md<T = unknown>(meta: Metadata | undefined, key: string): T | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  return v as T | undefined;
}

/**
 * Receipt detail — single-entry view in Variant B (Soft / Organic).
 * Follows docs/2026-05-10_Mockup_frontend_redesign-B-soft.html (fig.03).
 *
 * Functional surface is unchanged from the previous Material-3 version:
 *   - Auto-polls every 5s while status is draft/error.
 *   - Edit / Void / Delete / Restore actions kept (the mockup shows just
 *     Edit + Delete; Void and Restore are conditional flows that show up
 *     for posted/reconciled and tombstoned receipts respectively).
 *   - Renders line items, location map, raw OCR text, extraction quality
 *     when those metadata sub-objects exist.
 *
 * Data source: fetchReceiptDetail → real backend. No mocks, no fixtures.
 */
export default function ReceiptDetail({ receiptId, onBack, onSelectMerchant, onAfterMutation }: ReceiptDetailProps) {
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<'edit' | 'void' | 'delete' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Re-extract state machine. `idle` armed; `pending` (~30-60s — the
  // agent re-OCRs the image); `success` shows `changed_keys` toast;
  // `error` flashes the problem-detail message. Mirrors the
  // refresh-from-source pattern on MerchantDetail.
  const [reExtractState, setReExtractState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'success'; changedKeys: string[]; ocrChanged: boolean }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const loadReceipt = () => {
    fetchReceiptDetail(receiptId)
      .then(setReceipt)
      .catch((e: unknown) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  };

  const handleUpdated = (txn: BackendTransaction, etag: string | null) => {
    setReceipt(toReceiptView(txn, etag));
  };

  const handleVoidConfirm = async (reason: string) => {
    if (!receipt?.etag) {
      const fresh = await getTransaction(receipt!.id);
      if (!fresh.etag) throw new Error('No ETag — reload and retry.');
      await voidTransaction(receipt!.id, reason, fresh.etag);
    } else {
      await voidTransaction(receipt.id, reason, receipt.etag);
    }
    setActiveDialog(null);
    loadReceipt();
    onAfterMutation?.();
  };

  const handleDeleted = () => {
    setActiveDialog(null);
    onAfterMutation?.();
    onBack();
  };

  const handleRestore = async () => {
    if (!receipt?.documentId) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreDocument(receipt.documentId);
      removeTombstone(receipt.documentId);
      onAfterMutation?.();
      loadReceipt();
    } catch (err: unknown) {
      setRestoreError(extractProblemMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  const handleReExtract = async () => {
    if (!receipt?.documentId) return;
    if (reExtractState.kind === 'pending') return;
    setReExtractState({ kind: 'pending' });
    try {
      const result: ReExtractDocumentResult = await postReExtractDocument(
        receipt.documentId,
      );
      // Reload the transaction so the UI reflects any field changes the
      // agent committed (payee, occurred_on, occurred_at, etc).
      loadReceipt();
      onAfterMutation?.();
      setReExtractState({
        kind: 'success',
        changedKeys: result.changed_keys,
        ocrChanged: result.ocr_text_changed,
      });
      setTimeout(() => {
        setReExtractState((s) =>
          s.kind === 'success' ? { kind: 'idle' } : s,
        );
      }, 6000);
    } catch (err: unknown) {
      setReExtractState({
        kind: 'error',
        message: extractProblemMessage(err),
      });
    }
  };

  useEffect(() => {
    loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  // Auto-poll while extractor is still working.
  useEffect(() => {
    if (!receipt) return;
    if (receipt.status !== 'draft' && receipt.status !== 'error') return;
    const interval = setInterval(loadReceipt, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.status]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SimpleBackBar onBack={onBack} />
        <div className="py-16 text-center">
          <p className="font-hand text-xl text-[var(--color-ink-muted)]">loading…</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="space-y-4">
        <SimpleBackBar onBack={onBack} />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-stamp)]">
          {error || 'Receipt not found'}
        </div>
      </div>
    );
  }

  // Pull extractor-stashed fields out of metadata.
  const meta = (receipt as unknown as { documents: Array<{ extraction_meta?: Metadata }> });
  const extraction = meta.documents[0]?.extraction_meta ?? undefined;
  const txMeta = (receipt.postings[0] as unknown as { metadata?: Metadata })?.metadata;
  const legacy: Metadata = { ...(txMeta ?? {}), ...(extraction ?? {}) };

  const isProcessing = receipt.status === 'draft';
  const tax = md<number>(legacy, 'tax');
  const tip = md<number>(legacy, 'tip');
  const rawText = md<string>(legacy, 'raw_text');
  const items = md<Array<{ name: string; quantity?: number; unit_price?: number; total_price?: number }>>(legacy, 'items');
  const confidence = md<number>(
    (legacy.quality as Metadata | undefined) ?? {},
    'confidence_score',
  );
  const warnings = md<string[]>(
    (legacy.quality as Metadata | undefined) ?? {},
    'warnings',
  );
  const merchantLabel = receipt.payee ?? receipt.narration ?? 'Unknown';

  const canDelete = receipt.status !== 'voided';
  const canVoid = receipt.status === 'posted' || receipt.status === 'reconciled';
  const canEdit = receipt.status !== 'voided';

  const primaryDoc = receipt.documents.find((d) => d.id === receipt.documentId) ?? receipt.documents[0];
  const docDeletedAt = (primaryDoc as { deleted_at?: string | null } | undefined)?.deleted_at ?? null;
  const isTombstoned = docDeletedAt != null;

  const badge = statusBadge(receipt.status);
  const lowConfidence = confidence != null && confidence < 0.6;

  return (
    <div className="space-y-6">
      <TopBar
        onBack={onBack}
        isTombstoned={isTombstoned}
        deletedAt={docDeletedAt}
        isProcessing={isProcessing}
        canEdit={canEdit}
        canVoid={canVoid}
        canDelete={canDelete}
        restoring={restoring}
        onEdit={() => setActiveDialog('edit')}
        onVoid={() => setActiveDialog('void')}
        onDelete={() => setActiveDialog('delete')}
        onRestore={handleRestore}
      />

      <AmountHero
        amount={receipt.total}
        currency={receipt.currency}
        merchant={isProcessing ? 'Processing…' : merchantLabel}
        occurredOn={receipt.occurred_on}
        isProcessing={isProcessing}
        voided={receipt.status === 'voided'}
        onMerchantClick={
          receipt.merchantBrandId && onSelectMerchant
            ? () => onSelectMerchant(receipt.merchantBrandId!)
            : undefined
        }
      />

      <StatusRow badge={badge} paymentMethod={receipt.paymentMethod ?? null} />

      {isProcessing && <ProcessingNote />}

      {restoreError && (
        <Banner tone="error">Restore failed: {restoreError}</Banner>
      )}

      <FieldsGrid
        category={receipt.category}
        payment={receipt.paymentMethod ?? null}
        tax={tax}
        tip={tip}
        isProcessing={isProcessing}
      />

      {!isProcessing && items && items.length > 0 && (
        <LineItemsCard items={items} />
      )}

      {receipt.narration && !isProcessing && (
        <NoteCard text={receipt.narration} />
      )}

      {/* Related Email slot — populated once Gmail integration (#34) ships.
       *  Hidden when there are no matches (no skeleton, no placeholder). */}

      {!isProcessing && receipt.documentId && (
        <OriginalReceiptCollapsible documentId={receipt.documentId} />
      )}

      {/* Re-extract affordance. Only on active (non-voided) receipts
          that have a linked document. Wall-time is ~30-60s for vision
          OCR, so we make the pending state visible. */}
      {!isProcessing &&
        receipt.documentId &&
        receipt.status !== 'voided' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleReExtract}
              disabled={reExtractState.kind === 'pending'}
              className={cn(
                'group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]',
                'text-[var(--color-ink-muted)] hover:text-[var(--color-terracotta)]',
                'transition-colors disabled:opacity-50 disabled:cursor-wait',
              )}
              title="Re-run OCR with the current model and prompt"
            >
              <span className="font-display italic text-base leading-none text-[var(--color-terracotta)] group-hover:translate-x-px transition-transform">
                ↺
              </span>
              {reExtractState.kind === 'pending'
                ? 're-extracting… (~30-60s)'
                : 'Re-extract'}
            </button>

            {reExtractState.kind === 'success' && (
              <ReExtractBanner
                tone="success"
                onDismiss={() => setReExtractState({ kind: 'idle' })}
              >
                {reExtractState.changedKeys.length === 0 && !reExtractState.ocrChanged
                  ? 'No changes — the agent produced the same output.'
                  : reExtractState.changedKeys.length === 0
                    ? 'OCR text refreshed; no transaction fields changed.'
                    : `Updated ${reExtractState.changedKeys.join(', ')}.`}
              </ReExtractBanner>
            )}
            {reExtractState.kind === 'error' && (
              <ReExtractBanner
                tone="error"
                onDismiss={() => setReExtractState({ kind: 'idle' })}
              >
                {reExtractState.message}
              </ReExtractBanner>
            )}
          </div>
        )}

      {!isProcessing && (rawText || confidence != null) && (
        <ExtractionDetailsCollapsible
          rawText={rawText}
          confidence={confidence}
          warnings={warnings}
          defaultOpen={lowConfidence}
        />
      )}

      {/* Dialogs */}
      <EditReceiptModal
        isOpen={activeDialog === 'edit'}
        onClose={() => setActiveDialog(null)}
        receipt={receipt}
        onUpdated={handleUpdated}
        onStale={loadReceipt}
      />

      <ConfirmActionDialog
        isOpen={activeDialog === 'void'}
        onClose={() => setActiveDialog(null)}
        title="Void this receipt?"
        message={
          <>
            <p>
              Voiding creates a reversing entry in the ledger — the original transaction stays,
              but its balance cancels out. Use this for posted receipts you can't simply delete.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              This action can be reversed only by creating a new offsetting transaction.
            </p>
          </>
        }
        confirmLabel="Void receipt"
        destructive
        requireReason
        reasonPlaceholder="Why are you voiding this? (optional)"
        onConfirm={handleVoidConfirm}
      />

      <DeleteReceiptDialog
        isOpen={activeDialog === 'delete'}
        onClose={() => setActiveDialog(null)}
        documentId={receipt.documentId}
        transactionId={receipt.id}
        transactionEtag={receipt.etag}
        isReconciled={receipt.status === 'reconciled'}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────── */

function SimpleBackBar({ onBack }: { onBack: () => void }) {
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

function TopBar({
  onBack,
  isTombstoned,
  deletedAt,
  isProcessing,
  canEdit,
  canVoid,
  canDelete,
  restoring,
  onEdit,
  onVoid,
  onDelete,
  onRestore,
}: {
  onBack: () => void;
  isTombstoned: boolean;
  deletedAt: string | null;
  isProcessing: boolean;
  canEdit: boolean;
  canVoid: boolean;
  canDelete: boolean;
  restoring: boolean;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div className="flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display italic text-lg leading-none text-[var(--color-terracotta)]">←</span>
        Ledger
      </button>
      <div className="flex items-center gap-3">
        {isTombstoned && <DeletedBadge deletedAt={deletedAt} />}
        {isTombstoned ? (
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] font-medium tracking-[0.14em] uppercase',
              'bg-[var(--color-terracotta)] text-white hover:bg-[var(--color-terracotta-deep)]',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        ) : (
          !isProcessing && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((s) => !s)}
                aria-label="Receipt actions"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  'border border-[var(--color-rule)] bg-[var(--color-surface)]',
                  'hover:border-[var(--color-ink)]/30 transition-colors',
                )}
              >
                <MoreHorizontal size={16} className="text-[var(--color-ink)]" />
              </button>
              {menuOpen && (
                <div
                  className={cn(
                    'absolute right-0 z-30 mt-2 min-w-[180px] p-1',
                    'rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-rule)]',
                    'shadow-[0_12px_32px_-10px_rgba(45,37,32,0.18)]',
                  )}
                >
                  <MenuItem
                    label="Edit fields"
                    disabled={!canEdit}
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  />
                  {canVoid && (
                    <MenuItem
                      label="Void receipt"
                      onClick={() => {
                        setMenuOpen(false);
                        onVoid();
                      }}
                    />
                  )}
                  <MenuItem
                    label="Delete…"
                    disabled={!canDelete}
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-left px-3 py-2 rounded-[10px] text-sm transition-colors normal-case tracking-normal',
        destructive
          ? 'text-[var(--color-stamp)] hover:bg-[var(--color-stamp)]/8'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {label}
    </button>
  );
}

function AmountHero({
  amount,
  currency,
  merchant,
  occurredOn,
  isProcessing,
  voided,
  onMerchantClick,
}: {
  amount: number;
  currency: string;
  merchant: string;
  occurredOn: string;
  isProcessing: boolean;
  voided: boolean;
  onMerchantClick?: () => void;
}) {
  const merchantClass = 'font-display italic font-medium text-2xl sm:text-3xl leading-tight';
  return (
    <div className="text-center pt-2">
      <p
        className={cn(
          'font-display italic font-medium tracking-tight tnum',
          'text-[3.25rem] sm:text-[4rem] leading-none',
          voided && 'line-through text-[var(--color-ink-muted)]',
        )}
      >
        {isProcessing ? '—' : `$${amount.toFixed(2)}`}
      </p>
      <p className="mt-1 text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {currency}
      </p>
      {onMerchantClick ? (
        <button
          type="button"
          onClick={onMerchantClick}
          className={cn(
            'mt-4 inline-flex items-baseline gap-1 transition-colors hover:text-[var(--color-terracotta)]',
            merchantClass,
          )}
        >
          {merchant}
          <span className="font-display italic text-base leading-none text-[var(--color-terracotta)]">→</span>
        </button>
      ) : (
        <h1 className={cn('mt-4', merchantClass)}>{merchant}</h1>
      )}
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
        {formatDateLong(occurredOn)}
      </p>
    </div>
  );
}

function StatusRow({
  badge,
  paymentMethod,
}: {
  badge: ReturnType<typeof statusBadge>;
  paymentMethod: string | null;
}) {
  if (!badge && !paymentMethod) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
      {badge && (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
            badge.tone === 'red' && 'bg-[var(--color-stamp)]/10 text-[var(--color-stamp)]',
            badge.tone === 'green' && 'bg-[color:rgba(52,168,83,0.12)] text-[color:rgb(52,168,83)]',
            badge.tone === 'muted' && 'bg-[var(--color-paper-deep)] text-[var(--color-ink-muted)]',
          )}
        >
          {badge.label}
        </span>
      )}
      {badge && paymentMethod && <span aria-hidden="true">·</span>}
      {paymentMethod && (
        <span>
          {paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      )}
    </div>
  );
}

function OriginalReceiptCollapsible({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display italic font-medium text-lg leading-none">
          Original receipt
        </span>
        {open ? <ChevronDown size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronRight size={18} className="text-[var(--color-ink-muted)]" />}
      </button>
      {open && (
        <div
          className="p-4"
          style={{
            background:
              'linear-gradient(180deg, rgba(245, 230, 195, 0.4) 0%, rgba(201, 123, 92, 0.06) 100%), var(--color-surface)',
          }}
        >
          <img
            src={documentContentUrl(documentId)}
            alt="Receipt"
            className="block max-w-full max-h-[500px] object-contain mx-auto rounded-[10px]"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

function NoteCard({ text }: { text: string }) {
  return (
    <div
      className="relative rounded-[16px] px-4 py-4 leading-snug"
      style={{ background: 'var(--color-butter)' }}
    >
      <span
        className={cn(
          'absolute -top-2 left-4 inline-block rounded-full px-2 py-[3px]',
          'bg-[var(--color-terracotta)] text-white',
          'text-[10px] font-medium tracking-[0.16em] uppercase',
        )}
      >
        your note
      </span>
      <p className="font-hand text-lg text-[var(--color-ink)]">{text}</p>
    </div>
  );
}

function FieldsGrid({
  category,
  payment,
  tax,
  tip,
  isProcessing,
}: {
  category: string | null;
  payment: string | null;
  tax: number | undefined;
  tip: number | undefined;
  isProcessing: boolean;
}) {
  if (isProcessing) return null;
  const cells: React.ReactNode[] = [];
  if (tax != null && tax > 0) {
    cells.push(<SmallFieldCard key="tax" label="Tax" value={`$${tax.toFixed(2)}`} numeric />);
  }
  if (tip != null && tip > 0) {
    cells.push(<SmallFieldCard key="tip" label="Tip" value={`$${tip.toFixed(2)}`} numeric />);
  }
  if (payment) {
    cells.push(
      <SmallFieldCard
        key="payment"
        label="Payment"
        value={payment.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      />,
    );
  }
  if (category) {
    cells.push(<CategoryFieldCard key="category" rawCategory={category} />);
  }
  if (cells.length === 0) return null;
  return <div className="grid grid-cols-2 gap-3">{cells}</div>;
}

function CategoryFieldCard({ rawCategory }: { rawCategory: string }) {
  const { category, transactionType } = classifyBackendCategory(rawCategory);
  const label = category ?? (transactionType === 'spending' ? 'Uncategorized' : transactionType);
  return (
    <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        Category
      </p>
      <div className="mt-1 flex items-center gap-2">
        <CategoryIcon category={category} transactionType={transactionType} size={22} />
        <span className="text-[15px] font-medium capitalize">{label}</span>
      </div>
    </div>
  );
}

function SmallFieldCard({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[15px] font-medium',
          numeric && 'font-display italic font-medium text-lg tnum',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LineItemsCard({
  items,
}: {
  items: Array<{ name: string; quantity?: number; unit_price?: number; total_price?: number }>;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)]">
        <h3 className="font-display italic font-medium text-lg leading-none">
          Items <span className="text-[var(--color-ink-muted)]">({items.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-[var(--color-rule-soft)]">
        {items.map((item, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 px-5 py-3"
          >
            <span className="text-sm font-medium truncate">{item.name}</span>
            <span className="text-xs text-[var(--color-ink-muted)] tnum">
              {item.quantity ?? 1}×
            </span>
            <span className="font-display italic font-medium text-base tnum">
              {item.total_price != null ? `$${item.total_price.toFixed(2)}` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtractionDetailsCollapsible({
  rawText,
  confidence,
  warnings,
  defaultOpen,
}: {
  rawText: string | undefined;
  confidence: number | undefined;
  warnings: string[] | undefined;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isLow = confidence != null && confidence < 0.6;
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display italic font-medium text-lg leading-none">
          Extraction details
        </span>
        <span className="flex items-center gap-2">
          {confidence != null && (
            <span
              className={cn(
                'text-[11px] tracking-[0.12em] uppercase',
                isLow ? 'text-[var(--color-stamp)]' : 'text-[var(--color-ink-muted)]',
              )}
            >
              {(confidence * 100).toFixed(0)}% confidence
            </span>
          )}
          {open ? <ChevronDown size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronRight size={18} className="text-[var(--color-ink-muted)]" />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {warnings && warnings.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-[var(--color-stamp)]/10 text-[var(--color-stamp)] text-[10px] tracking-[0.08em] uppercase"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
          {rawText && (
            <pre className="text-xs text-[var(--color-ink-muted)] whitespace-pre-wrap font-mono">
              {rawText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessingNote() {
  return (
    <div
      className={cn(
        'rounded-[16px] px-4 py-4 flex items-start gap-3',
        'border border-[var(--color-rule)] bg-[var(--color-butter)]/40',
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-terracotta)] animate-pulse"
      />
      <div>
        <p className="font-display italic font-medium">Still reading your receipt</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Claude is extracting fields — this page will refresh on its own.
        </p>
      </div>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'error';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] px-4 py-3 text-sm',
        tone === 'error'
          ? 'border border-[var(--color-stamp)]/30 bg-[var(--color-stamp)]/5 text-[var(--color-stamp)]'
          : '',
      )}
    >
      {children}
    </div>
  );
}

/**
 * Feedback banner for re-extract. Mirrors the RefreshBanner pattern
 * in MerchantDetail — same aesthetic, separate copy to avoid pulling
 * a tiny presentational helper across the file boundary. If a third
 * surface needs the same widget, factor it out then.
 */
function ReExtractBanner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error';
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-[14px] px-4 py-3 text-sm',
        tone === 'success' &&
          'border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/8 text-[var(--color-ink)]',
        tone === 'error' &&
          'border border-[var(--color-stamp)]/40 bg-[var(--color-stamp)]/5 text-[var(--color-stamp)]',
      )}
    >
      <p className="font-hand text-base leading-snug">{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[11px] uppercase tracking-[0.16em] opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        dismiss
      </button>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function formatDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
