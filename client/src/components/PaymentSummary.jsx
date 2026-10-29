import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Hourglass,
  Wallet
} from 'lucide-react';
import api from '../utils/api';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDateKey
} from '../utils/format';
import ListLimitSelect from './ListLimitSelect';
import SectionToggle from './SectionToggle';
import { limitItems } from '../utils/listLimits';
import { buildNiceScale, buildTrendSeries, TREND_GRANULARITIES } from '../utils/paymentTrend.mjs';

const EMPTY_FILTERS = { startDate: '', endDate: '', search: '', sort: 'date-desc' };
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest payment date' },
  { value: 'date-asc', label: 'Oldest payment date' },
  { value: 'amount-desc', label: 'Highest daily total' },
  { value: 'amount-asc', label: 'Lowest daily total' }
];

function groupLabel(group) {
  return group.key === 'unknown' ? 'Date not recorded' : formatDateKey(group.key);
}

function PaymentRecordRow({ record }) {
  const adjusted = record.adjustedAmount !== null && record.adjustedAmount !== undefined;
  return (
    <div className="payment-record-row">
      <div className="payment-record-main">
        <strong>{record.giftCard}</strong>
        <span className="payment-record-meta">
          {record.provider || 'No provider'}
          {record.notes ? ` · ${record.notes}` : ''}
        </span>
      </div>
      <div className="payment-record-amounts">
        <span className="payment-record-paid">{formatCurrency(record.effectivePaid)}</span>
        <span className="payment-record-meta">
          GC {formatCurrency(record.giftCardAmount)}
          {adjusted ? ` · Original paid ${formatCurrency(record.paid)}` : ''}
        </span>
      </div>
    </div>
  );
}

