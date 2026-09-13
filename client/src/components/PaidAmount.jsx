import { formatCurrency, hasAdjustment } from '../utils/format';

export default function PaidAmount({ record }) {
  if (!hasAdjustment(record)) {
    return <span className="paid-original-value">{formatCurrency(record.paid)}</span>;
  }

  return (
    <div className="paid-values">
      <div className="paid-line">
        <span className="paid-label">Paid (Original):</span>{' '}
        <span className="paid-original-value">{formatCurrency(record.paid)}</span>
      </div>
      <div className="paid-line">
        <span className="paid-label">Adjusted:</span>{' '}
        <span className="paid-adjusted-value">{formatCurrency(record.adjustedAmount)}</span>
      </div>
    </div>
  );
}