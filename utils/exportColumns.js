const { hasAdjustment } = require('./effectivePaid');

// Each selectable Admin Records column maps to one or more Excel columns. The
// order here mirrors the table so a partial export keeps the admin's column
// order while retaining the existing Excel labels and value formatting.
const EXPORT_COLUMN_GROUPS = [
  {
    key: 'user',
    columns: [
      { header: 'User', value: (record) => record.user?.name || 'Unknown' },
      { header: 'Email', value: (record) => record.user?.email || '' }
    ]
  },
  {
    key: 'giftCard',
    always: true,
    columns: [
      { header: 'Gift Card', value: (record) => record.giftCard }
    ]
  },
  {
    key: 'provider',
    columns: [
      { header: 'Provider', value: (record) => record.provider || '' }
    ]
  },
  {
    key: 'amount',
    columns: [
      { header: 'Gift Card Amount', value: (record) => record.giftCardAmount }
    ]
  },
  {
    key: 'paid',
    columns: [
      { header: 'Adjusted Amount', value: (record) => (hasAdjustment(record) ? record.adjustedAmount : '') },
      { header: 'Paid (Original)', value: (record) => record.paid }
    ]
  },
  {
    key: 'status',
    columns: [
      { header: 'Payment Status', value: (record) => record.paymentStatus }
    ]
  },
  {
    key: 'shared',
    columns: [
      { header: 'Shared', value: (record) => (record.shared ? 'yes' : 'no') }
    ]
  },
  {
    key: 'submitted',
    columns: [
      {
        header: 'Submitted At',
        value: (record) => (record.createdAt ? new Date(record.createdAt).toLocaleString('en-IN') : '')
      }
    ]
  },
  {
    key: 'paidBack',
    columns: [
      {
        header: 'Paid Back At',
        value: (record) => (record.paidBackAt ? new Date(record.paidBackAt).toLocaleString('en-IN') : '')
      }
    ]
  },
  {
    key: 'notes',
    columns: [
      { header: 'Notes', value: (record) => record.notes || '' },
      { header: 'Admin Note', value: (record) => record.adminNote || '' }
    ]
  }
];

const EXPORT_COLUMN_KEYS = EXPORT_COLUMN_GROUPS.map((group) => group.key);

function normalizeRequestedColumns(raw) {
  if (raw === undefined || raw === null) return null;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function selectedExportGroups(raw) {
  const requested = normalizeRequestedColumns(raw);
  if (requested === null || requested.includes('all')) return EXPORT_COLUMN_GROUPS;

  const requestedKeys = new Set(requested);
  return EXPORT_COLUMN_GROUPS.filter((group) => group.always || requestedKeys.has(group.key));
}

function parseExportColumns(raw) {
  return selectedExportGroups(raw).map((group) => group.key);
}

function getExportHeaders(raw) {
  return selectedExportGroups(raw).flatMap((group) => group.columns.map((column) => column.header));
}

function buildExcelRows(records, raw) {
  const columns = selectedExportGroups(raw).flatMap((group) => group.columns);
  return records.map((record) => {
    const row = {};
    for (const column of columns) row[column.header] = column.value(record);
    return row;
  });
}

module.exports = {
  EXPORT_COLUMN_GROUPS,
  EXPORT_COLUMN_KEYS,
  parseExportColumns,
  getExportHeaders,
  buildExcelRows
};
