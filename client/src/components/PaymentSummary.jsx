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
  formatCurrency,
  formatDate,
  formatDateKey,
  formatMonthKey
} from '../utils/format';

const EMPTY_FILTERS = { startDate: '', endDate: '', search: '', sort: 'date-desc' };
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest payment date' },
  { value: 'date-asc', label: 'Oldest payment date' },
  { value: 'amount-desc', label: 'Highest daily total' },
  { value: 'amount-asc', label: 'Lowest daily total' }
];

const LIMITS = { daily: 14, weekly: 12, monthly: 12 };

function startOfWeekKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function buildSeries(groups, granularity) {
  const buckets = new Map();

  for (const group of groups) {
    if (group.key === 'unknown') continue;
    let key = group.key;
    if (granularity === 'weekly') key = startOfWeekKey(group.key);
    if (granularity === 'monthly') key = group.key.slice(0, 7);

    if (!buckets.has(key)) {
      buckets.set(key, { key, count: 0, total: 0, days: new Set() });
    }
    const bucket = buckets.get(key);
    bucket.count += group.count;
    bucket.total += group.totalPaid;
    bucket.days.add(group.key);
  }

  const series = [...buckets.values()]
    .map(bucket => ({
      key: bucket.key,
      count: bucket.count,
      total: bucket.total,
      days: bucket.days.size,
      label: granularity === 'monthly' ? formatMonthKey(bucket.key) : formatDateKey(bucket.key)
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const limit = LIMITS[granularity] || LIMITS.daily;
  const visible = series.slice(-limit);
  return { series, visible, hiddenCount: Math.max(0, series.length - visible.length) };
}

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

function ActivityItem({ event }) {
  const paid = event.type === 'paid_back';
  const record = event.record;
  const when = event.at ? formatDate(event.at) : null;

  return (
    <li className="payment-timeline-item">
      <span className={`payment-timeline-dot ${paid ? 'payment-timeline-dot-paid' : 'payment-timeline-dot-pending'}`} aria-hidden="true" />
      <div className="payment-timeline-copy">
        <div className="payment-timeline-title">
          {paid ? 'Payment recorded' : 'Awaiting payment'}
          {!paid && <span className="badge status-pending">Pending</span>}
        </div>
        <div className="payment-timeline-meta">
          {record.giftCard}{record.provider ? ` · ${record.provider}` : ''}
        </div>
        <div className="payment-timeline-meta">
          {paid
            ? (event.dateRecorded && when ? `Paid back ${when}` : 'Payment date not recorded')
            : (when ? `Submitted ${when}` : 'Submission date not recorded')}
        </div>
      </div>
      <strong className={paid ? 'payment-timeline-amount text-success' : 'payment-timeline-amount text-warning'}>
        {formatCurrency(record.effectivePaid)}
      </strong>
    </li>
  );
}

export default function PaymentSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(() => new Set());
  const [granularity, setGranularity] = useState('daily');
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

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const groups = data?.groups || [];
  const chart = useMemo(() => buildSeries(groups, granularity), [groups, granularity]);
  const maxTotal = chart.visible.reduce((max, item) => Math.max(max, item.total), 0);
  const hasFilters = Boolean(filters.startDate || filters.endDate || filters.search.trim());
  const pending = data?.pending || { count: 0, amount: 0, records: [] };

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
        <div className="filter-group">
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
        <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters} disabled={!hasFilters && filters.sort === 'date-desc'}>
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
            <div className="payment-panel">
              <div className="payment-panel-header">
                <div>
                  <h3 className="payment-panel-title">Payment trend</h3>
                  <p className="payment-panel-hint">Recorded paid-back totals by period</p>
                </div>
                <div className="payment-segmented" role="group" aria-label="Payment trend granularity">
                  {['daily', 'weekly', 'monthly'].map(option => (
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
              </div>

              {chart.visible.length === 0 ? (
                <div className="payment-state payment-state-empty">
                  <CalendarClock size={22} aria-hidden="true" />
                  <span>No recorded payments for these filters.</span>
                </div>
              ) : (
                <>
                  <div className="payment-chart" role="list" aria-label={`${granularity} paid-back totals`}>
                    {chart.visible.map(item => (
                      <div
                        className="payment-chart-column"
                        key={item.key}
                        role="listitem"
                        aria-label={`${item.label}: ${formatCurrency(item.total)}, ${item.count} record${item.count === 1 ? '' : 's'}`}
                        title={`${item.label}: ${formatCurrency(item.total)} · ${item.count} record${item.count === 1 ? '' : 's'}`}
                      >
                        <div className="payment-chart-track">
                          <div
                            className="payment-chart-bar"
                            style={{ height: `${maxTotal > 0 ? Math.max(6, (item.total / maxTotal) * 100) : 6}%` }}
                          />
                        </div>
                        <span className="payment-chart-label">
                          {item.label.replace(/ \d{4}$/, '')}
                        </span>
                        <span className="payment-chart-value">{formatCurrency(item.total)}</span>
                        <span className="payment-chart-count">{item.count} rec</span>
                      </div>
                    ))}
                  </div>
                  {chart.hiddenCount > 0 && (
                    <p className="payment-panel-hint">Showing the latest {chart.visible.length} of {chart.series.length} {granularity} periods with payments.</p>
                  )}
                </>
              )}
            </div>

            <div className="payment-panel payment-pending-panel">
              <div className="payment-panel-header">
                <div>
                  <h3 className="payment-panel-title">Pending payments</h3>
                  <p className="payment-panel-hint">Not yet recorded as paid back</p>
                </div>
                <span className="badge status-pending">{pending.count} pending</span>
              </div>

              {pending.records.length === 0 ? (
                <div className="payment-state payment-state-empty">
                  <CheckCircle2 size={22} aria-hidden="true" />
                  <span>No pending records.</span>
                </div>
              ) : (
                <ul className="payment-pending-list">
                  {pending.records.slice(0, 5).map(record => (
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
              )}
              {pending.records.length > 5 && (
                <p className="payment-panel-hint">{pending.records.length - 5} more pending record(s) in My Gift Cards below.</p>
              )}
              <p className="payment-truth-note">No future payment dates are estimated. Only recorded paid-back dates appear above.</p>
            </div>
          </div>

          <div className="payment-panel payment-history-panel">
            <div className="payment-panel-header">
              <div>
                <h3 className="payment-panel-title">Payment history by date</h3>
                <p className="payment-panel-hint">
                  {data.filtered.paidBackCount} record{data.filtered.paidBackCount === 1 ? '' : 's'} across {data.filtered.dayCount} recorded date{data.filtered.dayCount === 1 ? '' : 's'} · {formatCurrency(data.filtered.totalPaidBackAmount)} paid back
                </p>
              </div>
              {hasFilters && <span className="badge badge-neutral">Filtered</span>}
            </div>

            {groups.length === 0 ? (
              <div className="payment-state payment-state-empty">
                <Clock size={22} aria-hidden="true" />
                <span>{hasFilters ? 'No paid-back records match these filters.' : 'No payments have been recorded yet.'}</span>
              </div>
            ) : (
              <div className="payment-groups">
                {groups.map(group => {
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
            )}
          </div>

          <div className="payment-panel payment-activity-panel">
            <div className="payment-panel-header">
              <div>
                <h3 className="payment-panel-title">Recent activity</h3>
                <p className="payment-panel-hint">Latest recorded payments and pending submissions</p>
              </div>
            </div>
            {data.recentActivity.length === 0 ? (
              <div className="payment-state payment-state-empty">
                <Clock size={22} aria-hidden="true" />
                <span>No recent activity.</span>
              </div>
            ) : (
              <ul className="payment-timeline">
                {data.recentActivity.map((event, index) => (
                  <ActivityItem key={`${event.type}-${event.record._id || index}-${event.at || index}`} event={event} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
