import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Wallet, Receipt, Clock, Banknote, Hourglass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import api from '../utils/api';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '../utils/format';
import useModalScrollLock from '../hooks/useModalScrollLock';
import toast from 'react-hot-toast';

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [formData, setFormData] = useState({
    giftCard: '', giftCardPin: '', giftCardAmount: '', paid: '', notes: ''
  });
  const [formError, setFormError] = useState('');

  useModalScrollLock(showForm);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', page);
      params.set('limit', '20');

      const [recordsData, statsData] = await Promise.all([
        api.get(`/api/gc-records?${params}`),
        api.get('/api/stats/user')
      ]);

      setRecords(recordsData.records);
      setPagination(recordsData.pagination);
      setStats(statsData);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, startDate, endDate, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const body = {
        ...formData,
        giftCardAmount: parseFloat(formData.giftCardAmount),
        paid: parseFloat(formData.paid)
      };

      if (editingRecord) {
        await api.put(`/api/gc-records/${editingRecord._id}`, body);
        toast.success('Record updated');
      } else {
        await api.post('/api/gc-records', body);
        toast.success('Record created');
      }

      setShowForm(false);
      setEditingRecord(null);
      setFormData({ giftCard: '', giftCardPin: '', giftCardAmount: '', paid: '', notes: '' });
      setFormError('');
      fetchData();
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
      notes: record.notes || ''
    });
    setFormError('');
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await api.delete(`/api/gc-records/${id}`);
      toast.success('Record deleted');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-logo">GC Manager</span>
        </div>
        <div className="header-right">
          <span className="header-user">{user.name}</span>
          <span className="header-role role-user">User</span>
          <ThemeToggle />
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="main-content">
        <h2 className="section-title">My Dashboard</h2>
        <p className="section-subtitle">
          Overview of your gift card records and payment status against the gift card company.
        </p>

        <div className="stats-grid">
          <div className="stat-card stat-card-records">
            <div className="stat-card-head">
              <div className="stat-label">Total Cards</div>
              <span className="stat-card-icon" aria-hidden="true"><CreditCard size={16} /></span>
            </div>
            <div className="stat-value">{stats.totalRecords || 0}</div>
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
              <div className="stat-label">Total Paid</div>
              <span className="stat-card-icon" aria-hidden="true"><Receipt size={16} /></span>
            </div>
            <div className="stat-value text-primary">{formatCurrency(stats.totalPaid)}</div>
          </div>
          <div className="stat-card stat-card-pending-amt">
            <div className="stat-card-head">
              <div className="stat-label">Pending Amount</div>
              <span className="stat-card-icon" aria-hidden="true"><Clock size={16} /></span>
            </div>
            <div className="stat-value text-warning">{formatCurrency(stats.pendingAmount)}</div>
          </div>
          <div className="stat-card stat-card-paidback">
            <div className="stat-card-head">
              <div className="stat-label">Paid Back Amount</div>
              <span className="stat-card-icon" aria-hidden="true"><Banknote size={16} /></span>
            </div>
            <div className="stat-value text-success">{formatCurrency(stats.paidBackAmount)}</div>
          </div>
          <div className="stat-card stat-card-pending">
            <div className="stat-card-head">
              <div className="stat-label">Pending Cards</div>
              <span className="stat-card-icon" aria-hidden="true"><Hourglass size={16} /></span>
            </div>
            <div className="stat-value text-warning">{stats.pendingCount || 0}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">My Gift Cards</h2>
            <button type="button" className="btn btn-primary" onClick={() => { setEditingRecord(null); setFormData({ giftCard: '', giftCardPin: '', giftCardAmount: '', paid: '', notes: '' }); setFormError(''); setShowForm(true); }}>
              + Add Record
            </button>
          </div>

          <div className="filter-bar">
            <div className="search-input">
              <input
                type="text"
                className="form-input"
                placeholder="Search gift card, notes..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid_back">Paid Back</option>
            </select>
            <div className="filter-group">
              <label className="form-label">From</label>
              <input type="date" className="form-input form-input-date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
            </div>
            <div className="filter-group">
              <label className="form-label">To</label>
              <input type="date" className="form-input form-input-date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
            </div>
            <button className="btn btn-outline btn-sm" onClick={resetFilters}>Clear</button>
          </div>

          {records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">No records found</div>
              <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Add your first gift card record</p>
            </div>
          ) : (
            <>
              <p className="results-count" role="status">Showing <strong>{records.length}</strong> of <strong>{pagination.total}</strong> record(s)</p>
              <div className="table-container">
                <table className="table user-records-table">
                  <thead>
                    <tr>
                      <th>Gift Card</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Paid Back</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r._id}>
                        <td><strong>{r.giftCard}</strong></td>
                        <td>{formatCurrency(r.giftCardAmount)}</td>
                        <td>{formatCurrency(r.paid)}</td>
                        <td><span className={`badge ${getStatusColor(r.paymentStatus)}`}>{getStatusLabel(r.paymentStatus)}</span></td>
                        <td>{formatDate(r.createdAt)}</td>
                        <td>{r.paidBackAt ? formatDate(r.paidBackAt) : '—'}</td>
                        <td>
                          <div className="action-buttons">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>
                            <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(r._id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-view">
                {records.map(r => (
                  <div key={r._id} className="mobile-record">
                    <div className="mobile-record-header">
                      <div>
                        <div className="mobile-record-gc">{r.giftCard}</div>
                        <div className="text-muted text-xs">PIN: {r.giftCardPin}</div>
                      </div>
                      <span className={`badge ${getStatusColor(r.paymentStatus)}`}>{getStatusLabel(r.paymentStatus)}</span>
                    </div>
                    <div className="mobile-record-details">
                      <div><span className="text-muted">Amount:</span> {formatCurrency(r.giftCardAmount)}</div>
                      <div><span className="text-muted">Paid:</span> {formatCurrency(r.paid)}</div>
                      <div><span className="text-muted">Submitted:</span> {formatDate(r.createdAt)}</div>
                      <div><span className="text-muted">Paid Back:</span> {r.paidBackAt ? formatDate(r.paidBackAt) : '—'}</div>
                    </div>
                    {r.notes && <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--gray-600)' }}>Note: {r.notes}</div>}
                    <div className="mobile-record-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>
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
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setFormError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingRecord ? 'Edit Record' : 'Add Gift Card Record'}</h3>
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
                <div className="form-group">
                  <label className="form-label">Gift Card *</label>
                  <input type="text" className="form-input" value={formData.giftCard} onChange={e => setFormData({...formData, giftCard: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gift Card PIN *</label>
                  <input type="text" className="form-input" value={formData.giftCardPin} onChange={e => setFormData({...formData, giftCardPin: e.target.value})} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Gift Card Amount (₹) *</label>
                    <input type="number" className="form-input" value={formData.giftCardAmount} onChange={e => setFormData({...formData, giftCardAmount: e.target.value})} required min="0" step="0.01" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Paid (₹) *</label>
                    <input type="number" className="form-input" value={formData.paid} onChange={e => setFormData({...formData, paid: e.target.value})} required min="0" step="0.01" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Optional notes..." />
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
    </div>
  );
}
