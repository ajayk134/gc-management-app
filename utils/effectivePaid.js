// Centralized effective-paid logic.
//
// Rule: Effective Paid Amount =
//   adjustedAmount, IF an Admin adjustment exists
//   otherwise paid
//
// The original giftCardAmount and the original paid value are always
// preserved. adjustedAmount is an admin-only override/effective value used
// for every paid/pending/paid-back calculation.

const hasAdjustment = (record) =>
  record &&
  record.adjustedAmount !== undefined &&
  record.adjustedAmount !== null &&
  record.adjustedAmount !== '';

const effectivePaid = (record) => (hasAdjustment(record) ? record.adjustedAmount : record.paid);

// MongoDB aggregation expression: effective paid = $ifNull(adjustedAmount, paid)
const effectivePaidExpr = { $ifNull: ['$adjustedAmount', '$paid'] };

module.exports = { hasAdjustment, effectivePaid, effectivePaidExpr };