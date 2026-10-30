import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  CreditCard,
  Download,
  Eye,
  Hourglass,
  Inbox,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatCurrency, formatDate, formatDateTime, getStatusColor, getStatusLabel } from '../utils/format';
import { normalizeListLimit } from '../utils/listLimits';
import useModalScrollLock from '../hooks/useModalScrollLock';
import { useDowntime } from '../context/DowntimeContext';
import ListLimitSelect from '../components/ListLimitSelect';
import PaidAmount from '../components/PaidAmount';
import ConfirmModal from '../components/ConfirmModal';
import RecordsFilterPanel from '../components/records/RecordsFilterPanel';
import RecordDetailDrawer from '../components/records/RecordDetailDrawer';
import {
  COLUMN_OPTIONS,
  DEFAULT_COLUMNS,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  PRESETS,
  buildFilterChips,
  buildRecordQuery,
  countActiveFilters,
  detectPreset,
  getPageItems,
  getResultCounts,
  parseColumnPrefs,
  presetToState,
  visibleColumnKeys,
  visibleColumns
} from '../utils/recordQuery.mjs';

const COLUMNS_STORAGE_KEY = 'gc-admin-records-columns-v1';
const PAGE_SIZE_STORAGE_KEY = 'gc-admin-records-page-size-v1';

const EMPTY_FORM = {
  giftCard: '',
  giftCardPin: '',
  giftCardAmount: '',
  paid: '',
  notes: '',
  userId: '',
  provider: 'Flipkart',
  adjustedAmount: ''
};

const EMPTY_PAGINATION = { total: 0, page: 1, pages: 0, limit: 10, all: false };

const readStoredColumns = () => {
  try {
    return parseColumnPrefs(localStorage.getItem(COLUMNS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_COLUMNS };
  }
};

const readStoredPageSize = () => {
  try {
    return normalizeListLimit(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  } catch {
    return 10;
  }
};

const persistColumns = (columns) => {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // Preferences are optional; ignore unavailable storage.
  }
};

const persistPageSize = (pageSize) => {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
  } catch {
    // Preferences are optional; ignore unavailable storage.
  }
};

const SUMMARY_FIELDS = [
  { key: 'totalRecords', label: 'Total records', icon: CreditCard, tone: 'primary' },
  { key: 'pendingCount', label: 'Pending records', icon: Hourglass, tone: 'warning' },
  { key: 'paidBackCount', label: 'Paid back records', icon: CheckCircle2, tone: 'success' },
  { key: 'totalAmount', label: 'Total GC amount', icon: Wallet, tone: 'primary', currency: true },
  { key: 'totalPaid', label: 'Total paid amount', icon: Receipt, tone: 'primary', currency: true },
  { key: 'pendingAmount', label: 'Pending paid back', icon: Hourglass, tone: 'warning', currency: true }
];

const actionCopy = {
  pay: {
    title: 'Mark record as paid back',
    confirmLabel: 'Mark paid back',
    message: (record) => `Mark “${record.giftCard}” (${formatCurrency(record.adjustedAmount ?? record.paid)}) as Paid Back? The payment date will be recorded and an audit entry created.`
  },
  undo: {
    title: 'Undo payment status',
    confirmLabel: 'Undo payment',
    message: (record) => `Revert “${record.giftCard}” to Pending? Its paid-back date will be cleared and an audit entry created.`
  },
  delete: {
    title: 'Delete record',
    confirmLabel: 'Delete record',
    danger: true,
    message: (record) => `Delete “${record.giftCard}”? This permanently removes the record and writes an audit entry. This cannot be undone.`
  }
};

const bulkActionCopy = {
  pay: {
    title: 'Mark selected records as paid back',
    confirmLabel: 'Mark paid back',
    message: (count) => `Mark ${count} selected record(s) as Paid Back? Records already paid back are skipped.`
  },
  undo: {
    title: 'Undo selected payments',
    confirmLabel: 'Undo payments',
    message: (count) => `Revert ${count} selected record(s) to Pending? Records that are not paid back are skipped.`
  },
  share: {
    title: 'Share selected records',
    confirmLabel: 'Share records',
    message: (count) => `Share ${count} selected record(s)? Records already shared are skipped.`
  },
  unshare: {
    title: 'Unshare selected records',
    confirmLabel: 'Unshare records',
    message: (count) => `Unshare ${count} selected record(s)? Records already unshared are skipped.`
  }
};

