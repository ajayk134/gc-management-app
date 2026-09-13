import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, UserCheck, CreditCard, Hourglass, CheckCircle2, Wallet, Receipt, Clock, Banknote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import api from '../utils/api';
import { formatCurrency, formatDate, formatDateTime, getStatusColor, getStatusLabel } from '../utils/format';
import useModalScrollLock from '../hooks/useModalScrollLock';
import toast from 'react-hot-toast';

const navItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'records', label: 'Records' },
  { key: 'users', label: 'Users' },
  { key: 'audit', label: 'Audit' }
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-logo">GC Manager</span>
        </div>
        <div className="header-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'active' : ''}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="header-right">
          <span className="header-user">{user.name}</span>
          <span className="header-role role-admin">Admin</span>
          <ThemeToggle />
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </header>
      <div className="main-content">
        {tab === 'dashboard' && <AdminStats />}
        {tab === 'records' && <AdminRecords />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'audit' && <AdminAudit />}
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, loading = false, danger = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn-icon" onClick={onCancel} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          <div className="confirm-dialog-text">{message}</div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [users, setUsers] = useState([]);
  const requestIdRef = useRef(0);

  const fetchStats = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilter) params.set('userId', userFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const data = await api.get(`/api/stats/admin?${params}`);
      if (requestId !== requestIdRef.current) return;
      setStats(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      toast.error('Failed to load stats');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [userFilter, startDate, endDate]);

  useEffect(() => {
    api.get('/api/users').then(d => setUsers(d.users)).catch(() => {});
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!stats) return <div className="empty-state"><div className="empty-state-text">Failed to load statistics</div></div>;

  return (
    <div>
      <h2 className="section-title">Admin Dashboard</h2>
      <p className="section-subtitle">
        Track gift card records, pending payments, and paid-back amounts across all users. Use the filters below to narrow the view.
      </p>
      
      <div className="filter-bar">
        <select className="form-select" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">All Users</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>
        <div className="filter-group">
          <label className="form-label">From</label>
          <input type="date" className="form-input form-input-date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="form-label">To</label>
          <input type="date" className="form-input form-input-date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-card-users">
          <div className="stat-card-head">
            <div className="stat-label">Total Users</div>
            <span className="stat-card-icon" aria-hidden="true"><Users size={16} /></span>
          </div>
          <div className="stat-value">{stats.totalUsers || 0}</div>
        </div>
        <div className="stat-card stat-card-active">
          <div className="stat-card-head">
            <div className="stat-label">Active Users</div>
            <span className="stat-card-icon" aria-hidden="true"><UserCheck size={16} /></span>
          </div>
          <div className="stat-value text-success">{stats.activeUsers || 0}</div>
        </div>
        <div className="stat-card stat-card-records">
          <div className="stat-card-head">
            <div className="stat-label">Total Records</div>
            <span className="stat-card-icon" aria-hidden="true"><CreditCard size={16} /></span>
          </div>
          <div className="stat-value">{stats.totalRecords || 0}</div>
        </div>
        <div className="stat-card stat-card-pending">
          <div className="stat-card-head">
            <div className="stat-label">Pending Records</div>
            <span className="stat-card-icon" aria-hidden="true"><Hourglass size={16} /></span>
          </div>
          <div className="stat-value text-warning">{stats.pendingCount || 0}</div>
        </div>
        <div className="stat-card stat-card-paid">
          <div className="stat-card-head">
            <div className="stat-label">Paid Back Records</div>
            <span className="stat-card-icon" aria-hidden="true"><CheckCircle2 size={16} /></span>
          </div>
          <div className="stat-value text-success">{stats.paidBackCount || 0}</div>
        </div>
        <div className="stat-card stat-card-gc">
          <div className="stat-card-head">
            <div className="stat-label">Total GC Amount</div>
            <span className="stat-card-icon" aria-hidden="true"><Wallet size={16} /></span>
          </div>
          <div className="stat-value">{formatCurrency(stats.totalAmount)}</div>
        </div>
        <div className="stat-card stat-card-paid-amt">
          <div className="stat-card-head">
            <div className="stat-label">Total Paid Amount</div>
            <span className="stat-card-icon" aria-hidden="true"><Receipt size={16} /></span>
          </div>
          <div className="stat-value text-primary">{formatCurrency(stats.totalPaid)}</div>
        </div>
        <div className="stat-card stat-card-pending-amt">
          <div className="stat-card-head">
            <div className="stat-label">Total Pending</div>
            <span className="stat-card-icon" aria-hidden="true"><Clock size={16} /></span>
          </div>
          <div className="stat-value text-warning">{formatCurrency(stats.pendingAmount)}</div>
        </div>
        <div className="stat-card stat-card-paidback">
          <div className="stat-card-head">
            <div className="stat-label">Total Paid Back</div>
            <span className="stat-card-icon" aria-hidden="true"><Banknote size={16} /></span>
          </div>
          <div className="stat-value text-success">{formatCurrency(stats.paidBackAmount)}</div>
        </div>
      </div>

      {stats.perUser && stats.perUser.length > 0 && (
        <div className="card per-user-section">
          <div className="card-header">
            <h3 className="card-title">Per-User Statistics</h3>
          </div>
          <div className="table-container">
            <table className="table per-user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Cards</th>
                  <th>GC Amount</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Paid Back</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.perUser.map(u => (
                  <tr key={u.userId}>
                    <td><strong>{u.name}</strong></td>
                    <td className="text-muted">{u.email}</td>
                    <td>{u.totalRecords}</td>
                    <td>{formatCurrency(u.totalAmount)}</td>
                    <td>{formatCurrency(u.totalPaid)}</td>
                    <td>
                      {formatCurrency(u.pendingAmount)}
                      {u.pendingCount > 0 && <div className="text-muted text-xs">{u.pendingCount} pending</div>}
                    </td>
                    <td>
                      {formatCurrency(u.paidBackAmount)}
                      {u.paidBackCount > 0 && <div className="text-muted text-xs">{u.paidBackCount} paid back</div>}
                    </td>
                    <td><span className={`badge ${u.active ? 'badge-active' : 'badge-disabled'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-view">
            {stats.perUser.map(u => (
              <div key={u.userId} className="mobile-user-stat-card">
                <div className="mobile-user-stat-header">
                  <div>
                    <div className="mobile-user-stat-name">{u.name}</div>
                    <div className="mobile-user-stat-email">{u.email}</div>
                  </div>
                  <span className={`badge ${u.active ? 'badge-active' : 'badge-disabled'}`}>{u.active ? 'Active' : 'Disabled'}</span>
                </div>
                <div className="mobile-user-stat-grid">
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Records</span>
                    <span className="mobile-user-stat-value">{u.totalRecords}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">GC Amount</span>
                    <span className="mobile-user-stat-value">{formatCurrency(u.totalAmount)}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Total Paid</span>
                    <span className="mobile-user-stat-value text-primary">{formatCurrency(u.totalPaid)}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Pending Amt</span>
                    <span className="mobile-user-stat-value text-warning">{formatCurrency(u.pendingAmount)}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Paid Back Amt</span>
                    <span className="mobile-user-stat-value text-success">{formatCurrency(u.paidBackAmount)}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Pending</span>
                    <span className="mobile-user-stat-value text-warning">{u.pendingCount || 0}</span>
                  </div>
                  <div className="mobile-user-stat-item">
                    <span className="mobile-user-stat-label">Paid Back</span>
                    <span className="mobile-user-stat-value text-success">{u.paidBackCount || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [selected, setSelected] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState('');
  const [providers, setProviders] = useState([]);
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProvider, setNewProvider] = useState('');
  const [pendingBulkShare, setPendingBulkShare] = useState(null);
  const [bulkSharing, setBulkSharing] = useState(false);
  const emptyForm = { giftCard: '', giftCardPin: '', giftCardAmount: '', paid: '', notes: '', userId: '', provider: 'Flipkart', adjustedAmount: '' };
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.get('/api/users').then(d => setUsers(d.users)).catch(() => {});
    api.get('/api/providers').then(d => setProviders(d.providers || [])).catch(() => {});
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (userFilter) params.set('userId', userFilter);
      params.set('page', page);
      params.set('limit', '20');

      const data = await api.get(`/api/gc-records?${params}`);
      setRecords(data.records);
      setPagination(data.pagination);
      setSelected(new Set());
    } catch (err) {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, startDate, endDate, page, userFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
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
      setFormData(emptyForm);
      setFormError('');
      setAddingProvider(false);
      setNewProvider('');
      fetchRecords();
    } catch (err) {
      if (err.message && err.message.includes('already been submitted')) {
        setFormError(err.message);
      } else {
        toast.error(err.message);
      }
    }
  };

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
    setShowForm(true);
  };

  const handleToggleShare = async (record) => {
    const next = !record.shared;
    try {
      await api.post(`/api/gc-records/${record._id}/share`, { shared: next });
      toast.success(next ? 'Record shared' : 'Record unshared');
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await api.delete(`/api/gc-records/${id}`);
      toast.success('Deleted');
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePayBack = async (id) => {
    if (!window.confirm('Mark this record as Paid Back?')) return;
    try {
      await api.post(`/api/gc-records/${id}/pay`, { adminNote: '' });
      toast.success('Marked as paid back');
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUndoPay = async (id) => {
    if (!window.confirm('Undo paid back status?')) return;
    try {
      await api.post(`/api/gc-records/${id}/undo-pay`);
      toast.success('Status reverted to pending');
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleBulkPay = async () => {
    if (selected.size === 0) return toast.error('Select records first');
    if (!window.confirm(`Mark ${selected.size} records as Paid Back?`)) return;
    try {
      const result = await api.post('/api/gc-records/bulk-pay', { recordIds: [...selected] });
      toast.success(result.message);
      setSelected(new Set());
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const [pendingBulkUndo, setPendingBulkUndo] = useState(false);
  const [bulkUndoing, setBulkUndoing] = useState(false);

  useModalScrollLock(showForm || pendingBulkUndo || Boolean(pendingBulkShare));

  const handleBulkUndo = () => {
    if (selected.size === 0) return toast.error('Select records first');
    setPendingBulkUndo(true);
  };

  const confirmBulkUndo = async () => {
    if (selected.size === 0) {
      setPendingBulkUndo(false);
      return toast.error('Select records first');
    }
    setBulkUndoing(true);
    try {
      const result = await api.post('/api/gc-records/bulk-undo-pay', { recordIds: [...selected] });
      const results = result.results || {};
      const successCount = Array.isArray(results.success) ? results.success.length : 0;
      const skippedCount = Array.isArray(results.skipped) ? results.skipped.length : 0;
      const failedCount = Array.isArray(results.failed) ? results.failed.length : 0;
      toast.success(result.message || `${successCount} record(s) reverted to pending`);
      if (skippedCount > 0) toast(`${skippedCount} skipped (not paid back)`);
      if (failedCount > 0) toast.error(`${failedCount} failed to undo`);
      setSelected(new Set());
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkUndoing(false);
      setPendingBulkUndo(false);
    }
  };

  const confirmBulkShare = async () => {
    if (selected.size === 0) {
      setPendingBulkShare(null);
      return toast.error('Select records first');
    }
    const shared = pendingBulkShare === 'share';
    setBulkSharing(true);
    try {
      const result = await api.post('/api/gc-records/bulk-share', { recordIds: [...selected], shared });
      const results = result.results || {};
      const successCount = Array.isArray(results.success) ? results.success.length : 0;
      const skippedCount = Array.isArray(results.skipped) ? results.skipped.length : 0;
      const failedCount = Array.isArray(results.failed) ? results.failed.length : 0;
      toast.success(result.message || `${successCount} record(s) ${shared ? 'shared' : 'unshared'}`);
      if (skippedCount > 0) toast(`${skippedCount} skipped (already in state)`);
      if (failedCount > 0) toast.error(`${failedCount} failed`);
      setSelected(new Set());
      fetchRecords();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkSharing(false);
      setPendingBulkShare(null);
    }
  };

  const handleAddProvider = async () => {
    const name = newProvider.trim();
    if (!name) return toast.error('Enter a provider name');
    if (name.length > 60) return toast.error('Provider name must be 60 characters or fewer');
    try {
      const data = await api.post('/api/providers', { name });
      setProviders(prev => {
        const next = prev.filter(p => p._id !== data.provider._id);
        next.push(data.provider);
        return next.sort((a, b) => (a.isCustom === b.isCustom ? a.name.localeCompare(b.name) : a.isCustom ? 1 : -1));
      });
      setFormData(fd => ({ ...fd, provider: data.provider.name }));
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
      setProviders(prev => prev.filter(p => p._id !== provider._id));
      toast.success('Provider removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map(r => r._id)));
    }
  };

  const handleExport = async (fmt) => {
    try {
      const params = new URLSearchParams();
      if (userFilter) params.set('userId', userFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const response = await api.downloadFile(`/api/export/${fmt}?${params}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gc-records.${fmt === 'excel' ? 'xlsx' : 'csv'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">All GC Records</h2>
        <div className="section-actions">
          <button type="button" className="btn btn-primary" onClick={() => { setEditingRecord(null); setFormData({ ...emptyForm, userId: users.filter(u => u.role === 'user')[0]?._id || '' }); setFormError(''); setAddingProvider(false); setNewProvider(''); setShowForm(true); }}>+ Add Record</button>
          <button type="button" className="btn btn-outline" onClick={() => handleExport('csv')}>Export CSV</button>
          <button type="button" className="btn btn-outline" onClick={() => handleExport('excel')}>Export Excel</button>
        </div>
        <p className="section-subtitle">
          View and manage all gift card records. Select one or more records to update their payment status in bulk.
        </p>
      </div>

      {!loading && records.length > 0 && (
        <div className={`bulk-action-bar ${selected.size === 0 ? 'bulk-action-bar-empty' : ''}`}>
          {selected.size > 0 ? (
            <span className="bulk-action-count">{selected.size} record(s) selected</span>
          ) : (
            <span className="bulk-action-count">Select records to perform bulk actions</span>
          )}
          <div className="bulk-action-buttons">
            <button type="button" className="btn btn-success btn-sm" onClick={handleBulkPay} disabled={selected.size === 0}>Mark Selected as Paid Back</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleBulkUndo} disabled={selected.size === 0}>Undo Selected</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPendingBulkShare('share')} disabled={selected.size === 0}>Share Selected</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPendingBulkShare('unshare')} disabled={selected.size === 0}>Unshare Selected</button>
            {selected.size > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
            )}
          </div>
        </div>
      )}
      {loading && <div className="bulk-action-bar bulk-action-bar-empty"><span className="bulk-action-count">Loading records...</span></div>}

      <div className="card">
        <div className="filter-bar">
          <div className="search-input">
            <input type="text" className="form-input" placeholder="Search card, notes..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="form-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid_back">Paid Back</option>
          </select>
          <select className="form-select" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }}>
            <option value="">All Users</option>
            {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
          <div className="filter-group">
            <label className="form-label">From</label>
            <input type="date" className="form-input form-input-date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
          </div>
          <div className="filter-group">
            <label className="form-label">To</label>
            <input type="date" className="form-input form-input-date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setStatusFilter(''); setStartDate(''); setEndDate(''); setUserFilter(''); setPage(1); }}>Clear</button>
        </div>

        {loading ? <div className="loading"><div className="spinner"></div></div> : records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">No records found</div>
          </div>
        ) : (
          <>
            <div className="table-container">
              <p className="results-count" role="status">Showing <strong>{records.length}</strong> of <strong>{pagination.total}</strong> record(s)</p>
              <table className="table table-compact records-table">
                <thead>
                  <tr>
                    <th style={{ width: '44px' }}>
                      <input
                        type="checkbox"
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < records.length; }}
                        checked={selected.size === records.length && records.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="Select all records on this page"
                      />
                    </th>
                    <th>User</th>
                    <th>Gift Card</th>
                    <th>Provider</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Shared</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Paid Back</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r._id} className={selected.has(r._id) ? 'selected-row' : ''}>
                      <td><input type="checkbox" checked={selected.has(r._id)} onChange={() => toggleSelect(r._id)} aria-label={`Select record ${r.giftCard}`} /></td>
                      <td>
                        <div className="td-bold">{r.user?.name || 'Unknown'}</div>
                        <div className="text-muted text-xs">{r.user?.email}</div>
                      </td>
                      <td><strong>{r.giftCard}</strong></td>
                      <td>{r.provider || '—'}</td>
                      <td>
                        {formatCurrency(r.giftCardAmount)}
                        {r.adjustedAmount !== undefined && r.adjustedAmount !== null && (
                          <div className="text-xs amount-adjusted">Adjusted: {formatCurrency(r.adjustedAmount)}</div>
                        )}
                      </td>
                      <td>{formatCurrency(r.paid)}</td>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox-shared"
                          checked={Boolean(r.shared)}
                          onChange={() => handleToggleShare(r)}
                          aria-label={r.shared ? 'Unshare this record' : 'Share this record'}
                        />
                      </td>
                      <td><span className={`badge ${getStatusColor(r.paymentStatus)}`}>{getStatusLabel(r.paymentStatus)}</span></td>
                      <td>{formatDate(r.createdAt)}</td>
                      <td>{r.paidBackAt ? formatDate(r.paidBackAt) : '—'}</td>
                      <td>
                        <div className="action-buttons">
                          <button type="button" className={r.shared ? 'btn btn-success btn-sm' : 'btn btn-outline btn-sm'} onClick={() => handleToggleShare(r)}>{r.shared ? 'Shared' : 'Share'}</button>
                          {r.paymentStatus === 'pending' ? (
                            <button type="button" className="btn btn-success btn-sm" onClick={() => handlePayBack(r._id)}>Pay</button>
                          ) : (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => handleUndoPay(r._id)}>Undo</button>
                          )}
                          <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(r._id)}>Del</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-view">
              {records.length > 0 && (
                <div className="mobile-select-all-row">
                  <label className="mobile-select-all-label">
                    <input
                      type="checkbox"
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < records.length; }}
                      checked={selected.size === records.length && records.length > 0}
                      onChange={toggleSelectAll}
                    />
                    <span>Select All</span>
                  </label>
                  {selected.size > 0 && (
                    <span className="mobile-selected-count">{selected.size} selected</span>
                  )}
                </div>
              )}
              {records.map(r => (
                <div key={r._id} className={`mobile-record ${selected.has(r._id) ? 'mobile-record-selected' : ''}`}>
                  <div className="mobile-record-header">
                    <div>
                      <div className="mobile-record-gc">
                        {r.giftCard}
                        {r.shared && <span className="badge badge-shared">Shared</span>}
                      </div>
                      <div className="text-muted text-xs">{r.user?.name}</div>
                    </div>
                    <div className="mobile-record-header-right">
                      <input type="checkbox" checked={selected.has(r._id)} onChange={() => toggleSelect(r._id)} aria-label={`Select record ${r.giftCard}`} />
                      <span className={`badge ${getStatusColor(r.paymentStatus)}`}>{getStatusLabel(r.paymentStatus)}</span>
                    </div>
                  </div>
                  <div className="mobile-record-details">
                    <div><span className="text-muted">Provider:</span> {r.provider || '—'}</div>
                    <div><span className="text-muted">Amount:</span> {formatCurrency(r.giftCardAmount)}</div>
                    {r.adjustedAmount !== undefined && r.adjustedAmount !== null && (
                      <div><span className="text-muted">Adjusted:</span> <span className="amount-adjusted">{formatCurrency(r.adjustedAmount)}</span></div>
                    )}
                    <div><span className="text-muted">Paid:</span> {formatCurrency(r.paid)}</div>
                    <div><span className="text-muted">Submitted:</span> {formatDate(r.createdAt)}</div>
                    <div><span className="text-muted">Paid Back:</span> {r.paidBackAt ? formatDate(r.paidBackAt) : '—'}</div>
                  </div>
                  <div className="mobile-record-actions">
                    <button type="button" className={r.shared ? 'btn btn-success btn-sm' : 'btn btn-outline btn-sm'} onClick={() => handleToggleShare(r)}>{r.shared ? 'Unshare' : 'Share'}</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>
                    {r.paymentStatus === 'pending' ? (
                      <button type="button" className="btn btn-success btn-sm" onClick={() => handlePayBack(r._id)}>Mark Paid</button>
                    ) : (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleUndoPay(r._id)}>Undo</button>
                    )}
                    <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(r._id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {pagination.pages > 1 && (
              <div className="pagination">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className="pagination-info">Page {page} of {pagination.pages}</span>
                <button disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setFormError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingRecord ? 'Edit Record' : 'Add Record'}</h3>
              <button className="btn-icon" onClick={() => { setShowForm(false); setFormError(''); }}>&times;</button>
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
                    <select className="form-select" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} required>
                      <option value="">Select User</option>
                      {users.filter(u => u.role === 'user').map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Gift Card *</label>
                  <input type="text" className="form-input" value={formData.giftCard} onChange={e => setFormData({...formData, giftCard: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gift Card PIN *</label>
                  <input type="text" className="form-input" value={formData.giftCardPin} onChange={e => setFormData({...formData, giftCardPin: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gift Card Provider *</label>
                  <div className="provider-select-row">
                    <select className="form-select" value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})} required>
                      {providers.map(p => <option key={p._id} value={p.name}>{p.name}</option>)}
                      {formData.provider && !providers.some(p => p.name === formData.provider) && (
                        <option value={formData.provider}>{formData.provider}</option>
                      )}
                    </select>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddingProvider(!addingProvider)}>
                      {addingProvider ? 'Done' : 'Manage'}
                    </button>
                  </div>
                  {addingProvider && (
                    <div className="provider-manage">
                      <div className="provider-add-row">
                        <input type="text" className="form-input" placeholder="New provider name..." value={newProvider} onChange={e => setNewProvider(e.target.value)} maxLength={60} />
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleAddProvider}>Add</button>
                      </div>
                      {providers.filter(p => p.isCustom).length > 0 && (
                        <ul className="provider-custom-list">
                          {providers.filter(p => p.isCustom).map(p => (
                            <li key={p._id}>
                              <span>{p.name}</span>
                              <button type="button" className="btn-icon provider-remove" onClick={() => handleRemoveProvider(p)} aria-label={`Remove ${p.name}`}>&times;</button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {providers.filter(p => p.isCustom).length === 0 && (
                        <p className="text-muted text-xs provider-empty-hint">No custom providers yet. Add one to make it available in every form.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Gift Card Amount ({editingRecord ? 'Original' : '₹'}){editingRecord ? '' : ' *'}</label>
                    <input type="number" className="form-input" value={formData.giftCardAmount} onChange={e => setFormData({...formData, giftCardAmount: e.target.value})} required={!editingRecord} disabled={Boolean(editingRecord)} min="0" step="0.01" />
                    {editingRecord && <small className="form-hint">Original amount is preserved and cannot be changed.</small>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Paid (₹) *</label>
                    <input type="number" className="form-input" value={formData.paid} onChange={e => setFormData({...formData, paid: e.target.value})} required min="0" step="0.01" />
                  </div>
                </div>
                {editingRecord && (
                  <div className="form-group">
                    <label className="form-label">Adjusted / Final Amount (₹)</label>
                    <div className="provider-select-row">
                      <input type="number" className="form-input" value={formData.adjustedAmount} onChange={e => setFormData({...formData, adjustedAmount: e.target.value})} min="0" step="0.01" placeholder="Leave empty to use the original amount" />
                      {formData.adjustedAmount !== '' && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormData({...formData, adjustedAmount: '' })}>Clear</button>
                      )}
                    </div>
                    {editingRecord.adjustedAmount !== undefined && editingRecord.adjustedAmount !== null && (
                      <small className="form-hint">Set to {formatCurrency(editingRecord.adjustedAmount)}{editingRecord.adjustedBy && ` by ${editingRecord.adjustedBy.name}`}{editingRecord.adjustedAt ? ` on ${formatDateTime(editingRecord.adjustedAt)}` : ''}.</small>
                    )}
                    <small className="form-hint">Users see both the original and this final amount. The original is never overwritten.</small>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingRecord ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingBulkUndo}
        title="Undo payment status"
        message={`Undo payment status for ${selected.size} selected record(s)? Paid Back records will be reverted to Pending and their Paid Back date will be cleared. Records that are already Pending will be skipped unchanged.`}
        confirmLabel="Undo"
        onConfirm={confirmBulkUndo}
        onCancel={() => setPendingBulkUndo(false)}
        loading={bulkUndoing}
      />

      <ConfirmModal
        open={Boolean(pendingBulkShare)}
        title={pendingBulkShare === 'share' ? 'Share selected records' : 'Unshare selected records'}
        message={`${pendingBulkShare === 'share' ? 'Share' : 'Unshare'} ${selected.size} selected record(s)? Records already ${pendingBulkShare === 'share' ? 'shared' : 'unshared'} will be skipped unchanged.`}
        confirmLabel={pendingBulkShare === 'share' ? 'Share' : 'Unshare'}
        onConfirm={confirmBulkShare}
        onCancel={() => setPendingBulkShare(null)}
        loading={bulkSharing}
      />
    </div>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useModalScrollLock(showForm || Boolean(resetPasswordUser));

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const data = await api.get(`/api/users?${params}`);
      setUsers(data.users);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/api/users/${editingUser._id}`, { name: formData.name, email: formData.email });
        toast.success('User updated');
      } else {
        await api.post('/api/users', formData);
        toast.success('User created');
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '' });
      fetchUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.put(`/api/users/${user._id}`, { active: !user.active });
      toast.success(user.active ? 'User disabled' : 'User enabled');
      fetchUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    try {
      await api.post(`/api/users/${resetPasswordUser._id}/reset-password`, { newPassword });
      toast.success('Password reset');
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.name}" and all their records?`)) return;
    try {
      await api.delete(`/api/users/${user._id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">User Management</h2>
        <button type="button" className="btn btn-primary" onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '' }); setShowForm(true); }}>+ Add User</button>
        <p className="section-subtitle">
          Create, edit, or manage access for users. Disabling a user prevents them from logging in.
        </p>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-input">
            <input type="text" className="form-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">No users found</div>
          </div>
        ) : (
          users.map(u => (
            <div key={u._id} className="user-card">
              <div className="user-card-header">
                <div>
                  <div className="user-card-name">{u.name}</div>
                  <div className="user-card-email">{u.email}</div>
                </div>
                <span className={`badge ${u.active ? 'badge-active' : 'badge-disabled'}`}>{u.active ? 'Active' : 'Disabled'}</span>
              </div>
              <div className="user-card-stats">
                <div><div className="user-card-stat-label">Cards</div><div className="user-card-stat-value">{u.stats?.totalRecords || 0}</div></div>
                <div><div className="user-card-stat-label">GC Amount</div><div className="user-card-stat-value">{formatCurrency(u.stats?.totalAmount)}</div></div>
                <div><div className="user-card-stat-label">Paid</div><div className="user-card-stat-value">{formatCurrency(u.stats?.totalPaid)}</div></div>
                <div><div className="user-card-stat-label">Pending</div><div className="user-card-stat-value">{formatCurrency(u.stats?.pendingAmount)}</div></div>
                <div><div className="user-card-stat-label">Paid Back</div><div className="user-card-stat-value">{formatCurrency(u.stats?.paidBackAmount)}</div></div>
              </div>
              <div className="user-card-actions">
                <button className="btn btn-outline btn-sm" onClick={() => { setEditingUser(u); setFormData({ name: u.name, email: u.email, password: '' }); setShowForm(true); }}>Edit</button>
                <button className="btn btn-outline btn-sm" onClick={() => handleToggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                <button className="btn btn-outline btn-sm" onClick={() => { setResetPasswordUser(u); setNewPassword(''); }}>Reset Password</button>
                <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(u)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingUser ? 'Edit User' : 'Add User'}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                </div>
                {!editingUser && (
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input type="password" className="form-input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required minLength={6} />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingUser ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPasswordUser && (
        <div className="modal-overlay" onClick={() => setResetPasswordUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password for {resetPasswordUser.name}</h3>
              <button className="btn-icon" onClick={() => setResetPasswordUser(null)}>&times;</button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setResetPasswordUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [actionFilter, setActionFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useModalScrollLock(Boolean(pendingDelete) || pendingBulkDelete);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', '30');
      if (actionFilter) params.set('action', actionFilter);
      const data = await api.get(`/api/audit?${params}`);
      setLogs(data.logs);
      setPagination(data.pagination);
      setSelected(new Set());
    } catch (err) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === logs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(logs.map(l => l._id)));
    }
  };

  const handleDeleteOne = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/audit/${pendingDelete._id}`);
      toast.success('Audit log deleted');
      setPendingDelete(null);
      fetchLogs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return toast.error('Select audit logs first');
    setPendingBulkDelete(true);
  };

  const confirmBulkDelete = async () => {
    if (selected.size === 0) {
      setPendingBulkDelete(false);
      return toast.error('Select audit logs first');
    }
    setDeleting(true);
    try {
      const result = await api.post('/api/audit/bulk-delete', { ids: [...selected] });
      toast.success(result.message || `${result.deletedCount} audit log(s) deleted`);
      setPendingBulkDelete(false);
      fetchLogs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const actionLabels = {
    user_created: 'User Created', user_edited: 'User Edited', user_deleted: 'User Deleted',
    user_disabled: 'User Disabled', user_enabled: 'User Enabled', password_reset: 'Password Reset',
    record_created: 'Record Created', record_edited: 'Record Edited', record_deleted: 'Record Deleted',
    record_paid_back: 'Record Paid Back', bulk_paid_back: 'Bulk Paid Back',
    login_success: 'Login Success', login_failed: 'Login Failed',
    provider_added: 'Provider Added', provider_removed: 'Provider Removed',
    record_shared: 'Record Shared', record_unshared: 'Record Unshared',
    bulk_shared: 'Bulk Shared', bulk_unshared: 'Bulk Unshared'
  };

  const actionBadgeClass = (action) => {
    if (action === 'login_failed' || action === 'provider_removed' || action === 'record_unshared' || action === 'bulk_unshared') return 'badge-disabled';
    if (action === 'user_deleted' || action === 'record_deleted') return 'badge-danger';
    if (action === 'user_disabled') return 'badge-warning';
    if (action === 'login_success' || action === 'user_enabled' || action === 'record_paid_back' || action === 'bulk_paid_back' || action === 'record_shared' || action === 'bulk_shared') return 'badge-active';
    if (action === 'user_created' || action === 'record_created' || action === 'provider_added') return 'badge-primary';
    return 'status-pending';
  };

  const redactSensitive = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactSensitive);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/pin|password|secret|token|mongodb|apikey|api_key/i.test(k)) continue;
      out[k] = redactSensitive(v);
    }
    return out;
  };

  const formatDetails = (metadata) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    return JSON.stringify(redactSensitive(metadata));
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const allSelected = logs.length > 0 && selected.size === logs.length;

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Audit History</h2>
        <p className="section-subtitle">
          A chronological record of all actions taken in the system. Use the filter to focus on specific activity.
        </p>
      </div>

      {!loading && logs.length > 0 && (
        <div className={`bulk-action-bar ${selected.size === 0 ? 'bulk-action-bar-empty' : ''}`}>
          {selected.size > 0 ? (
            <span className="bulk-action-count">{selected.size} audit log(s) selected</span>
          ) : (
            <span className="bulk-action-count">Select audit logs to delete them</span>
          )}
          <div className="bulk-action-buttons">
            <button type="button" className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={deleting || selected.size === 0}>Delete Selected</button>
            {selected.size > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())} disabled={deleting}>Clear Selection</button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="filter-bar">
          <select className="form-select" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
            <option value="">All Actions</option>
            {Object.entries(actionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table className="table table-compact audit-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < logs.length; }}
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all audit logs"
                  />
                </th>
                <th>Date / Time</th>
                <th>Action</th>
                <th>User</th>
                <th>Target</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id} className={selected.has(log._id) ? 'selected-row' : ''}>
                  <td><input type="checkbox" checked={selected.has(log._id)} onChange={() => toggleSelect(log._id)} aria-label={`Select ${actionLabels[log.action] || log.action} log`} /></td>
                  <td className="text-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td><span className={`badge ${actionBadgeClass(log.action)}`}>{actionLabels[log.action] || log.action}</span></td>
                  <td>{log.performedBy?.name || 'System'}</td>
                  <td><span className="badge badge-neutral">{log.targetType === 'user' ? 'User' : 'Record'}</span></td>
                  <td className="text-muted text-xs audit-details-cell">
                    <span className="audit-details-text">{formatDetails(log.metadata)}</span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setPendingDelete(log)} disabled={deleting}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '2rem' }}>No audit logs found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mobile-view">
          {logs.length > 0 && (
            <div className="mobile-select-all-row">
              <label className="mobile-select-all-label">
                <input
                  type="checkbox"
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < logs.length; }}
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                <span>Select All</span>
              </label>
              {selected.size > 0 && (
                <span className="mobile-selected-count">{selected.size} selected</span>
              )}
            </div>
          )}
          {logs.map(log => (
            <div key={log._id} className={`mobile-audit-card ${selected.has(log._id) ? 'mobile-record-selected' : ''}`}>
              <div className="mobile-audit-header">
                <span className={`badge ${actionBadgeClass(log.action)}`}>{actionLabels[log.action] || log.action}</span>
                <span className="mobile-audit-header-right">
                  <span className="text-muted text-xs">{formatDateTime(log.createdAt)}</span>
                  <input type="checkbox" checked={selected.has(log._id)} onChange={() => toggleSelect(log._id)} aria-label={`Select ${actionLabels[log.action] || log.action} log`} />
                </span>
              </div>
              <div className="mobile-audit-body">
                <div className="mobile-audit-user">
                  <span className="text-muted">User:</span> {log.performedBy?.name || 'System'}
                </div>
                <div className="mobile-audit-user">
                  <span className="text-muted">Target:</span> <span className={`badge badge-neutral`}>{log.targetType === 'user' ? 'User' : 'Record'}</span>
                </div>
                {formatDetails(log.metadata) && (
                  <div className="mobile-audit-details">
                    <span className="text-muted">Details:</span> {formatDetails(log.metadata).substring(0, 200)}
                  </div>
                )}
              </div>
              <div className="mobile-record-actions">
                <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setPendingDelete(log)} disabled={deleting}>Delete</button>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">No audit logs found</div>
            </div>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="pagination">
            <button disabled={page === 1 || deleting} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span className="pagination-info">Page {page} of {pagination.pages}</span>
            <button disabled={page === pagination.pages || deleting} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete audit log"
        message="Delete this audit log entry? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteOne}
        onCancel={() => setPendingDelete(null)}
        loading={deleting}
      />

      <ConfirmModal
        open={pendingBulkDelete}
        title="Delete selected audit logs"
        message={`Delete ${selected.size} selected audit log entr${selected.size === 1 ? 'y' : 'ies'}? Only the explicitly selected entries will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDelete(false)}
        loading={deleting}
      />
    </div>
  );
}
