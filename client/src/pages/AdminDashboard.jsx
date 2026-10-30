import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, UserCheck, CreditCard, Hourglass, CheckCircle2, Wallet, Receipt, Clock, Banknote, Power, Wrench, CalendarClock, ChevronDown, Pencil, Play, Trash2, X } from 'lucide-react';
import useNow from '../hooks/useNow';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import DowntimeRibbon from '../components/DowntimeRibbon';
import { useDowntime } from '../context/DowntimeContext';
import api from '../utils/api';
import { formatCurrency, formatDateTime, formatCountdown } from '../utils/format';
import ListLimitSelect from '../components/ListLimitSelect';
import ConfirmModal from '../components/ConfirmModal';
import AdminRecords from './AdminRecords';
import { limitItems } from '../utils/listLimits';
import useModalScrollLock from '../hooks/useModalScrollLock';
import toast from 'react-hot-toast';

const navItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'records', label: 'Records' },
  { key: 'users', label: 'Users' },
  { key: 'downtime', label: 'Downtime' },
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
        <DowntimeRibbon showActive />
        {tab === 'dashboard' && <AdminStats />}
        {tab === 'records' && <AdminRecords />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'downtime' && <AdminDowntime />}
        {tab === 'audit' && <AdminAudit />}
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
  const [perUserLimit, setPerUserLimit] = useState(10);
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

  const visiblePerUser = limitItems(stats.perUser || [], perUserLimit);

  return (
    <div>
      <h2 className="section-title">Admin Dashboard</h2>
      
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
        <>
          <div className="section-subtitle-row">
            <h3 className="section-subtitle">Per-User Statistics</h3>
            <ListLimitSelect
              id="admin-per-user-limit"
              label="Show"
              value={perUserLimit}
              onChange={setPerUserLimit}
            />
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
                {visiblePerUser.map(u => (
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
            {visiblePerUser.map(u => (
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
          {stats.perUser.length > visiblePerUser.length && (
            <div className="payment-limit-note">
              <span>Showing {visiblePerUser.length} of {stats.perUser.length} users.</span>
              <button type="button" className="link-button" onClick={() => setPerUserLimit('all')}>Show all</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function toLocalDateTimeInput(value) {
  const d = value ? new Date(value) : new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function splitLocalDateTimeInput(value) {
  const [date = '', time = ''] = String(value || '').split('T');
  return { date, time: time.slice(0, 5) };
}

function nextQuarter(offsetMinutes = 60) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  d.setSeconds(0, 0);
  const remainder = d.getMinutes() % 15;
  if (remainder !== 0) d.setMinutes(d.getMinutes() + (15 - remainder));
  return d;
}

function defaultDowntimeForm() {
  const startDate = nextQuarter(60);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const start = splitLocalDateTimeInput(toLocalDateTimeInput(startDate));
  const end = splitLocalDateTimeInput(toLocalDateTimeInput(endDate));
  return {
    title: '',
    message: '',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    immediate: false
  };
}

function downtimeToForm(item) {
  const start = splitLocalDateTimeInput(toLocalDateTimeInput(item.startAt));
  const end = splitLocalDateTimeInput(toLocalDateTimeInput(item.endAt));
  return {
    title: item.title || '',
    message: item.message || '',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    immediate: false
  };
}

function combineLocalDate(date, time) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateDowntimeForm(form) {
  const errors = {};
  const startAt = form.immediate ? new Date() : combineLocalDate(form.startDate, form.startTime);
  const endAt = combineLocalDate(form.endDate, form.endTime);

  if (!form.immediate && !startAt) {
    errors.start = 'Choose a start date and time';
  } else if (startAt && startAt.getTime() < Date.now() - 60000) {
    errors.start = 'Start must not be in the past';
  }

  if (!endAt) {
    errors.end = 'Choose an end date and time';
  } else if (endAt <= new Date()) {
    errors.end = 'End must be in the future';
  } else if (startAt && endAt <= startAt) {
    errors.end = 'End must be after the start';
  }

  return { errors, startAt, endAt };
}

const TIMEZONE_NAME = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
})();

const TIMEZONE_OFFSET = (() => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date());
    return parts.find(part => part.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
})();

const downtimeStatusLabels = {
  scheduled: 'Scheduled',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const downtimeStatusClasses = {
  scheduled: 'badge-primary',
  active: 'badge-danger',
  completed: 'badge-neutral',
  cancelled: 'badge-disabled'
};

function DowntimeActionMenu({ open, onToggle, children }) {
  return (
    <div className="downtime-action-menu">
      <button type="button" className="btn btn-outline btn-sm" onClick={onToggle} aria-expanded={open}>
        Manage <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="downtime-action-menu-list" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

function AdminDowntime() {
  const { refresh: refreshDowntimeStatus } = useDowntime();
  const now = useNow();
  const [data, setData] = useState({ downtimes: [], active: false, current: null, upcoming: null });
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState(null);
  const [formData, setFormData] = useState(defaultDowntimeForm);
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  useModalScrollLock(Boolean(formState) || Boolean(pendingAction));

  const fetchData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const result = await api.get('/api/downtime');
      setData({
        downtimes: result.downtimes || [],
        active: Boolean(result.active),
        current: result.current || null,
        upcoming: result.upcoming || null
      });
    } catch (err) {
      toast.error('Failed to load scheduled downtime');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 20000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = () => setOpenMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [openMenuId]);

  const transitionAt = data.active ? data.current?.endAt : data.upcoming?.startAt;
  useEffect(() => {
    if (!transitionAt) return;
    const delay = new Date(transitionAt).getTime() - Date.now() + 600;
    if (!Number.isFinite(delay) || delay > 2147483647) return;
    const timer = setTimeout(() => {
      fetchData(false);
      refreshDowntimeStatus();
    }, Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [transitionAt, fetchData, refreshDowntimeStatus]);

  const openCreate = () => {
    setFormData(defaultDowntimeForm());
    setTouched({});
    setFormError('');
    setFormState({ mode: 'create', id: null });
  };

  const openEdit = (item) => {
    setOpenMenuId(null);
    setFormData(downtimeToForm(item));
    setTouched({});
    setFormError('');
    setFormState({ mode: 'edit', id: item._id });
  };

  const closeForm = () => {
    if (saving) return;
    setFormState(null);
    setTouched({});
    setFormError('');
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
    setFormError('');
  };

  const validation = validateDowntimeForm(formData);
  const errors = validation.errors;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ start: true, end: true });
    if (Object.keys(errors).length > 0) return;

    const payload = {
      title: formData.title.trim(),
      message: formData.message.trim(),
      startAt: validation.startAt.toISOString(),
      endAt: validation.endAt.toISOString()
    };

    setSaving(true);
    setFormError('');
    try {
      if (formState.mode === 'edit') {
        await api.put(`/api/downtime/${formState.id}`, payload);
        toast.success('Maintenance window updated');
      } else {
        await api.post('/api/downtime', payload);
        toast.success(formData.immediate ? 'Maintenance started' : 'Maintenance scheduled');
      }
      setFormState(null);
      setTouched({});
      await fetchData(false);
      refreshDowntimeStatus();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!pendingAction) return;
    const { type, downtime } = pendingAction;
    setActionId(downtime._id);
    try {
      if (type === 'delete') {
        await api.delete(`/api/downtime/${downtime._id}`);
      } else {
        await api.post(`/api/downtime/${downtime._id}/${type}`);
      }
      const messages = {
        start: 'Maintenance started now',
        stop: 'Maintenance ended',
        cancel: 'Scheduled maintenance cancelled',
        delete: 'Maintenance entry deleted'
      };
      toast.success(messages[type]);
      setPendingAction(null);
      setOpenMenuId(null);
      await fetchData(false);
      refreshDowntimeStatus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionId(null);
    }
  };

  const actionCopy = {
    start: {
      title: 'Start maintenance now',
      message: 'New gift card submissions will be blocked immediately. Users can still sign in and view existing records. Continue?',
      confirmLabel: 'Start now',
      danger: false
    },
    stop: {
      title: 'End maintenance now',
      message: 'End the active maintenance window and allow new gift card submissions again?',
      confirmLabel: 'End maintenance',
      danger: true
    },
    cancel: {
      title: 'Cancel scheduled maintenance',
      message: 'Cancel this future maintenance window? Users will no longer see it as upcoming.',
      confirmLabel: 'Cancel window',
      danger: true
    },
    delete: {
      title: 'Delete maintenance entry',
      message: 'Delete this completed or cancelled entry? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true
    }
  };

  const confirmation = pendingAction ? actionCopy[pendingAction.type] : null;
  const activeCountdown = data.active && data.current?.endAt ? formatCountdown(data.current.endAt, now) : null;
  const upcomingCountdown = data.upcoming ? formatCountdown(data.upcoming.startAt, now) : null;

  const primaryAction = data.active && data.current
    ? { label: 'End maintenance now', kind: 'stop', downtime: data.current, icon: Power }
    : data.upcoming
      ? { label: 'Start next window', kind: 'start', downtime: data.upcoming, icon: Play }
      : { label: 'Schedule maintenance', kind: 'create', icon: CalendarClock };

  const handlePrimary = () => {
    if (primaryAction.kind === 'create') {
      openCreate();
    } else {
      setPendingAction({ type: primaryAction.kind, downtime: primaryAction.downtime });
    }
  };

  const rowActions = (item) => {
    const status = item.status;
    if (status === 'scheduled') {
      return (
        <>
          <button type="button" className="downtime-menu-item" role="menuitem" onClick={() => openEdit(item)}>
            <Pencil size={14} aria-hidden="true" /> Edit &amp; reschedule
          </button>
          <button type="button" className="downtime-menu-item downtime-menu-item-danger" role="menuitem" onClick={() => { setOpenMenuId(null); setPendingAction({ type: 'cancel', downtime: item }); }}>
            <X size={14} aria-hidden="true" /> Cancel window
          </button>
        </>
      );
    }
    if (status === 'completed' || status === 'cancelled') {
      return (
        <button type="button" className="downtime-menu-item downtime-menu-item-danger" role="menuitem" onClick={() => { setOpenMenuId(null); setPendingAction({ type: 'delete', downtime: item }); }}>
          <Trash2 size={14} aria-hidden="true" /> Delete entry
        </button>
      );
    }
    return null;
  };

  const PrimaryIcon = primaryAction.icon;

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Maintenance &amp; Downtime</h2>
          <p className="section-subtitle">Schedule automatic windows or control maintenance manually. Login and existing records stay available throughout.</p>
        </div>
      </div>

      <div className={`downtime-control-card ${data.active ? 'downtime-control-card-active' : ''}`}>
        <div className="downtime-control-main">
          <div className={`downtime-control-icon ${data.active ? 'downtime-control-icon-active' : ''}`} aria-hidden="true">
            {data.active ? <Wrench size={22} /> : <Power size={22} />}
          </div>
          <div className="downtime-control-copy">
            <span className="downtime-control-eyebrow">Maintenance mode</span>
            <strong className="downtime-control-title">
              {data.active
                ? 'New gift card submissions are paused'
                : data.upcoming
                  ? 'Next maintenance window is scheduled'
                  : 'Application is live'}
            </strong>
            <p className="downtime-control-text">
              {data.active
                ? (data.current?.message || 'Users can still sign in and view existing records. Only new gift card submissions are blocked.')
                : data.upcoming
                  ? `${formatDateTime(data.upcoming.startAt)} to ${formatDateTime(data.upcoming.endAt)}`
                  : 'No maintenance is scheduled. New gift card submissions are available to every role.'}
            </p>
            {data.active && (
              <span className="downtime-live-meta">
                {activeCountdown ? `Ends in ${activeCountdown}` : 'Until ended manually'}
              </span>
            )}
            {!data.active && data.upcoming && (
              <span className="downtime-live-meta">Starts in {upcomingCountdown}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`btn ${data.active ? 'btn-danger' : 'btn-primary'} downtime-control-button`}
          onClick={handlePrimary}
          disabled={Boolean(actionId)}
        >
          <PrimaryIcon size={15} aria-hidden="true" />
          {primaryAction.label}
        </button>
      </div>

      <div className="downtime-summary-grid">
        <div className={`downtime-summary-card ${data.active ? 'downtime-summary-card-active' : ''}`}>
          <span className="downtime-summary-label">Current status</span>
          <strong className="downtime-summary-value">
            {data.active ? 'Maintenance active' : 'Normal operation'}
          </strong>
          <span className="downtime-summary-meta">
            {data.active && data.current
              ? (data.current.endAt ? `Creation reopens ${formatDateTime(data.current.endAt)}` : 'Creation stays paused until maintenance is ended manually')
              : 'All users can create and view gift card records'}
          </span>
        </div>
        <div className="downtime-summary-card">
          <span className="downtime-summary-label">Next maintenance</span>
          <strong className="downtime-summary-value">
            {data.upcoming ? formatDateTime(data.upcoming.startAt) : 'None scheduled'}
          </strong>
          <span className="downtime-summary-meta">
            {data.upcoming
              ? `Ends ${formatDateTime(data.upcoming.endAt)} · starts in ${upcomingCountdown}${data.upcoming.title ? ` · ${data.upcoming.title}` : ''}`
              : 'Configure a start and end time to run maintenance automatically'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : data.downtimes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛠️</div>
          <div className="empty-state-text">No maintenance scheduled</div>
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Schedule a window to notify users in advance and pause new submissions automatically.</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table table-compact downtime-table">
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.downtimes.map(item => {
                  const status = item.status;
                  const actions = rowActions(item);
                  return (
                    <tr key={item._id}>
                      <td className="text-nowrap">
                        <div className="downtime-window-cell">
                          <span><strong>{formatDateTime(item.startAt)}</strong></span>
                          <span className="text-muted text-xs">to {formatDateTime(item.endAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="td-bold">{item.title || 'Scheduled maintenance'}</div>
                        {item.message && <div className="text-muted text-xs downtime-message-cell">{item.message}</div>}
                      </td>
                      <td>
                        <span className={`badge ${downtimeStatusClasses[status] || 'badge-neutral'}`}>
                          {downtimeStatusLabels[status] || status}
                        </span>
                      </td>
                      <td className="text-muted">{item.createdBy?.name || 'Administrator'}</td>
                      <td>
                        {actions ? (
                          <DowntimeActionMenu
                            open={openMenuId === item._id}
                            onToggle={(event) => {
                              event.stopPropagation();
                              setOpenMenuId(openMenuId === item._id ? null : item._id);
                            }}
                          >
                            {actions}
                          </DowntimeActionMenu>
                        ) : (
                          <span className="text-muted text-xs">{status === 'active' ? 'Use primary action' : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-view">
            {data.downtimes.map(item => {
              const status = item.status;
              const actions = rowActions(item);
              return (
                <div key={item._id} className="mobile-record downtime-mobile-card">
                  <div className="mobile-record-header">
                    <div>
                      <div className="mobile-record-gc">{item.title || 'Scheduled maintenance'}</div>
                      <div className="text-muted text-xs">{formatDateTime(item.startAt)}</div>
                    </div>
                    <span className={`badge ${downtimeStatusClasses[status] || 'badge-neutral'}`}>
                      {downtimeStatusLabels[status] || status}
                    </span>
                  </div>
                  <div className="mobile-record-details">
                    <div><span className="text-muted">Ends:</span> {formatDateTime(item.endAt)}</div>
                    <div><span className="text-muted">Created by:</span> {item.createdBy?.name || 'Administrator'}</div>
                    {item.message && <div><span className="text-muted">Message:</span> {item.message}</div>}
                  </div>
                  {actions && (
                    <div className="mobile-record-actions">
                      <DowntimeActionMenu
                        open={openMenuId === item._id}
                        onToggle={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === item._id ? null : item._id);
                        }}
                      >
                        {actions}
                      </DowntimeActionMenu>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {formState && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal downtime-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{formState.mode === 'edit' ? 'Edit maintenance window' : 'Schedule maintenance'}</h3>
              <button className="btn-icon" onClick={closeForm} disabled={saving} aria-label="Close">&times;</button>
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
                  <label className="form-label" htmlFor="downtime-title">Title <span className="downtime-optional">optional</span></label>
                  <input
                    type="text"
                    id="downtime-title"
                    className="form-input"
                    value={formData.title}
                    onChange={e => updateField('title', e.target.value)}
                    maxLength={120}
                    placeholder="Scheduled maintenance"
                  />
                </div>

                {formState.mode === 'create' && (
                  <label className="downtime-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.immediate}
                      onChange={e => updateField('immediate', e.target.checked)}
                    />
                    <span>Start immediately</span>
                    <small>Blocks new submissions as soon as you save.</small>
                  </label>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="downtime-start">Start date &amp; time *</label>
                    <div className="downtime-datetime-fields">
                      <input
                        type="date"
                        id="downtime-start"
                        className={`form-input ${touched.start && errors.start ? 'is-invalid' : ''}`}
                        value={formData.startDate}
                        onChange={e => updateField('startDate', e.target.value)}
                        onBlur={() => setTouched(prev => ({ ...prev, start: true }))}
                        aria-label="Start date"
                        disabled={formData.immediate}
                        required={!formData.immediate}
                      />
                      <input
                        type="time"
                        id="downtime-start-time"
                        className={`form-input ${touched.start && errors.start ? 'is-invalid' : ''}`}
                        value={formData.startTime}
                        onChange={e => updateField('startTime', e.target.value)}
                        onBlur={() => setTouched(prev => ({ ...prev, start: true }))}
                        aria-label="Start time"
                        disabled={formData.immediate}
                        required={!formData.immediate}
                      />
                    </div>
                    {formData.immediate ? (
                      <small className="form-hint">Starts immediately when saved.</small>
                    ) : touched.start && errors.start ? (
                      <small className="downtime-field-error">{errors.start}</small>
                    ) : null}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="downtime-end">End date &amp; time *</label>
                    <div className="downtime-datetime-fields">
                      <input
                        type="date"
                        id="downtime-end"
                        className={`form-input ${touched.end && errors.end ? 'is-invalid' : ''}`}
                        value={formData.endDate}
                        onChange={e => updateField('endDate', e.target.value)}
                        onBlur={() => setTouched(prev => ({ ...prev, end: true }))}
                        aria-label="End date"
                        required
                      />
                      <input
                        type="time"
                        id="downtime-end-time"
                        className={`form-input ${touched.end && errors.end ? 'is-invalid' : ''}`}
                        value={formData.endTime}
                        onChange={e => updateField('endTime', e.target.value)}
                        onBlur={() => setTouched(prev => ({ ...prev, end: true }))}
                        aria-label="End time"
                        required
                      />
                    </div>
                    {touched.end && errors.end && <small className="downtime-field-error">{errors.end}</small>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="downtime-message">Message shown to users</label>
                  <textarea
                    id="downtime-message"
                    className="form-textarea"
                    value={formData.message}
                    onChange={e => updateField('message', e.target.value)}
                    maxLength={500}
                    placeholder="Optional message explaining the maintenance..."
                  />
                  <small className="form-hint">{formData.message.length}/500 characters. Times use {TIMEZONE_NAME}{TIMEZONE_OFFSET ? ` (${TIMEZONE_OFFSET})` : ''} and are enforced in UTC.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeForm} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? 'Please wait...'
                    : formState.mode === 'edit'
                      ? 'Save changes'
                      : formData.immediate
                        ? 'Start maintenance'
                        : 'Schedule maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={confirmation?.title || 'Confirm'}
        message={confirmation?.message || 'Are you sure?'}
        confirmLabel={confirmation?.confirmLabel || 'Confirm'}
        danger={Boolean(confirmation?.danger)}
        onConfirm={runAction}
        onCancel={() => { if (!actionId) setPendingAction(null); }}
        loading={Boolean(actionId)}
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
  const [listLimit, setListLimit] = useState(10);

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

  const visibleUsers = limitItems(users, listLimit);

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">User Management</h2>
        <button type="button" className="btn btn-primary" onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '' }); setShowForm(true); }}>+ Add User</button>
      </div>

      <div className="filter-bar">
        <div className="search-input">
          <input type="text" className="form-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ListLimitSelect
          id="admin-users-limit"
          label="Show"
          value={listLimit}
          onChange={setListLimit}
        />
      </div>

        {users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">No users found</div>
          </div>
        ) : (
          visibleUsers.map(u => (
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
        {users.length > visibleUsers.length && (
          <div className="payment-limit-note">
            <span>Showing {visibleUsers.length} of {users.length} users.</span>
            <button type="button" className="link-button" onClick={() => setListLimit('all')}>Show all</button>
          </div>
        )}

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
  const [listLimit, setListLimit] = useState(20);

  useModalScrollLock(Boolean(pendingDelete) || pendingBulkDelete);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', listLimit === 'all' ? 'all' : String(listLimit));
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
  }, [page, actionFilter, listLimit]);

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
    bulk_shared: 'Bulk Shared', bulk_unshared: 'Bulk Unshared',
    downtime_scheduled: 'Downtime Scheduled', downtime_started: 'Downtime Started',
    downtime_stopped: 'Downtime Stopped', downtime_cancelled: 'Downtime Cancelled',
    downtime_deleted: 'Downtime Deleted'
  };

  const actionBadgeClass = (action) => {
    if (action === 'login_failed' || action === 'provider_removed' || action === 'record_unshared' || action === 'bulk_unshared') return 'badge-disabled';
    if (action === 'user_deleted' || action === 'record_deleted') return 'badge-danger';
    if (action === 'user_disabled') return 'badge-warning';
    if (action === 'login_success' || action === 'user_enabled' || action === 'record_paid_back' || action === 'bulk_paid_back' || action === 'record_shared' || action === 'bulk_shared') return 'badge-active';
    if (action === 'user_created' || action === 'record_created' || action === 'provider_added' || action === 'downtime_scheduled') return 'badge-primary';
    if (action === 'downtime_started') return 'badge-danger';
    if (action === 'downtime_stopped' || action === 'downtime_cancelled' || action === 'downtime_deleted') return 'badge-neutral';
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
      </div>

      <div className="filter-bar">
        <select className="form-select" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          {Object.entries(actionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <ListLimitSelect
          id="admin-audit-limit"
          label="Show"
          value={listLimit}
          onChange={(value) => { setListLimit(value); setPage(1); }}
        />
      </div>

      {!loading && logs.length > 0 && (
        <p className="results-count" role="status">Showing <strong>{logs.length}</strong> of <strong>{pagination.total}</strong> audit log(s)</p>
      )}

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
                  <td><span className="badge badge-neutral">{log.targetType === 'user' ? 'User' : log.targetType === 'record' ? 'Record' : log.targetType === 'downtime' ? 'Downtime' : 'Provider'}</span></td>
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
                  <span className="text-muted">Target:</span> <span className={`badge badge-neutral`}>{log.targetType === 'user' ? 'User' : log.targetType === 'record' ? 'Record' : log.targetType === 'downtime' ? 'Downtime' : 'Provider'}</span>
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