function SortHeader({ field, label, sort, onSort, className = '' }) {
  const active = sort.field === field;
  const ariaSort = active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active ? (sort.order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className={`ar-sort-btn ${active ? 'active' : ''}`}
        onClick={() => onSort(field)}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

export default function AdminRecords() {
  const { active: downtimeActive } = useDowntime();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestIdRef = useRef(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [sort, setSort] = useState({ ...DEFAULT_SORT });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readStoredPageSize);
  const [selected, setSelected] = useState(new Set());
  const [columns, setColumns] = useState(readStoredColumns);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const [detailRecord, setDetailRecord] = useState(null);

  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingBulk, setPendingBulk] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [shareLoadingId, setShareLoadingId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProvider, setNewProvider] = useState('');

  const columnsMenuRef = useRef(null);
  const exportMenuRef = useRef(null);
  const selectAllRef = useRef(null);
  const mobileSelectAllRef = useRef(null);

  const columnsVisible = useMemo(() => visibleColumns(columns), [columns]);
  const activeFilterCount = countActiveFilters({ search, status, filters });
  const chips = buildFilterChips({ search, status, filters, users });
  const activePreset = detectPreset({ search, status, filters });
  const pageItems = getPageItems(page, pagination.pages);
  const total = pagination.total || 0;

  useModalScrollLock(
    showForm ||
    filtersOpen ||
    Boolean(detailRecord) ||
    Boolean(pendingAction) ||
    Boolean(pendingBulk)
  );

  useEffect(() => {
    api.get('/api/users').then((data) => setUsers(data.users || [])).catch(() => {});
    api.get('/api/providers').then((data) => setProviders(data.providers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const nextSearch = searchInput.trim();
    if (nextSearch === search) return undefined;
    const timer = setTimeout(() => {
      setSearch(nextSearch);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    setSelected(new Set());
  }, [search, status, filters, sort.field, sort.order, pageSize]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < records.length;
    }
    if (mobileSelectAllRef.current) {
      mobileSelectAllRef.current.indeterminate = selected.size > 0 && selected.size < records.length;
    }
  }, [selected, records]);

  useEffect(() => {
    if (!columnsOpen && !exportOpen) return undefined;
    const handleClick = (event) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target)) {
        setColumnsOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [columnsOpen, exportOpen]);

  const loadRecords = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params = buildRecordQuery({ search, status, filters, sort, page, pageSize });
      const data = await api.get(`/api/gc-records?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;

      const nextPagination = data.pagination || EMPTY_PAGINATION;
      const maxPage = Math.max(1, nextPagination.pages || 1);
      if (!nextPagination.all && page > maxPage) {
        setPage(maxPage);
        return;
      }

      setRecords(data.records || []);
      setPagination(nextPagination);
      setSummary(data.summary || null);
      setDetailRecord((previous) => {
        if (!previous) return previous;
        return (data.records || []).find((record) => record._id === previous._id) || previous;
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setRecords([]);
      setPagination(EMPTY_PAGINATION);
      setError(err.message || 'Failed to load records');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [search, status, filters, sort, page, pageSize, refreshKey]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const resetPaging = () => setPage(1);

  const handleQuickStatus = (value) => {
    setStatus(value);
    resetPaging();
  };

  const handleApplyFilters = ({ filters: nextFilters, sort: nextSort }) => {
    setFilters(nextFilters);
    setSort(nextSort);
    setFiltersOpen(false);
    resetPaging();
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setFilters({ ...DEFAULT_FILTERS });
    setSort({ ...DEFAULT_SORT });
    resetPaging();
  };

  const handleResetFilters = () => {
    clearAllFilters();
    setFiltersOpen(false);
  };

  const removeChip = (key) => {
    if (key === 'search') {
      setSearchInput('');
      setSearch('');
    } else if (key === 'status') {
      setStatus('');
    } else if (key === 'submitted') {
      setFilters((previous) => ({ ...previous, startDate: '', endDate: '' }));
    } else if (key === 'paidBack') {
      setFilters((previous) => ({ ...previous, paidBackStartDate: '', paidBackEndDate: '' }));
    } else if (key === 'amount') {
      setFilters((previous) => ({ ...previous, minAmount: '', maxAmount: '' }));
    } else {
      setFilters((previous) => ({ ...previous, [key]: '' }));
    }
    resetPaging();
  };

  const applyPreset = (key) => {
    const next = presetToState(key);
    setSearchInput(next.search);
    setSearch(next.search);
    setStatus(next.status);
    setFilters(next.filters);
    setSort(next.sort);
    resetPaging();
  };

  const handleSort = (field) => {
    setSort((previous) => {
      if (previous.field === field) {
        return { field, order: previous.order === 'asc' ? 'desc' : 'asc' };
      }
      return { field, order: field === 'createdAt' || field === 'paidBackAt' ? 'desc' : 'asc' };
    });
    resetPaging();
  };

  const handlePageSize = (value) => {
    setPageSize(value);
    persistPageSize(value);
    resetPaging();
  };

  const toggleColumn = (key) => {
    setColumns((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      persistColumns(next);
      return next;
    });
  };

  const resetColumns = () => {
    const next = { ...DEFAULT_COLUMNS };
    setColumns(next);
    persistColumns(next);
  };

  const toggleSelect = (id) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === records.length && records.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((record) => record._id)));
    }
  };

  const requestRecordAction = (type, record) => {
    setPendingAction({ type, record });
  };

  const runRecordAction = async () => {
    if (!pendingAction) return;
    const { type, record } = pendingAction;
    setActionLoading(true);
    try {
      if (type === 'pay') {
        const data = await api.post(`/api/gc-records/${record._id}/pay`, { adminNote: '' });
        setDetailRecord((previous) => (previous?._id === record._id ? data.record : previous));
        toast.success('Marked as paid back');
      } else if (type === 'undo') {
        const data = await api.post(`/api/gc-records/${record._id}/undo-pay`);
        setDetailRecord((previous) => (previous?._id === record._id ? data.record : previous));
        toast.success('Payment status reverted to pending');
      } else if (type === 'delete') {
        await api.delete(`/api/gc-records/${record._id}`);
        setDetailRecord((previous) => (previous?._id === record._id ? null : previous));
        toast.success('Record deleted');
      }
      setPendingAction(null);
      await loadRecords();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleShare = async (record) => {
    setShareLoadingId(record._id);
    try {
      const data = await api.post(`/api/gc-records/${record._id}/share`, { shared: !record.shared });
      setDetailRecord((previous) => (previous?._id === record._id ? data.record : previous));
      toast.success(data.record.shared ? 'Record shared' : 'Record unshared');
      await loadRecords();
    } catch (err) {
      toast.error(err.message || 'Failed to update sharing');
    } finally {
      setShareLoadingId(null);
    }
  };

  const runBulkAction = async () => {
    if (!pendingBulk) return;
    const ids = [...selected];
    if (ids.length === 0) {
      setPendingBulk(null);
      toast.error('Select records first');
      return;
    }

    const { type } = pendingBulk;
    setBulkLoading(true);
    try {
      let result;
      if (type === 'pay') {
        result = await api.post('/api/gc-records/bulk-pay', { recordIds: ids });
      } else if (type === 'undo') {
        result = await api.post('/api/gc-records/bulk-undo-pay', { recordIds: ids });
      } else {
        result = await api.post('/api/gc-records/bulk-share', {
          recordIds: ids,
          shared: type === 'share'
        });
      }

      const counts = getResultCounts(result.results);
      const actionLabel = {
        pay: 'marked as paid back',
        undo: 'reverted to pending',
        share: 'shared',
        unshare: 'unshared'
      }[type];

      if (counts.success > 0) toast.success(`${counts.success} record(s) ${actionLabel}`);
      if (counts.skipped > 0) toast(`${counts.skipped} record(s) skipped unchanged`);
      if (counts.failed > 0) toast.error(`${counts.failed} record(s) failed`);
      if (counts.success === 0 && counts.skipped === 0 && counts.failed === 0) {
        toast(result.message || 'No records were changed');
      }

      setSelected(new Set());
      setDetailRecord(null);
      setPendingBulk(null);
      await loadRecords();
    } catch (err) {
      toast.error(err.message || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExportOpen(false);
    setExporting(format);
    try {
      const params = buildRecordQuery({ search, status, filters, sort, includePaging: false });
      if (format === 'excel') {
        params.set('columns', visibleColumnKeys(columns).join(','));
      }
      const response = await api.downloadFile(`/api/export/${format}?${params.toString()}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gc-records-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format === 'excel' ? 'Excel' : 'CSV'} export downloaded`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting('');
    }
  };

  const openDetail = (record) => setDetailRecord(record);

  const handleEdit = (record) => {
    setEditingRecord(record);
    setFormData({
      giftCard: record.giftCard,
      giftCardPin: record.giftCardPin,
      giftCardAmount: record.giftCardAmount,
      paid: record.paid,
      notes: record.notes || '',
      userId: record.user?._id || '',
      provider: record.provider || 'Flipkart',
      adjustedAmount: record.adjustedAmount !== undefined && record.adjustedAmount !== null ? record.adjustedAmount : ''
    });
    setFormError('');
    setDetailRecord(null);
    setShowForm(true);
  };

  const openCreateForm = () => {
    setEditingRecord(null);
    setFormData({
      ...EMPTY_FORM,
      userId: users.filter((user) => user.role === 'user')[0]?._id || ''
    });
    setFormError('');
    setAddingProvider(false);
    setNewProvider('');
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!editingRecord && downtimeActive) {
      setFormError('New gift card records cannot be submitted while maintenance mode is active.');
      return;
    }
    try {
      const body = {
        ...formData,
        giftCardAmount: parseFloat(formData.giftCardAmount),
        paid: parseFloat(formData.paid),
        adjustedAmount: formData.adjustedAmount === '' ? null : parseFloat(formData.adjustedAmount)
      };
      if (formData.adjustedAmount === '' && !editingRecord) {
        delete body.adjustedAmount;
      }
      if (editingRecord) {
        await api.put(`/api/gc-records/${editingRecord._id}`, body);
        toast.success('Record updated');
      } else {
        delete body.adjustedAmount;
        await api.post('/api/gc-records', body);
        toast.success('Record created');
      }
      setShowForm(false);
      setEditingRecord(null);
      setFormData({ ...EMPTY_FORM });
      setFormError('');
      setAddingProvider(false);
      setNewProvider('');
      refresh();
    } catch (err) {
      if (err.message && err.message.includes('already been submitted')) {
        setFormError(err.message);
      } else {
        toast.error(err.message);
      }
    }
  };

  const handleAddProvider = async () => {
    const name = newProvider.trim();
    if (!name) return toast.error('Enter a provider name');
    if (name.length > 60) return toast.error('Provider name must be 60 characters or fewer');
    try {
      const data = await api.post('/api/providers', { name });
      setProviders((previous) => {
        const next = previous.filter((provider) => provider._id !== data.provider._id);
        next.push(data.provider);
        return next.sort((a, b) => (a.isCustom === b.isCustom ? a.name.localeCompare(b.name) : a.isCustom ? 1 : -1));
      });
      setFormData((previous) => ({ ...previous, provider: data.provider.name }));
      setNewProvider('');
      setAddingProvider(false);
      toast.success('Provider added');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveProvider = async (provider) => {
    try {
      await api.delete(`/api/providers/${provider._id}`);
      setProviders((previous) => previous.filter((item) => item._id !== provider._id));
      toast.success('Provider removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const rangeStart = total === 0 ? 0 : pagination.all ? 1 : Math.min(total, (page - 1) * Number(pageSize === 'all' ? total : pageSize) + 1);
  const rangeEnd = total === 0 ? 0 : pagination.all ? records.length : Math.min(total, page * Number(pageSize === 'all' ? total : pageSize));
  const pendingCopy = pendingAction ? actionCopy[pendingAction.type] : null;
  const bulkCopy = pendingBulk ? bulkActionCopy[pendingBulk.type] : null;
  const drawerBusy = actionLoading || (shareLoadingId && detailRecord && shareLoadingId === detailRecord._id);

  return (
    <div className="ar-page">
      <div className="ar-page-header">
        <div>
          <h2 className="section-title">Gift Card Records</h2>
          <p className="section-subtitle">
            Search, review, and reconcile every gift card submission from one workspace.
          </p>
        </div>
        <div className="ar-page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateForm}
            disabled={downtimeActive}
            title={downtimeActive ? 'New records are paused during maintenance' : undefined}
          >
            <Plus size={15} aria-hidden="true" />
            {downtimeActive ? 'Maintenance mode' : 'Add Record'}
          </button>
          <div className="ar-menu-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setExportOpen((open) => !open)}
              aria-expanded={exportOpen}
              aria-label="Export records"
              disabled={Boolean(exporting)}
            >
              <Download size={15} aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export'}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {exportOpen && (
              <div className="ar-menu" role="menu" aria-label="Export format">
                <button type="button" className="ar-menu-item" role="menuitem" onClick={() => handleExport('csv')}>
                  Export as CSV
                </button>
                <button type="button" className="ar-menu-item" role="menuitem" onClick={() => handleExport('excel')}>
                  Export as Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ar-summary-grid" aria-label="Filtered record summary">
        {SUMMARY_FIELDS.map((field) => {
          const Icon = field.icon;
          const value = summary ? summary[field.key] : null;
          return (
            <div key={field.key} className={`ar-summary-card ar-tone-${field.tone}`}>
              <div className="ar-summary-head">
                <span className="ar-summary-label">{field.label}</span>
                <span className="ar-summary-icon" aria-hidden="true"><Icon size={15} /></span>
              </div>
              <div className="ar-summary-value">
                {value === null || value === undefined
                  ? '—'
                  : field.currency
                    ? formatCurrency(value)
                    : value}
              </div>
            </div>
          );
        })}
      </div>
      <p className="ar-summary-note">Summary figures reflect the active search and filters.</p>

      <div className="ar-toolbar">
        <div className="ar-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            className="form-input"
            placeholder="Search gift card, notes, user name or email…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search records"
          />
          {searchInput && (
            <button
              type="button"
              className="ar-search-clear"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                resetPaging();
              }}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="ar-segmented ar-status-filter" role="group" aria-label="Quick status filters">
          {[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'paid_back', label: 'Paid Back' }
          ].map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              className={status === option.value ? 'active' : ''}
              aria-pressed={status === option.value}
              onClick={() => handleQuickStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ar-toolbar-actions">
          <button
            type="button"
            className={`btn btn-outline ar-filter-button ${activeFilterCount > 0 ? 'has-filters' : ''}`}
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && <span className="ar-filter-count">{activeFilterCount}</span>}
          </button>

          <div className="ar-menu-wrap" ref={columnsMenuRef}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setColumnsOpen((open) => !open)}
              aria-expanded={columnsOpen}
              aria-label="Column preferences"
            >
              <Columns3 size={15} aria-hidden="true" />
              <span className="ar-btn-label">Columns</span>
            </button>
            {columnsOpen && (
              <div className="ar-menu ar-column-menu" role="dialog" aria-label="Visible columns">
                <div className="ar-menu-heading">Visible columns</div>
                {COLUMN_OPTIONS.map((option) => (
                  <label key={option.key} className="ar-check-row">
                    <input
                      type="checkbox"
                      checked={columnsVisible[option.key]}
                      onChange={() => toggleColumn(option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
                <button type="button" className="ar-menu-reset" onClick={resetColumns}>Reset columns</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ar-context-row">
        <div className="ar-presets" role="group" aria-label="Saved filter presets">
          <span className="ar-presets-label">Presets</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`ar-preset ${activePreset === preset.key ? 'active' : ''}`}
              onClick={() => applyPreset(preset.key)}
              aria-pressed={activePreset === preset.key}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="ar-results-meta" role="status">
          {loading ? (
            <span>Loading records…</span>
          ) : total === 0 ? (
            <span>0 records</span>
          ) : (
            <span>
              Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total}</strong> record{total === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="ar-filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <span key={chip.key} className="ar-filter-chip">
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={() => removeChip(chip.key)}
                aria-label={`Remove filter ${chip.label}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          <button type="button" className="ar-clear-all" onClick={clearAllFilters}>Clear all</button>
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className={`ar-bulk-bar ${selected.size === 0 ? 'is-empty' : ''}`}>
          <div className="ar-bulk-info">
            <strong>{selected.size > 0 ? `${selected.size} selected` : 'Bulk actions'}</strong>
            <span>{selected.size > 0 ? 'Choose an action for the selected records.' : 'Select records below to update them together.'}</span>
          </div>
          <div className="ar-bulk-actions">
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => setPendingBulk({ type: 'pay' })}
              disabled={selected.size === 0 || bulkLoading}
            >
              Mark selected as paid back
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setPendingBulk({ type: 'undo' })}
              disabled={selected.size === 0 || bulkLoading}
            >
              Undo payment
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setPendingBulk({ type: 'share' })}
              disabled={selected.size === 0 || bulkLoading}
            >
              Share
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setPendingBulk({ type: 'unshare' })}
              disabled={selected.size === 0 || bulkLoading}
            >
              Unshare
            </button>
            {selected.size > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())} disabled={bulkLoading}>
                Clear selection
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="ar-state ar-loading-state" aria-live="polite">
          <div className="spinner"></div>
          <p>Loading records…</p>
        </div>
      ) : error ? (
        <div className="ar-state ar-error-state" role="alert">
          <AlertCircle size={26} aria-hidden="true" />
          <h3>Records could not be loaded</h3>
          <p>{error}</p>
          <button type="button" className="btn btn-outline" onClick={refresh}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="ar-state ar-empty-state">
          <Inbox size={28} aria-hidden="true" />
          <h3>{activeFilterCount > 0 ? 'No records match these filters' : 'No gift card records yet'}</h3>
          <p>
            {activeFilterCount > 0
              ? 'Try removing a filter, widening a date range, or searching for something else.'
              : 'Create the first record or wait for a user to submit a gift card.'}
          </p>
          {activeFilterCount > 0 ? (
            <button type="button" className="btn btn-outline" onClick={clearAllFilters}>Clear all filters</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={openCreateForm} disabled={downtimeActive}>
              <Plus size={15} aria-hidden="true" /> Add Record
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-container ar-table-container" aria-busy={loading}>
            <table className="table table-compact ar-table">
              <thead>
                <tr>
                  <th className="ar-checkbox-col">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={selected.size === records.length && records.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="Select all records on this page"
                    />
                  </th>
                  {columnsVisible.user && <th>User</th>}
                  <SortHeader field="giftCard" label="Gift Card" sort={sort} onSort={handleSort} />
                  {columnsVisible.provider && <SortHeader field="provider" label="Provider" sort={sort} onSort={handleSort} />}
                  {columnsVisible.amount && <SortHeader field="giftCardAmount" label="GC Amount" sort={sort} onSort={handleSort} className="ar-align-right" />}
                  {columnsVisible.paid && <SortHeader field="paid" label="Paid" sort={sort} onSort={handleSort} className="ar-align-right" />}
                  {columnsVisible.status && <SortHeader field="paymentStatus" label="Status" sort={sort} onSort={handleSort} />}
                  {columnsVisible.shared && <th>Shared</th>}
                  {columnsVisible.submitted && <SortHeader field="createdAt" label="Submitted" sort={sort} onSort={handleSort} />}
                  {columnsVisible.paidBack && <SortHeader field="paidBackAt" label="Paid Back" sort={sort} onSort={handleSort} />}
                  {columnsVisible.notes && <th>Notes</th>}
                  <th className="ar-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record._id} className={selected.has(record._id) ? 'selected-row' : ''}>
                    <td className="ar-checkbox-col">
                      <input
                        type="checkbox"
                        checked={selected.has(record._id)}
                        onChange={() => toggleSelect(record._id)}
                        aria-label={`Select record ${record.giftCard}`}
                      />
                    </td>
                    {columnsVisible.user && (
                      <td>
                        <div className="td-bold ar-user-name">{record.user?.name || 'Unknown'}</div>
                        <div className="text-muted text-xs ar-user-email">{record.user?.email || '—'}</div>
                      </td>
                    )}
                    <td>
                      <button type="button" className="ar-record-link" onClick={() => openDetail(record)}>
                        {record.giftCard}
                      </button>
                    </td>
                    {columnsVisible.provider && <td>{record.provider || '—'}</td>}
                    {columnsVisible.amount && <td className="ar-align-right ar-nowrap">{formatCurrency(record.giftCardAmount)}</td>}
                    {columnsVisible.paid && <td className="ar-align-right"><PaidAmount record={record} /></td>}
                    {columnsVisible.status && (
                      <td>
                        <span className={`badge ${getStatusColor(record.paymentStatus)}`}>
                          {getStatusLabel(record.paymentStatus)}
                        </span>
                      </td>
                    )}
                    {columnsVisible.shared && (
                      <td>
                        <span className={`badge ${record.shared ? 'badge-shared' : 'badge-neutral'}`}>
                          {record.shared ? 'Shared' : 'Unshared'}
                        </span>
                      </td>
                    )}
                    {columnsVisible.submitted && <td className="ar-nowrap">{formatDate(record.createdAt)}</td>}
                    {columnsVisible.paidBack && <td className="ar-nowrap">{record.paidBackAt ? formatDate(record.paidBackAt) : '—'}</td>}
                    {columnsVisible.notes && (
                      <td className="ar-notes-cell" title={record.notes || ''}>
                        {record.notes || '—'}
                      </td>
                    )}
                    <td>
                      <div className="ar-row-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm ar-icon-text-btn"
                          onClick={() => openDetail(record)}
                          aria-label={`View record ${record.giftCard}`}
                        >
                          <Eye size={14} aria-hidden="true" />
                          <span>View</span>
                        </button>
                        {record.paymentStatus === 'pending' ? (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => requestRecordAction('pay', record)}
                          >
                            Mark paid
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => requestRecordAction('undo', record)}
                          >
                            Undo
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm ar-icon-text-btn"
                          onClick={() => handleEdit(record)}
                          aria-label={`Edit record ${record.giftCard}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-view ar-mobile-list">
            <div className="mobile-select-all-row">
              <label className="mobile-select-all-label">
                <input
                  ref={mobileSelectAllRef}
                  type="checkbox"
                  checked={selected.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>Select all on this page</span>
              </label>
              {selected.size > 0 && <span className="mobile-selected-count">{selected.size} selected</span>}
            </div>

            {records.map((record) => (
              <article key={record._id} className={`mobile-record ar-mobile-record ${selected.has(record._id) ? 'mobile-record-selected' : ''}`}>
                <div className="mobile-record-header">
                  <div className="ar-mobile-title-wrap">
                    <button type="button" className="ar-record-link ar-mobile-title" onClick={() => openDetail(record)}>
                      {record.giftCard}
                    </button>
                    <div className="ar-mobile-user">
                      {record.user?.name || 'Unknown'}
                      {columnsVisible.shared && (
                        <span className={`badge ${record.shared ? 'badge-shared' : 'badge-neutral'}`}>
                          {record.shared ? 'Shared' : 'Unshared'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mobile-record-header-right">
                    <input
                      type="checkbox"
                      checked={selected.has(record._id)}
                      onChange={() => toggleSelect(record._id)}
                      aria-label={`Select record ${record.giftCard}`}
                    />
                    {columnsVisible.status && (
                      <span className={`badge ${getStatusColor(record.paymentStatus)}`}>
                        {getStatusLabel(record.paymentStatus)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="ar-mobile-details">
                  {columnsVisible.provider && (
                    <div><span>Provider</span><strong>{record.provider || '—'}</strong></div>
                  )}
                  {columnsVisible.amount && (
                    <div><span>GC amount</span><strong>{formatCurrency(record.giftCardAmount)}</strong></div>
                  )}
                  {columnsVisible.paid && (
                    <div><span>Paid amount</span><PaidAmount record={record} /></div>
                  )}
                  {columnsVisible.submitted && (
                    <div><span>Submitted</span><strong>{formatDate(record.createdAt)}</strong></div>
                  )}
                  {columnsVisible.paidBack && (
                    <div><span>Paid back</span><strong>{record.paidBackAt ? formatDate(record.paidBackAt) : '—'}</strong></div>
                  )}
                  {columnsVisible.notes && (
                    <div className="ar-mobile-notes"><span>Notes</span><strong>{record.notes || '—'}</strong></div>
                  )}
                </div>

                <div className="ar-mobile-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => openDetail(record)}>View details</button>
                  {record.paymentStatus === 'pending' ? (
                    <button type="button" className="btn btn-success btn-sm" onClick={() => requestRecordAction('pay', record)}>
                      Mark paid back
                    </button>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => requestRecordAction('undo', record)}>
                      Undo payment
                    </button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(record)}>Edit</button>
                </div>
              </article>
            ))}
          </div>

          <div className="ar-table-footer">
            <ListLimitSelect
              id="admin-records-limit"
              label="Rows per page"
              value={pageSize}
              onChange={handlePageSize}
              inline
            />
            {pagination.pages > 1 && (
              <div className="pagination ar-pagination">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || loading}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} aria-hidden="true" /> Prev
                </button>
                {pageItems.map((item) => (
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      className={page === item ? 'active' : ''}
                      onClick={() => setPage(item)}
                      disabled={loading}
                      aria-current={page === item ? 'page' : undefined}
                      aria-label={`Page ${item}`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={item} className="ar-page-gap" aria-hidden="true">…</span>
                  )
                ))}
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
                  disabled={page >= pagination.pages || loading}
                  aria-label="Next page"
                >
                  Next <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <RecordsFilterPanel
        open={filtersOpen}
        users={users}
        initialFilters={filters}
        initialSort={sort}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        onClose={() => setFiltersOpen(false)}
      />

      <RecordDetailDrawer
        record={detailRecord}
        busy={Boolean(drawerBusy)}
        onClose={() => setDetailRecord(null)}
        onEdit={handleEdit}
        onToggleShare={handleToggleShare}
        onPay={(record) => requestRecordAction('pay', record)}
        onUndo={(record) => requestRecordAction('undo', record)}
        onDelete={(record) => requestRecordAction('delete', record)}
      />

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={pendingCopy?.title || 'Confirm action'}
        message={pendingCopy && pendingAction ? pendingCopy.message(pendingAction.record) : ''}
        confirmLabel={pendingCopy?.confirmLabel || 'Confirm'}
        danger={Boolean(pendingCopy?.danger)}
        onConfirm={runRecordAction}
        onCancel={() => setPendingAction(null)}
        loading={actionLoading}
      />

      <ConfirmModal
        open={Boolean(pendingBulk)}
        title={bulkCopy?.title || 'Confirm bulk action'}
        message={bulkCopy ? bulkCopy.message(selected.size) : ''}
        confirmLabel={bulkCopy?.confirmLabel || 'Confirm'}
        danger={pendingBulk?.type === 'undo'}
        onConfirm={runBulkAction}
        onCancel={() => setPendingBulk(null)}
        loading={bulkLoading}
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setFormError(''); }}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingRecord ? 'Edit Record' : 'Add Record'}</h3>
              <button type="button" className="btn-icon" onClick={() => { setShowForm(false); setFormError(''); }} aria-label="Close record form">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div className="form-error-banner">
                    <span className="form-error-icon">!</span>
                    <span>{formError}</span>
                  </div>
                )}
                {!editingRecord && (
                  <div className="form-group">
                    <label className="form-label">Assign to User *</label>
                    <select className="form-select" value={formData.userId} onChange={(event) => setFormData({ ...formData, userId: event.target.value })} required>
                      <option value="">Select User</option>
                      {users.filter((user) => user.role === 'user').map((user) => (
                        <option key={user._id} value={user._id}>{user.name} ({user.email})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Gift Card *</label>
                  <input type="text" className="form-input" value={formData.giftCard} onChange={(event) => setFormData({ ...formData, giftCard: event.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gift Card PIN *</label>
                  <input type="text" className="form-input" value={formData.giftCardPin} onChange={(event) => setFormData({ ...formData, giftCardPin: event.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gift Card Provider *</label>
                  <div className="provider-select-row">
                    <select className="form-select" value={formData.provider} onChange={(event) => setFormData({ ...formData, provider: event.target.value })} required>
                      {providers.map((provider) => <option key={provider._id} value={provider.name}>{provider.name}</option>)}
                      {formData.provider && !providers.some((provider) => provider.name === formData.provider) && (
                        <option value={formData.provider}>{formData.provider}</option>
                      )}
                    </select>
                    <button type="button" className="btn btn-outline" onClick={() => setAddingProvider(!addingProvider)}>
                      {addingProvider ? 'Done' : 'Manage'}
                    </button>
                  </div>
                  {addingProvider && (
                    <div className="provider-manage">
                      <div className="provider-add-row">
                        <input type="text" className="form-input" placeholder="New provider name..." value={newProvider} onChange={(event) => setNewProvider(event.target.value)} maxLength={60} />
                        <button type="button" className="btn btn-primary" onClick={handleAddProvider}>Add</button>
                      </div>
                      {providers.filter((provider) => provider.isCustom).length > 0 && (
                        <ul className="provider-custom-list">
                          {providers.filter((provider) => provider.isCustom).map((provider) => (
                            <li key={provider._id}>
                              <span>{provider.name}</span>
                              <button type="button" className="btn-icon provider-remove" onClick={() => handleRemoveProvider(provider)} aria-label={`Remove ${provider.name}`}>
                                <X size={14} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {providers.filter((provider) => provider.isCustom).length === 0 && (
                        <p className="text-muted text-xs provider-empty-hint">No custom providers yet. Add one to make it available in every form.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Gift Card Amount ({editingRecord ? 'Original' : '₹'}){editingRecord ? '' : ' *'}</label>
                    <input type="number" className="form-input" value={formData.giftCardAmount} onChange={(event) => setFormData({ ...formData, giftCardAmount: event.target.value })} required={!editingRecord} disabled={Boolean(editingRecord)} min="0" step="0.01" />
                    {editingRecord && <small className="form-hint">Original amount is preserved and cannot be changed.</small>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Paid (₹) *</label>
                    <input type="number" className="form-input" value={formData.paid} onChange={(event) => setFormData({ ...formData, paid: event.target.value })} required min="0" step="0.01" />
                  </div>
                </div>
                {editingRecord && (
                  <div className="form-group">
                    <label className="form-label">Adjusted Paid Amount (₹)</label>
                    <div className="provider-select-row">
                      <input type="number" className="form-input" value={formData.adjustedAmount} onChange={(event) => setFormData({ ...formData, adjustedAmount: event.target.value })} min="0" step="0.01" placeholder="Override paid amount for totals (optional)" />
                      {formData.adjustedAmount !== '' && (
                        <button type="button" className="btn btn-outline" onClick={() => setFormData({ ...formData, adjustedAmount: '' })}>Clear</button>
                      )}
                    </div>
                    {editingRecord.adjustedAmount !== undefined && editingRecord.adjustedAmount !== null && (
                      <small className="form-hint">
                        Currently set to {formatCurrency(editingRecord.adjustedAmount)}
                        {editingRecord.adjustedBy && ` by ${editingRecord.adjustedBy.name}`}
                        {editingRecord.adjustedAt ? ` on ${formatDateTime(editingRecord.adjustedAt)}` : ''}.
                      </small>
                    )}
                    <small className="form-hint">Overrides the effective Paid amount for all totals and calculations. The original Paid value stays stored. Clear to revert.</small>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!editingRecord && downtimeActive}>
                  {editingRecord ? 'Update' : downtimeActive ? 'Maintenance mode' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
