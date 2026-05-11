import React, { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp, Loader2, PieChart as PieIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  extractProblemMessage,
  getCashflowReport,
  getSummaryReport,
  getTrendsReport,
  type BackendCashflowReport,
  type BackendSummaryReport,
  type BackendTrendsReport,
} from '../lib/api';
import { cn } from '../lib/utils';

function formatMoney(minor: number, currency = 'USD'): string {
  return (minor / 100).toLocaleString(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(d: Date): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function sixMonthsAgo(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 5, 1);
}

// Backend `/v1/reports/cashflow` and `/v1/reports/trends` bucket keys are
// 'YYYY-MM' (TO_CHAR), so frontend keys + parsing must match that shape —
// not 'YYYY-MM-DD', and never `new Date('YYYY-MM')` which is UTC-midnight
// and shifts back a day in negative timezones.
function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

interface CategoryRow {
  name: string;
  currentMinor: number;
  previousMinor: number;
}

export default function MonthlyReview() {
  const now = useMemo(() => new Date(), []);
  const prevMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now]);

  const [cashflow, setCashflow] = useState<BackendCashflowReport | null>(null);
  const [trends, setTrends] = useState<BackendTrendsReport | null>(null);
  const [thisMonth, setThisMonth] = useState<BackendSummaryReport | null>(null);
  const [lastMonth, setLastMonth] = useState<BackendSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getCashflowReport({ from: startOfMonth(sixMonthsAgo(now)), to: endOfMonth(now) }),
      getTrendsReport({
        from: startOfMonth(sixMonthsAgo(now)),
        to: endOfMonth(now),
        period: 'month',
        groupBy: 'total',
      }),
      getSummaryReport({ from: startOfMonth(now), to: endOfMonth(now), groupBy: 'category' }),
      getSummaryReport({
        from: startOfMonth(prevMonth),
        to: endOfMonth(prevMonth),
        groupBy: 'category',
      }),
    ])
      .then(([cf, tr, thisM, lastM]) => {
        setCashflow(cf);
        setTrends(tr);
        setThisMonth(thisM);
        setLastMonth(lastM);
      })
      .catch((e) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, [now, prevMonth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="text-on-surface-variant">Loading monthly report...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-20 text-error">{error}</div>;
  }

  const thisBucket = cashflow?.buckets.find((b) => b.month === yearMonthKey(now));
  const lastBucket = cashflow?.buckets.find((b) => b.month === yearMonthKey(prevMonth));
  const thisExpenseMinor = thisBucket?.expense_minor ?? 0;
  const lastExpenseMinor = lastBucket?.expense_minor ?? 0;
  const delta = thisExpenseMinor - lastExpenseMinor;
  const pctDelta =
    lastExpenseMinor > 0 ? Math.round((delta / lastExpenseMinor) * 100) : null;
  const spendingDown = delta < 0;

  // Merge this-month + last-month category summaries into rows.
  const categoryRows: CategoryRow[] = (() => {
    const map = new Map<string, CategoryRow>();
    for (const it of thisMonth?.items ?? []) {
      map.set(it.key || 'other', {
        name: it.key || 'other',
        currentMinor: it.total_minor,
        previousMinor: 0,
      });
    }
    for (const it of lastMonth?.items ?? []) {
      const key = it.key || 'other';
      const row = map.get(key) ?? { name: key, currentMinor: 0, previousMinor: 0 };
      row.previousMinor = it.total_minor;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.currentMinor - a.currentMinor);
  })();

  const trendData = (trends?.buckets ?? []).map((b) => ({
    bucket: b.bucket,
    label: parseYearMonth(b.bucket).toLocaleDateString(undefined, { month: 'short' }),
    spendMinor: Math.abs(b.total_minor),
  }));

  const currency = cashflow?.currency ?? 'USD';

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <header>
        <h2 className="text-4xl font-extrabold font-headline text-white tracking-tight">
          Monthly Financial Performance
        </h2>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-on-surface-variant font-medium">
            Review for {now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          {pctDelta != null && (
            <span
              className={cn(
                'px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1',
                spendingDown ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error',
              )}
            >
              {spendingDown ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
              {pctDelta > 0 ? '+' : ''}{pctDelta}% spending
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Hero — outflow vs previous month */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-low rounded-xl p-8 border border-outline-variant/5">
          <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
            <div>
              <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-widest">
                Total Monthly Outflow
              </h3>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-5xl font-bold font-headline text-white">
                  {formatMoney(thisExpenseMinor, currency)}
                </span>
                <span className="text-on-surface-variant text-sm font-medium">
                  vs {formatMoney(lastExpenseMinor, currency)} last month
                </span>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-xl border border-outline-variant/10">
              {spendingDown ? (
                <TrendingDown className="text-primary" size={32} />
              ) : (
                <TrendingUp className="text-error" size={32} />
              )}
            </div>
          </div>

          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatMoney(v, currency)}
                />
                <Bar dataKey="spendMinor" fill="#4edea3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side stats */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <StatCard
            label="Income"
            value={formatMoney(thisBucket?.income_minor ?? 0, currency)}
            tone="primary"
          />
          <StatCard
            label="Net"
            value={formatMoney(thisBucket?.net_minor ?? 0, currency)}
            tone={((thisBucket?.net_minor ?? 0) >= 0) ? 'primary' : 'error'}
          />
          <StatCard
            label="Categories"
            value={String(thisMonth?.items.length ?? 0)}
            tone="muted"
          />
        </div>

        {/* Category comparison */}
        <div className="col-span-12 bg-surface-container-low rounded-xl p-8 border border-outline-variant/5">
          <div className="flex justify-between items-end mb-10 flex-wrap gap-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                <PieIcon size={18} /> Where your money went this month
              </h3>
              <p className="text-on-surface-variant text-sm">
                Category breakdown vs. previous month
              </p>
            </div>
            <div className="flex gap-4">
              <LegendDot color="bg-primary" label="This month" />
              <LegendDot color="bg-surface-container-highest" label="Last month" />
            </div>
          </div>

          {categoryRows.length === 0 ? (
            <p className="text-center py-10 text-on-surface-variant">
              No transactions this month yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
              {categoryRows.map((cat) => {
                const max = Math.max(cat.currentMinor, cat.previousMinor, 1);
                const deltaPct =
                  cat.previousMinor > 0
                    ? Math.round(
                        ((cat.currentMinor - cat.previousMinor) / cat.previousMinor) * 100,
                      )
                    : null;
                const isOver = deltaPct != null && deltaPct > 0;
                return (
                  <div key={cat.name} className="space-y-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-white capitalize">{cat.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-white">
                          {formatMoney(cat.currentMinor, currency)}
                        </span>
                        <span className="text-xs text-on-surface-variant ml-2">
                          vs {formatMoney(cat.previousMinor, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-white/10 rounded-full"
                        style={{ width: `${(cat.previousMinor / max) * 100}%` }}
                      />
                      <div
                        className="absolute h-full bg-primary rounded-full z-10"
                        style={{ width: `${(cat.currentMinor / max) * 100}%` }}
                      />
                    </div>
                    {deltaPct != null && (
                      <div className="flex justify-end">
                        <span className={cn('text-[10px] font-bold', isOver ? 'text-error' : 'text-primary')}>
                          {deltaPct > 0 ? '+' : ''}{deltaPct}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'primary' | 'error';
}) {
  const valueClass =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'error'
        ? 'text-error'
        : tone === 'muted'
          ? 'text-on-surface-variant'
          : 'text-white';
  return (
    <div className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/5">
      <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">{label}</p>
      <p className={cn('text-3xl font-bold font-headline', valueClass)}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
      <span className="text-xs text-on-surface-variant font-medium">{label}</span>
    </div>
  );
}
