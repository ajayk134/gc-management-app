import { formatCurrency, hasAdjustment } from '../utils/format';

export default function PaidAmount({ record }) {
  const adjusted = hasAdjustment(record);

  return (
    <span className="paid-values">
      <span className="paid-line">
        <span className="paid-label">Paid:</span>
        <span className="paid-value">{formatCurrency(record.paid)}</span>
      </span>
      {adjusted && (
        <span className="paid-line">
          <span className="paid-label">Adjusted amount:</span>
          <span className="paid-value paid-value-adjusted">{formatCurrency(record.adjustedAmount)}</span>
        </span>
      )}
    </span>
  );
}