import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import {
  DATE_PRESET_LABEL,
  DEFAULT_SORT_ID,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  resolveSort,
  type DatePreset,
  type FilterState,
} from '../lib/transactionsFilterState';
import {
  CATEGORIES,
  TRANSACTION_TYPES,
  type Category,
  type RawTransactionStatus,
  type TransactionType,
} from '../types';
import { CategoryIcon } from './CategoryIcon';

/** Closes the popover when a click lands outside the wrapped element. */
function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onAway();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onAway]);
  return ref;
}

interface TransactionsFiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  hasActiveFilter: boolean;
  onClear: () => void;
  showDeleted: boolean;
  onToggleShowDeleted: () => void;
  sortId: string;
  onSortChange: (id: string) => void;
}

/**
 * Filter chip row + collapsible "fine-tune" panel for the Ledger page.
 * Variant B styling — paper surface, terracotta active, no icons.
 *
 * Behavior is unchanged from the previous Material-3 version. All test IDs
 * are preserved.
 */
export default function TransactionsFilters({
  filters,
  onChange,
  hasActiveFilter,
  onClear,
  showDeleted,
  onToggleShowDeleted,
  sortId,
  onSortChange,
}: TransactionsFiltersProps) {
  const [openPopover, setOpenPopover] = useState<'date' | 'type' | 'category' | 'sort' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const dateRef = useClickAway(() => setOpenPopover((p) => (p === 'date' ? null : p)));
  const typeRef = useClickAway(() => setOpenPopover((p) => (p === 'type' ? null : p)));
  const categoryRef = useClickAway(() => setOpenPopover((p) => (p === 'category' ? null : p)));
  const sortRef = useClickAway(() => setOpenPopover((p) => (p === 'sort' ? null : p)));

  const activeSort = resolveSort(sortId);

  const dateLabel =
    filters.datePreset === 'custom'
      ? filters.customFrom || filters.customTo
        ? `${filters.customFrom || '…'} → ${filters.customTo || '…'}`
        : 'Custom range'
      : DATE_PRESET_LABEL[filters.datePreset];

  const categoryLabel =
    filters.categories.length === 0
      ? 'All'
      : filters.categories.length === 1
        ? filters.categories[0]
        : `${filters.categories.length} selected`;

  const typeLabel =
    filters.transactionTypes.length === 0
      ? 'All'
      : filters.transactionTypes.length === 1
        ? filters.transactionTypes[0]
        : `${filters.transactionTypes.length} selected`;

  const toggleCategory = (c: Category) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(c)
        ? filters.categories.filter((x) => x !== c)
        : [...filters.categories, c],
    });
  };

  const toggleTransactionType = (t: TransactionType) => {
    onChange({
      ...filters,
      transactionTypes: filters.transactionTypes.includes(t)
        ? filters.transactionTypes.filter((x) => x !== t)
        : [...filters.transactionTypes, t],
    });
  };

  // Hide the category chip when transactionTypes filter is set but excludes
  // 'spending' — categories only apply to spending rows.
  const showCategoryChip =
    filters.transactionTypes.length === 0 || filters.transactionTypes.includes('spending');

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Date chip */}
        <div ref={dateRef} className="relative">
          <Chip
            data-testid="filter-date"
            active={filters.datePreset !== 'all'}
            onClick={() => setOpenPopover((p) => (p === 'date' ? null : 'date'))}
          >
            <span className="text-[var(--color-ink-muted)] mr-1">Date:</span>
            {dateLabel}
          </Chip>
          {openPopover === 'date' && (
            <Popover testid="filter-date-popover">
              {(Object.keys(DATE_PRESET_LABEL) as DatePreset[]).map((preset) => (
                <button
                  type="button"
                  key={preset}
                  data-testid={`filter-date-${preset}`}
                  onClick={() => {
                    onChange({ ...filters, datePreset: preset });
                    if (preset !== 'custom') setOpenPopover(null);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-[10px] text-sm transition-colors',
                    filters.datePreset === preset
                      ? 'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta-deep)] font-medium'
                      : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                  )}
                >
                  {DATE_PRESET_LABEL[preset]}
                </button>
              ))}
              {filters.datePreset === 'custom' && (
                <div className="mt-2 pt-3 border-t border-[var(--color-rule)] px-1 space-y-2">
                  <label className="block text-xs text-[var(--color-ink-muted)]">
                    From
                    <input
                      type="date"
                      data-testid="filter-date-custom-from"
                      value={filters.customFrom}
                      onChange={(e) => onChange({ ...filters, customFrom: e.target.value })}
                      className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)]"
                    />
                  </label>
                  <label className="block text-xs text-[var(--color-ink-muted)]">
                    To
                    <input
                      type="date"
                      data-testid="filter-date-custom-to"
                      value={filters.customTo}
                      onChange={(e) => onChange({ ...filters, customTo: e.target.value })}
                      className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)]"
                    />
                  </label>
                </div>
              )}
            </Popover>
          )}
        </div>

        {/* Transaction type chip */}
        <div ref={typeRef} className="relative">
          <Chip
            data-testid="filter-type"
            active={filters.transactionTypes.length > 0}
            onClick={() => setOpenPopover((p) => (p === 'type' ? null : 'type'))}
          >
            <span className="text-[var(--color-ink-muted)] mr-1">Type:</span>
            {typeLabel}
          </Chip>
          {openPopover === 'type' && (
            <Popover testid="filter-type-popover">
              {TRANSACTION_TYPES.map((t) => {
                const checked = filters.transactionTypes.includes(t);
                return (
                  <label
                    key={t}
                    data-testid={`filter-type-${t}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm cursor-pointer transition-colors capitalize',
                      checked
                        ? 'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta-deep)]'
                        : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTransactionType(t)}
                      className="accent-[var(--color-terracotta)]"
                    />
                    {t}
                  </label>
                );
              })}
              {filters.transactionTypes.length > 0 && (
                <button
                  type="button"
                  data-testid="filter-type-clear"
                  onClick={() => onChange({ ...filters, transactionTypes: [] })}
                  className={cn(
                    'w-full mt-1 px-3 py-2 rounded-[10px] text-xs',
                    'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                    'transition-colors',
                  )}
                >
                  Clear type selection
                </button>
              )}
            </Popover>
          )}
        </div>

        {/* Category chip — hidden when transactionTypes excludes 'spending' */}
        {showCategoryChip && (
          <div ref={categoryRef} className="relative">
            <Chip
              data-testid="filter-category"
              active={filters.categories.length > 0}
              onClick={() => setOpenPopover((p) => (p === 'category' ? null : 'category'))}
            >
              <span className="text-[var(--color-ink-muted)] mr-1">Category:</span>
              {categoryLabel}
            </Chip>
            {openPopover === 'category' && (
              <Popover testid="filter-category-popover">
                <div className="max-h-72 overflow-y-auto">
                  {CATEGORIES.map((c) => {
                    const checked = filters.categories.includes(c);
                    return (
                      <label
                        key={c}
                        data-testid={`filter-category-${c}`}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm cursor-pointer transition-colors',
                          checked
                            ? 'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta-deep)]'
                            : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(c)}
                          className="accent-[var(--color-terracotta)]"
                        />
                        <CategoryIcon category={c} size={20} />
                        {c}
                      </label>
                    );
                  })}
                </div>
                {filters.categories.length > 0 && (
                  <button
                    type="button"
                    data-testid="filter-category-clear"
                    onClick={() => onChange({ ...filters, categories: [] })}
                    className={cn(
                      'w-full mt-1 px-3 py-2 rounded-[10px] text-xs',
                      'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                      'transition-colors',
                    )}
                  >
                    Clear category selection
                  </button>
                )}
              </Popover>
            )}
          </div>
        )}

        {/* Sort chip — view config, not a filter, so it lives outside FilterState
            and isn't reset by "clear all". */}
        <div ref={sortRef} className="relative">
          <Chip
            data-testid="filter-sort"
            active={sortId !== DEFAULT_SORT_ID}
            onClick={() => setOpenPopover((p) => (p === 'sort' ? null : 'sort'))}
          >
            <span className="text-[var(--color-ink-muted)] mr-1">Sort:</span>
            {activeSort.chipLabel}
          </Chip>
          {openPopover === 'sort' && (
            <Popover testid="filter-sort-popover">
              {SORT_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  data-testid={`filter-sort-${opt.id}`}
                  onClick={() => {
                    onSortChange(opt.id);
                    setOpenPopover(null);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-[10px] text-sm transition-colors',
                    sortId === opt.id
                      ? 'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta-deep)] font-medium'
                      : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </Popover>
          )}
        </div>

        <Chip
          data-testid="toggle-show-deleted"
          active={showDeleted}
          onClick={onToggleShowDeleted}
          variant={showDeleted ? 'stamp' : 'default'}
        >
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </Chip>

        {hasActiveFilter && (
          <button
            type="button"
            data-testid="filter-clear-all"
            onClick={onClear}
            className="font-hand text-base text-[var(--color-terracotta)] hover:text-[var(--color-terracotta-deep)] px-2"
          >
            clear all ×
          </button>
        )}

        <button
          type="button"
          data-testid="filter-more-toggle"
          onClick={() => setMoreOpen((s) => !s)}
          className={cn(
            'ml-auto font-hand text-lg leading-none',
            moreOpen ? 'text-[var(--color-ink)]' : 'text-[var(--color-terracotta)] hover:text-[var(--color-terracotta-deep)]',
          )}
        >
          {moreOpen ? 'hide' : 'fine-tune ↗'}
        </button>
      </div>

      {moreOpen && (
        <div
          data-testid="filter-more-panel"
          className={cn(
            'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4',
            'rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)]',
          )}
        >
          <FieldLabel label="Status">
            <select
              data-testid="filter-status"
              value={filters.status ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  status:
                    e.target.value === ''
                      ? undefined
                      : (e.target.value as RawTransactionStatus),
                })
              }
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)]"
            >
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldLabel>

          <FieldLabel label="Payee contains">
            <input
              type="text"
              data-testid="filter-payee"
              value={filters.payeeContains}
              onChange={(e) => onChange({ ...filters, payeeContains: e.target.value })}
              placeholder="e.g. Costco"
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
            />
          </FieldLabel>

          <FieldLabel label="Min amount ($)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              data-testid="filter-amount-min"
              value={filters.amountMinDollars}
              onChange={(e) => onChange({ ...filters, amountMinDollars: e.target.value })}
              placeholder="0.00"
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
            />
          </FieldLabel>

          <FieldLabel label="Max amount ($)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              data-testid="filter-amount-max"
              value={filters.amountMaxDollars}
              onChange={(e) => onChange({ ...filters, amountMaxDollars: e.target.value })}
              placeholder="0.00"
              className="mt-1 w-full bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[10px] px-2 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
            />
          </FieldLabel>
        </div>
      )}
    </>
  );
}

/* ── Tiny presentational primitives ──────────────────────────── */

function Chip({
  children,
  active,
  onClick,
  variant = 'default',
  ...rest
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  variant?: 'default' | 'stamp';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-medium border transition-colors',
        active
          ? variant === 'stamp'
            ? 'bg-[var(--color-stamp)]/10 border-[var(--color-stamp)]/30 text-[var(--color-stamp)]'
            : 'bg-[var(--color-ink)] border-[var(--color-ink)] text-[var(--color-paper)]'
          : 'bg-[var(--color-surface)] border-[var(--color-rule)] text-[var(--color-ink)] hover:border-[var(--color-ink)]/30',
      )}
    >
      {children}
    </button>
  );
}

function Popover({
  testid,
  children,
}: {
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      className={cn(
        'absolute z-30 mt-2 left-0 min-w-[240px] p-2',
        'rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-rule)]',
        'shadow-[0_12px_32px_-10px_rgba(45,37,32,0.18)]',
      )}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
