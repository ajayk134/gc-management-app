const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d) ? null : d;
};

const pad2 = (n) => String(n).padStart(2, '0');

export const formatDate = (date) => {
  const d = toDate(date);
  if (!d) return '-';
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatDateTime = (date) => {
  const d = toDate(date);
  if (!d) return '-';
  let hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes} ${ampm}`;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

export const getStatusColor = (status) => {
  if (status === 'pending') return 'status-pending';
  if (status === 'paid_back') return 'status-paid';
  return '';
};

export const getStatusLabel = (status) => {
  if (status === 'pending') return 'Pending';
  if (status === 'paid_back') return 'Paid Back';
  return status;
};
