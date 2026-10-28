import { Wrench, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDowntime } from '../context/DowntimeContext';
import ThemeToggle from '../components/ThemeToggle';
import { formatDateTime } from '../utils/format';

export default function DowntimePage() {
  const { user, logout } = useAuth();
  const { downtime, refresh } = useDowntime();

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-logo">GC Manager</span>
        </div>
        <div className="header-right">
          <span className="header-user">{user?.name}</span>
          <span className="header-role role-user">User</span>
          <ThemeToggle />
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="downtime-page">
        <div className="downtime-page-card">
          <div className="downtime-page-icon" aria-hidden="true"><Wrench size={30} /></div>
          <span className="badge badge-warning">Maintenance in progress</span>
          <h1 className="downtime-page-title">We&rsquo;ll be back shortly</h1>
          <p className="downtime-page-message">
            {downtime?.message || 'The Gift Card Manager is temporarily unavailable while scheduled maintenance is completed.'}
          </p>

          <div className="downtime-window">
            <div className="downtime-window-item">
              <span className="downtime-window-label"><Clock size={14} aria-hidden="true" /> Started</span>
              <strong>{formatDateTime(downtime?.startAt)}</strong>
            </div>
            <div className="downtime-window-item">
              <span className="downtime-window-label"><Clock size={14} aria-hidden="true" /> Expected back</span>
              <strong>{formatDateTime(downtime?.endAt)}</strong>
            </div>
          </div>

          <p className="downtime-page-hint">
            This page checks automatically. Access will be restored as soon as maintenance ends.
          </p>

          <button type="button" className="btn btn-primary" onClick={refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            Check again
          </button>
        </div>
      </main>
    </div>
  );
}
