import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Loader2, Landmark, PiggyBank, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  extractProblemMessage,
  getCashflowReport,
  getNetWorthReport,
  getSummaryReport,
  getTrendsReport,
  type BackendCashflowReport,
  type BackendNetWorthReport,
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

function startOfYear(d: Date): string {
  return `${d.getFullYear()}-01-01`;
}

function endOfYear(d: Date): string {
  return `${d.getFullYear()}-12-31`;
}

function quarterOf(monthIso: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const m = Number(monthIso.slice(5, 7));
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

export default function YearlyReview() {
  const now = useMemo(() => new Date(), []);
  const lastYear = useMemo(() => new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), [now]);

  const [netWorth, setNetWorth] = useState<BackendNetWorthReport | null>(null);
  const [netWorthPrev, setNetWorthPrev] = useState<BackendNetWorthReport | null>(null);
  const [cashflow, setCashflow] = useState<BackendCashflowReport | null>(null);
  const [trends, setTrends] = useState<BackendTrendsReport | null>(null);
  const [summary, setSummary] = useState<BackendSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getNetWorthReport({ asOf: now.toISOString().slice(0, 10) }),
      getNetWorthReport({ asOf: lastYear.toISOString().slice(0, 10) }),
      getCashflowReport({ from: startOfYear(now), to: endOfYear(now) }),
      getTrendsReport({
        from: startOfYear(now),
        to: endOfYear(now),
        period: 'month',
        groupBy: 'total',
      }),
      getSummaryReport({ from: startOfYear(now), to: endOfYear(now), groupBy: 'category' }),
    ])
      .then(([nw, nwPrev, cf, tr, sm]) => {
        setNetWorth(nw);
        setNetWorthPrev(nwPrev);
        setCashflow(cf);
        setTrends(tr);
        setSummary(sm);
      })
      .catch((e) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, [now, lastYear]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="text-on-surface-variant">Loading yearly report...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-20 text-error">{error}</div>;
  }

  const currency = cashflow?.currency ?? 'USD';

  const netWorthDelta = (netWorth?.net_worth_minor ?? 0) - (netWorthPrev?.net_worth_minor ?? 0);
  const netWorthPct =
    (netWorthPrev?.net_worth_minor ?? 0) !== 0
      ? Math.round((netWorthDelta / Math.abs(netWorthPrev!.net_worth_minor)) * 100)
      : null;

  const ytdIncome = cashflow?.income_minor ?? 0;
  const ytdExpense = cashflow?.expense_minor ?? 0;
  const ytdNet = cashflow?.net_minor ?? 0;

  const trendData = (trends?.buckets ?? []).map((b) => ({
    bucket: b.bucket,
    // Parse 'YYYY-MM' as local — `new Date('YYYY-MM')` is UTC-midnight
    // and silently shifts back a day in negative timezones.
    label: (() => {
      const [y, m] = b.bucket.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    })(),
    spendMinor: Math.abs(b.total_minor),
  }));

  const maxCategoryMinor = summary?.items.reduce((m, it) => Math.max(m, it.total_minor), 0) ?? 1;

  // Aggregate monthly cashflow into quarters.
  const quarterAgg = (cashflow?.buckets ?? []).reduce<Record<string, { inflow: number; outflow: number; net: number }>>(
    (acc, b) => {
      const q = quarterOf(b.month);
      const cur = acc[q] ?? { inflow: 0, outflow: 0, net: 0 };
      cur.inflow += b.income_minor;
      cur.outflow += b.expense_minor;
      cur.net += b.net_minor;
      acc[q] = cur;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row justify-between items-end gap-6 pb-4">
        <div>
          <span className="text-primary font-bold tracking-widest text-xs uppercase mb-2 block">Executive Summary</span>
          <h2 className="text-4xl font-extrabold font-headline text-white">Year in Review</h2>
          <p className="text-on-surface-variant mt-2 text-sm">
            Snapshot of fiscal year {now.getFullYear()} to date. Net worth measured against the same date one year ago.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2 glass-panel p-8 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[220px] border border-outline-variant/5">
          <div className="z-10">
            <p className="text-on-surface-variant text-sm font-medium mb-1">Current Net Worth</p>
            <h3 className="text-5xl font-black font-headline text-white tracking-tighter">
              {formatMoney(netWorth?.net_worth_minor ?? 0, currency)}
            </h3>
          </div>
          <div className="z-10 flex items-center gap-3 mt-4">
            {netWorthPct != null && (
              <div
                className={cn(
                  'flex items-center px-3 py-1 rounded-full text-xs font-bold',
                  netWorthDelta >= 0 ? 'text-primary bg-primary/10' : 'text-error bg-error/10',
                )}
              >
                {netWorthDelta >= 0 ? (
                  <TrendingUp size={14} className="mr-1" />
                ) : (
                  <TrendingDown size={14} className="mr-1" />
                )}
                {netWorthPct > 0 ? '+' : ''}{netWorthPct}%
              </div>
            )}
            <span className="text-on-surface-variant text-xs italic">vs same date last year</span>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-primary/10 blur-[60px] rounded-full" />
          <Landmark className="absolute right-8 top-8 text-primary/20" size={64} />
        </div>

        <StatBlock label="YTD Income" value={formatMoney(ytdIncome, currency)} icon={<PiggyBank size={20} className="text-primary" />} />
        <StatBlock label="YTD Spending" value={formatMoney(ytdExpense, currency)} icon={<Wallet size={20} className="text-tertiary" />} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel p-8 rounded-xl border border-outline-variant/5">
          <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-bold font-headline text-white">Monthly Spending</h3>
              <p className="text-on-surface-variant text-xs">
                Expense totals from the trends report, grouped by month
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-on-surface-variant uppercase tracking-widest">YTD Net</p>
              <p
                className={cn(
                  'text-xl font-bold font-headline',
                  ytdNet >= 0 ? 'text-primary' : 'text-error',
                )}
              >
                {formatMoney(ytdNet, currency)}
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
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
                <Bar dataKey="spendMinor" radius={[4, 4, 0, 0]}>
                  {trendData.map((d, i) => (
                    <Cell
                      key={d.bucket}
                      fill="#4edea3"
                      fillOpacity={i === trendData.length - 1 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-xl flex flex-col border border-outline-variant/5">
          <h3 className="text-lg font-bold font-headline text-white mb-1">Category Breakdown</h3>
          <p className="text-on-surface-variant text-xs mb-8">
            Top spending categories YTD
          </p>
          {summary?.items.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No spending data for this year yet.</p>
          ) : (
            <div className="space-y-5 flex-1">
              {summary?.items.slice(0, 6).map((it) => (
                <div key={it.key || 'other'} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface font-medium capitalize">
                      {it.key || 'Uncategorized'}
                    </span>
                    <span className="text-white font-bold">{formatMoney(it.total_minor, currency)}</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-low rounded-full">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(it.total_minor / maxCategoryMinor) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-xl overflow-hidden border border-outline-variant/5">
        <div className="px-8 py-6 border-b border-outline-variant/10">
          <h3 className="text-lg font-bold font-headline text-white">Quarterly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-black bg-surface-container-high/30">
                <th className="px-8 py-4">Quarter</th>
                <th className="px-8 py-4 text-right">Inflow</th>
                <th className="px-8 py-4 text-right">Outflow</th>
                <th className="px-8 py-4 text-right">Net</th>
                <th className="px-8 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
                const data = quarterAgg[q] ?? { inflow: 0, outflow: 0, net: 0 };
                const surplus = data.net >= 0;
                return (
                  <tr key={q} className="hover:bg-surface-container-high/20 transition-colors">
                    <td className="px-8 py-5 text-sm font-bold text-white">{q} {now.getFullYear()}</td>
                    <td className="px-8 py-5 text-sm text-right text-primary font-medium">
                      {formatMoney(data.inflow, currency)}
                    </td>
                    <td className="px-8 py-5 text-sm text-right text-on-surface-variant">
                      {formatMoney(data.outflow, currency)}
                    </td>
                    <td
                      className={cn(
                        'px-8 py-5 text-sm text-right font-bold',
                        surplus ? 'text-white' : 'text-error',
                      )}
                    >
                      {formatMoney(data.net, currency)}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span
                        className={cn(
                          'px-2 py-1 text-[10px] font-bold rounded-full uppercase',
                          data.inflow === 0 && data.outflow === 0
                            ? 'bg-surface-container-highest text-on-surface-variant'
                            : surplus
                              ? 'bg-primary/10 text-primary'
                              : 'bg-error/10 text-error',
                        )}
                      >
                        {data.inflow === 0 && data.outflow === 0 ? '—' : surplus ? 'Surplus' : 'Deficit'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatBlock({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass-panel p-6 rounded-xl flex flex-col justify-between border border-outline-variant/5">
      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider font-bold">{label}</p>
        {icon}
      </div>
      <h4 className="text-2xl font-bold font-headline text-white mt-6">{value}</h4>
    </div>
  );
}