export default function PaymentSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(() => new Set());
  const [granularity, setGranularity] = useState('daily');
  const [limits, setLimits] = useState({ trend: 10, pending: 10, history: 10 });
  const [sectionsOpen, setSectionsOpen] = useState({
    trend: false,
    pending: false,
    history: false
  });
  const [selectedTrendKey, setSelectedTrendKey] = useState(null);
  const requestIdRef = useRef(0);
  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('timeZone', timeZone);
      params.set('sort', filters.sort);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.search.trim()) params.set('search', filters.search.trim());

      const result = await api.get(`/api/stats/user/payments?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;
      setData(result);
      setExpanded(previous => {
        if (previous.size > 0 || !result.groups?.length) return previous;
        return new Set([result.groups[0].key]);
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message || 'Failed to load payment summary');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filters, timeZone]);

  useEffect(() => {
    const timer = setTimeout(fetchSummary, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchSummary, filters.search]);

  useEffect(() => {
    setSelectedTrendKey(null);
  }, [granularity, limits.trend]);

  const toggleGroup = (key) => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateFilter = (name, value) => {
    setFilters(previous => ({ ...previous, [name]: value }));
  };

  const updateLimit = (name, value) => {
    setLimits(previous => ({ ...previous, [name]: value }));
  };

  const toggleSection = (name) => {
    setSectionsOpen(previous => ({ ...previous, [name]: !previous[name] }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const groups = data?.groups || [];
  const chart = useMemo(
    () => buildTrendSeries(groups, granularity, limits.trend),
    [groups, granularity, limits.trend]
  );
  const chartScale = useMemo(() => buildNiceScale(chart.maxTotal), [chart.maxTotal]);
  const selectedTrend = chart.visible.find(item => item.key === selectedTrendKey) || null;
  const granularityLabel = granularity[0].toUpperCase() + granularity.slice(1);
  const hasFilters = Boolean(filters.startDate || filters.endDate || filters.search.trim());
  const pending = data?.pending || { count: 0, amount: 0, records: [] };
  const visibleGroups = limitItems(groups, limits.history);
  const visiblePending = limitItems(pending.records, limits.pending);

  return (
    <section className="payment-summary" aria-labelledby="payment-summary-title" aria-busy={loading}>
      <div className="section-header payment-summary-header">
        <div>
          <h2 className="section-title" id="payment-summary-title">Payment Summary</h2>
          <p className="payment-summary-hint">
            Actual payment-back history grouped by recorded date. Dates use your local time zone ({timeZone}).
          </p>
        </div>
        {data && (
          <span className="payment-summary-alltime">
            All time: {data.allTime.paidBackCount} paid-back record{data.allTime.paidBackCount === 1 ? '' : 's'} · {formatCurrency(data.allTime.totalPaidBackAmount)}
          </span>
        )}
      </div>

      <div className="filter-bar payment-filter-bar">
        <div className="filter-group payment-search-group">
          <label className="form-label" htmlFor="payment-search">Search payments</label>
          <input
            id="payment-search"
            type="search"
            className="form-input"
            placeholder="Gift card, provider, notes..."
            value={filters.search}
            onChange={event => updateFilter('search', event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="form-label" htmlFor="payment-from">Paid back from</label>
          <input
            id="payment-from"
            type="date"
            className="form-input form-input-date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={event => updateFilter('startDate', event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="form-label" htmlFor="payment-to">Paid back to</label>
          <input
            id="payment-to"
            type="date"
            className="form-input form-input-date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={event => updateFilter('endDate', event.target.value)}
          />
        </div>
        <div className="filter-group payment-sort-group">
          <label className="form-label" htmlFor="payment-sort">Sort groups</label>
          <select
            id="payment-sort"
            className="form-select"
            value={filters.sort}
            onChange={event => updateFilter('sort', event.target.value)}
          >
            {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-outline btn-sm filter-clear-btn" onClick={clearFilters} disabled={!hasFilters && filters.sort === 'date-desc'}>
          Clear
        </button>
      </div>

      {error ? (
        <div className="payment-state payment-state-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={fetchSummary}>Retry</button>
        </div>
      ) : loading && !data ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : (
        <>
          <div className="payment-kpis">
            <div className="payment-kpi">
              <span className="payment-kpi-icon payment-kpi-icon-records" aria-hidden="true"><CreditCard size={16} /></span>
              <span className="payment-kpi-label">Records in view</span>
              <strong className="payment-kpi-value">{data.filtered.paidBackCount}</strong>
              <span className="payment-kpi-meta">{data.filtered.dayCount} payment day{data.filtered.dayCount === 1 ? '' : 's'}</span>
            </div>
            <div className="payment-kpi">
              <span className="payment-kpi-icon payment-kpi-icon-paid" aria-hidden="true"><Banknote size={16} /></span>
              <span className="payment-kpi-label">Paid back in view</span>
              <strong className="payment-kpi-value text-success">{formatCurrency(data.filtered.totalPaidBackAmount)}</strong>
              <span className="payment-kpi-meta">Recorded payments only</span>
            </div>
            <div className="payment-kpi">
              <span className="payment-kpi-icon payment-kpi-icon-average" aria-hidden="true"><Wallet size={16} /></span>
              <span className="payment-kpi-label">Average per record</span>
              <strong className="payment-kpi-value">{formatCurrency(data.filtered.averagePaidBack)}</strong>
              <span className="payment-kpi-meta">GC value {formatCurrency(data.filtered.totalGiftCardAmount)}</span>
            </div>
            <div className="payment-kpi">
              <span className="payment-kpi-icon payment-kpi-icon-pending" aria-hidden="true"><Hourglass size={16} /></span>
              <span className="payment-kpi-label">Pending payments</span>
              <strong className="payment-kpi-value text-warning">{formatCurrency(pending.amount)}</strong>
              <span className="payment-kpi-meta">{pending.count} record{pending.count === 1 ? '' : 's'} awaiting payment</span>
            </div>
          </div>

          {data.filtered.missingPaidBackDateCount > 0 && (
            <p className="payment-note" role="note">
              {data.filtered.missingPaidBackDateCount} paid-back record{data.filtered.missingPaidBackDateCount === 1 ? ' has' : 's have'} no recorded payment date. {data.filtered.missingPaidBackDateCount === 1 ? 'It is' : 'They are'} grouped under “Date not recorded”.
            </p>
          )}

          <div className="payment-insights-grid">
            <div className={`payment-panel payment-trend-panel ${sectionsOpen.trend ? 'payment-panel-open' : 'payment-panel-collapsed'}`}>
              <div className="payment-panel-header">
                <div>
                  <h3 className="payment-panel-title">Payment trend</h3>
                  <p className="payment-panel-hint">
                    {granularityLabel} paid-back totals by recorded date. Tap a bar for exact values.
                  </p>
                </div>
                <div className="payment-panel-controls">
                  <div className="payment-segmented" role="group" aria-label="Payment trend granularity">
                    {TREND_GRANULARITIES.map(option => (
                      <button
                        key={option}
                        type="button"
                        className={granularity === option ? 'active' : ''}
                        aria-pressed={granularity === option}
                        onClick={() => setGranularity(option)}
                      >
                        {option[0].toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="payment-panel-actions">
                    <ListLimitSelect
                      id="payment-trend-limit"
                      label="Show"
                      value={limits.trend}
                      onChange={value => updateLimit('trend', value)}
                      inline
                    />
                    <SectionToggle
                      expanded={sectionsOpen.trend}
                      onClick={() => toggleSection('trend')}
                      controls="payment-trend-panel"
                      label="Payment trend"
                    />
                  </div>
                </div>
              </div>

              {sectionsOpen.trend && (
                <div className="payment-panel-body" id="payment-trend-panel">
                  {chart.visible.length === 0 ? (
                    <div className="payment-state payment-state-empty">
                      <CalendarClock size={22} aria-hidden="true" />
                      <span>No recorded payments for these filters.</span>
                    </div>
                  ) : (
                    <>
                      <div className="payment-chart-meta">
                        <span>
                          <strong>{granularityLabel}</strong> totals · showing {chart.visible.length} of {chart.series.length} period{chart.series.length === 1 ? '' : 's'} with payments
                        </span>
                        <span>
                          Total <strong>{formatCurrency(chart.visibleTotal)}</strong> · Avg <strong>{formatCurrency(chart.averagePerPeriod)}</strong> per period
                        </span>
                      </div>

                      <div className="payment-chart-frame">
                        <div className="payment-chart-yaxis" aria-hidden="true">
                          {chartScale.ticks.map(tick => (
                            <span
                              key={tick}
                              className="payment-chart-yaxis-label"
                              style={{ bottom: chartScale.max > 0 ? `${(tick / chartScale.max) * 100}%` : '0%' }}
                            >
                              {formatCompactCurrency(tick)}
                            </span>
                          ))}
                        </div>
                        <div className="payment-chart-scroll">
                          <div
                            className="payment-chart"
                            role="list"
                            aria-label={`${granularity} paid-back totals`}
                            data-granularity={granularity}
                            style={{ '--chart-columns': Math.max(1, chart.visible.length) }}
                          >
                            <div className="payment-chart-grid" aria-hidden="true">
                              {chartScale.ticks.map(tick => (
                                <span
                                  key={tick}
                                  className="payment-chart-gridline"
                                  style={{ bottom: chartScale.max > 0 ? `${(tick / chartScale.max) * 100}%` : '0%' }}
                                />
                              ))}
                            </div>
                            {chart.visible.map(item => {
                              const isZero = item.total <= 0;
                              const isSelected = item.key === selectedTrendKey;
                              const height = chartScale.max > 0
                                ? Math.max(0.75, (item.total / chartScale.max) * 100)
                                : 0;
                              return (
                                <div className="payment-chart-column" key={item.key} role="listitem">
                                  <button
                                    type="button"
                                    className={`payment-chart-column-btn ${isSelected ? 'is-selected' : ''}`}
                                    aria-pressed={isSelected}
                                    aria-label={`${item.fullLabel}: ${formatCurrency(item.total)}, ${item.count} record${item.count === 1 ? '' : 's'}`}
                                    title={`${item.fullLabel}: ${formatCurrency(item.total)} · ${item.count} record${item.count === 1 ? '' : 's'}`}
                                    onClick={() => setSelectedTrendKey(previous => previous === item.key ? null : item.key)}
                                  >
                                    <span className="payment-chart-track">
                                      <span
                                        className={`payment-chart-bar ${isZero ? 'is-zero' : ''}`}
                                        style={{ height: isZero ? '0%' : `${height}%` }}
                                      />
                                    </span>
                                    <span className="payment-chart-label">{item.shortLabel}</span>
                                    <span className="payment-chart-value">{formatCompactCurrency(item.total)}</span>
                                    <span className="payment-chart-count">{item.count} rec</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {selectedTrend && (
                        <div className="payment-chart-detail" role="status" aria-live="polite">
                          <div className="payment-chart-detail-main">
                            <span className="payment-chart-detail-label">{granularityLabel} · {selectedTrend.fullLabel}</span>
                            <strong>{formatCurrency(selectedTrend.total)}</strong>
                          </div>
                          <span className="payment-chart-detail-meta">
                            {selectedTrend.count} record{selectedTrend.count === 1 ? '' : 's'} · {selectedTrend.days} payment day{selectedTrend.days === 1 ? '' : 's'} · Avg {formatCurrency(selectedTrend.count ? selectedTrend.total / selectedTrend.count : 0)} per record
                          </span>
                        </div>
                      )}

                      {chart.hiddenCount > 0 && (
                        <div className="payment-limit-note">
                          <span>Showing the latest {chart.visible.length} of {chart.series.length} {granularity} periods with payments.</span>
                          <button type="button" className="link-button" onClick={() => updateLimit('trend', 'all')}>Show all</button>
                        </div>
                      )}
                      {data.filtered.missingPaidBackDateCount > 0 && (
                        <p className="payment-chart-note">
                          {data.filtered.missingPaidBackDateCount} paid-back record{data.filtered.missingPaidBackDateCount === 1 ? ' has' : 's have'} no recorded date and {data.filtered.missingPaidBackDateCount === 1 ? 'is' : 'are'} not plotted.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`payment-panel payment-pending-panel ${sectionsOpen.pending ? 'payment-panel-open' : 'payment-panel-collapsed'}`}>
              <div className="payment-panel-header">
                <div>
                  <h3 className="payment-panel-title">Pending payments</h3>
                  <p className="payment-panel-hint">Not yet recorded as paid back</p>
                </div>
                <div className="payment-panel-controls">
                  <span className="badge status-pending">{pending.count} pending</span>
                  <div className="payment-panel-actions">
                    <ListLimitSelect
                      id="payment-pending-limit"
                      label="Show"
                      value={limits.pending}
                      onChange={value => updateLimit('pending', value)}
                      inline
                    />
                    <SectionToggle
                      expanded={sectionsOpen.pending}
                      onClick={() => toggleSection('pending')}
                      controls="payment-pending-panel"
                      label="Pending payments"
                    />
                  </div>
                </div>
              </div>

              {sectionsOpen.pending && (
                <div className="payment-panel-body" id="payment-pending-panel">
                  {pending.records.length === 0 ? (
                    <div className="payment-state payment-state-empty">
                      <CheckCircle2 size={22} aria-hidden="true" />
                      <span>No pending records.</span>
                    </div>
                  ) : (
                    <>
                      <ul className="payment-pending-list">
                        {visiblePending.map(record => (
                          <li key={record._id} className="payment-pending-item">
                            <div>
                              <strong>{record.giftCard}</strong>
                              <span className="payment-record-meta">
                                {record.provider || 'No provider'} · Submitted {formatDate(record.createdAt)}
                              </span>
                            </div>
                            <span className="payment-pending-amount">{formatCurrency(record.effectivePaid)}</span>
                          </li>
                        ))}
                      </ul>
                      {pending.records.length > visiblePending.length && (
                        <div className="payment-limit-note">
                          <span>Showing {visiblePending.length} of {pending.records.length} pending record(s).</span>
                          <button type="button" className="link-button" onClick={() => updateLimit('pending', 'all')}>Show all</button>
                        </div>
                      )}
                    </>
                  )}
                  <p className="payment-truth-note">No future payment dates are estimated. Only recorded paid-back dates appear above.</p>
                </div>
              )}
            </div>
          </div>

          <div className={`payment-panel payment-history-panel ${sectionsOpen.history ? 'payment-panel-open' : 'payment-panel-collapsed'}`}>
            <div className="payment-panel-header">
              <div>
                <h3 className="payment-panel-title">Payment history by date</h3>
                <p className="payment-panel-hint">
                  {data.filtered.paidBackCount} record{data.filtered.paidBackCount === 1 ? '' : 's'} across {data.filtered.dayCount} recorded date{data.filtered.dayCount === 1 ? '' : 's'} · {formatCurrency(data.filtered.totalPaidBackAmount)} paid back
                </p>
              </div>
              <div className="payment-panel-controls">
                {hasFilters && <span className="badge badge-neutral">Filtered</span>}
                <div className="payment-panel-actions">
                  <ListLimitSelect
                    id="payment-history-limit"
                    label="Show"
                    value={limits.history}
                    onChange={value => updateLimit('history', value)}
                    inline
                  />
                  <SectionToggle
                    expanded={sectionsOpen.history}
                    onClick={() => toggleSection('history')}
                    controls="payment-history-panel"
                    label="Payment history by date"
                  />
                </div>
              </div>
            </div>

            {sectionsOpen.history && (
              <div className="payment-panel-body" id="payment-history-panel">
                {groups.length === 0 ? (
                  <div className="payment-state payment-state-empty">
                    <Clock size={22} aria-hidden="true" />
                    <span>{hasFilters ? 'No paid-back records match these filters.' : 'No payments have been recorded yet.'}</span>
                  </div>
                ) : (
                  <>
                    {groups.length > visibleGroups.length && (
                      <div className="payment-limit-note">
                        <span>Showing {visibleGroups.length} of {groups.length} payment date{groups.length === 1 ? '' : 's'}.</span>
                        <button type="button" className="link-button" onClick={() => updateLimit('history', 'all')}>Show all</button>
                      </div>
                    )}
                    <div className="payment-groups">
                      {visibleGroups.map(group => {
                        const isOpen = expanded.has(group.key);
                        const panelId = `payment-group-${group.key}`;
                        return (
                          <div className={`payment-group ${isOpen ? 'payment-group-open' : ''}`} key={group.key}>
                            <button
                              type="button"
                              className="payment-group-header"
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              onClick={() => toggleGroup(group.key)}
                            >
                              <span className="payment-group-date">
                                <span className="payment-group-day">{groupLabel(group)}</span>
                                <span className="payment-group-meta">
                                  {group.count} record{group.count === 1 ? '' : 's'} · GC {formatCurrency(group.totalGiftCardAmount)}
                                </span>
                              </span>
                              <span className="payment-group-total">{formatCurrency(group.totalPaid)}</span>
                              <ChevronDown className="payment-group-chevron" size={18} aria-hidden="true" />
                            </button>
                            {isOpen && (
                              <div className="payment-group-body" id={panelId}>
                                {group.records.map(record => <PaymentRecordRow key={record._id || `${record.giftCard}-${record.paid}`} record={record} />)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
