import { useEffect } from 'react';
import { CalendarClock, CreditCard, Mail, Pencil, Receipt, ShieldCheck, Trash2, UserRound, Wallet, X } from 'lucide-react';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel, effectivePaid, hasAdjustment } from '../../utils/format';

function DetailRow({ icon: Icon, label, children, className = '' }) {
  return (
    <div className={`ar-detail-row ${className}`}>
      <span className="ar-detail-label">
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="ar-detail-value">{children || '—'}</span>
    </div>
  );
}

export default function RecordDetailDrawer({
  record,
  busy = false,
  onClose,
  onEdit,
  onToggleShare,
  onPay,
  onUndo,
  onDelete
}) {
  useEffect(() => {
    if (!record) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [record, onClose]);

  if (!record) return null;

  const adjusted = hasAdjustment(record);
  const paidLabel = adjusted ? 'Effective paid' : 'Paid';
  const paidValue = adjusted ? effectivePaid(record) : record.paid;

  return (
    <div className="ar-drawer-overlay" onClick={onClose}>
      <aside
        className="ar-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ar-drawer-header">
          <div>
            <span className="ar-drawer-eyebrow">Record details</span>
            <h3 className="ar-drawer-title" id="ar-detail-title">{record.giftCard}</h3>
            <div className="ar-drawer-badges">
              <span className={`badge ${getStatusColor(record.paymentStatus)}`}>
                {getStatusLabel(record.paymentStatus)}
              </span>
              <span className={`badge ${record.shared ? 'badge-shared' : 'badge-neutral'}`}>
                {record.shared ? 'Shared' : 'Unshared'}
              </span>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close record details">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="ar-drawer-body">
          <section className="ar-detail-section">
            <h4 className="ar-detail-heading">Ownership</h4>
            <DetailRow icon={UserRound} label="User">{record.user?.name || 'Unknown'}</DetailRow>
            <DetailRow icon={Mail} label="Email">{record.user?.email || '—'}</DetailRow>
          </section>

          <section className="ar-detail-section">
            <h4 className="ar-detail-heading">Gift card</h4>
            <DetailRow icon={CreditCard} label="Identifier">{record.giftCard}</DetailRow>
            <DetailRow icon={Receipt} label="Provider">{record.provider || '—'}</DetailRow>
            <DetailRow icon={Wallet} label="GC amount">{formatCurrency(record.giftCardAmount)}</DetailRow>
            <DetailRow icon={Wallet} label={paidLabel}>{formatCurrency(paidValue)}</DetailRow>
            {adjusted && (
              <DetailRow icon={Receipt} label="Original paid">{formatCurrency(record.paid)}</DetailRow>
            )}
            {adjusted && (
              <DetailRow icon={Receipt} label="Adjusted amount">
                {formatCurrency(record.adjustedAmount)}
                {record.adjustedBy?.name ? ` by ${record.adjustedBy.name}` : ''}
                {record.adjustedAt ? ` · ${formatDateTime(record.adjustedAt)}` : ''}
              </DetailRow>
            )}
            <DetailRow icon={ShieldCheck} label="PIN">
              <span className="text-muted">Hidden for security</span>
            </DetailRow>
          </section>

          <section className="ar-detail-section">
            <h4 className="ar-detail-heading">Timeline</h4>
            <DetailRow icon={CalendarClock} label="Submitted">{formatDateTime(record.createdAt)}</DetailRow>
            <DetailRow icon={CalendarClock} label="Paid back">
              {record.paidBackAt ? formatDateTime(record.paidBackAt) : <span className="text-muted">Not paid back yet</span>}
            </DetailRow>
            {record.shared && (
              <DetailRow icon={CalendarClock} label="Shared">
                {record.sharedBy?.name || 'Admin'}
                {record.sharedAt ? ` · ${formatDateTime(record.sharedAt)}` : ''}
              </DetailRow>
            )}
          </section>

          <section className="ar-detail-section">
            <h4 className="ar-detail-heading">Notes</h4>
            <DetailRow label="User notes">
              <span className="ar-detail-notes">{record.notes || <span className="text-muted">No notes</span>}</span>
            </DetailRow>
            <DetailRow label="Admin note">
              <span className="ar-detail-notes">{record.adminNote || <span className="text-muted">No admin note</span>}</span>
            </DetailRow>
          </section>
        </div>

        <div className="ar-drawer-footer">
          <div className="ar-drawer-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(record)} disabled={busy}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
            <button
              type="button"
              className={`btn btn-sm ${record.shared ? 'btn-success' : 'btn-outline'}`}
              onClick={() => onToggleShare(record)}
              disabled={busy}
            >
              {record.shared ? 'Unshare' : 'Share'}
            </button>
            {record.paymentStatus === 'pending' ? (
              <button type="button" className="btn btn-success btn-sm" onClick={() => onPay(record)} disabled={busy}>
                Mark as paid back
              </button>
            ) : (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onUndo(record)} disabled={busy}>
                Undo payment
              </button>
            )}
          </div>
          <button type="button" className="btn btn-danger-outline btn-sm ar-drawer-delete" onClick={() => onDelete(record)} disabled={busy}>
            <Trash2 size={14} aria-hidden="true" /> Delete record
          </button>
        </div>
      </aside>
    </div>
  );
}
