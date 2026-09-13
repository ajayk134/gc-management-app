const express = require('express');
const GCRecord = require('../models/GCRecord');
const { auth, adminOnly } = require('../middleware/auth');
const { effectivePaid, hasAdjustment } = require('../utils/effectivePaid');

const router = express.Router();

router.use(auth, adminOnly);

router.get('/csv', async (req, res) => {
  try {
    const { userId, status, startDate, endDate, userIds } = req.query;
    
    const filter = {};
    
    if (userIds) {
      const ids = userIds.split(',').filter(Boolean);
      if (ids.length > 0) filter.user = { $in: ids };
    } else if (userId) {
      filter.user = userId;
    }

    if (status) filter.paymentStatus = status;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const records = await GCRecord.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    const csvHeader = 'User,Email,Gift Card,Gift Card PIN,Gift Card Amount,Provider,Adjusted Amount,Effective Paid,Paid (Original),Payment Status,Shared,Submitted At,Paid Back At,Notes,Admin Note\n';
    
    const csvRows = records.map(r => {
      const userName = r.user?.name || 'Unknown';
      const userEmail = r.user?.email || '';
      const submittedAt = r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '';
      const paidBackAt = r.paidBackAt ? new Date(r.paidBackAt).toLocaleString('en-IN') : '';
      
      const escapeCsv = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(userName),
        escapeCsv(userEmail),
        escapeCsv(r.giftCard),
        escapeCsv(r.giftCardPin),
        escapeCsv(r.giftCardAmount),
        escapeCsv(r.provider),
        escapeCsv(hasAdjustment(r) ? r.adjustedAmount : ''),
        escapeCsv(effectivePaid(r)),
        escapeCsv(r.paid),
        escapeCsv(r.paymentStatus),
        escapeCsv(r.shared ? 'yes' : 'no'),
        escapeCsv(submittedAt),
        escapeCsv(paidBackAt),
        escapeCsv(r.notes),
        escapeCsv(r.adminNote)
      ].join(',');
    });

    const csv = csvHeader + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gc-records-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

router.get('/excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { userId, status, startDate, endDate, userIds } = req.query;
    
    const filter = {};
    
    if (userIds) {
      const ids = userIds.split(',').filter(Boolean);
      if (ids.length > 0) filter.user = { $in: ids };
    } else if (userId) {
      filter.user = userId;
    }

    if (status) filter.paymentStatus = status;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const records = await GCRecord.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    const data = records.map(r => ({
      'User': r.user?.name || 'Unknown',
      'Email': r.user?.email || '',
      'Gift Card': r.giftCard,
      'Gift Card PIN': r.giftCardPin,
      'Gift Card Amount': r.giftCardAmount,
      'Provider': r.provider || '',
      'Adjusted Amount': hasAdjustment(r) ? r.adjustedAmount : '',
      'Effective Paid': effectivePaid(r),
      'Paid (Original)': r.paid,
      'Payment Status': r.paymentStatus,
      'Shared': r.shared ? 'yes' : 'no',
      'Submitted At': r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '',
      'Paid Back At': r.paidBackAt ? new Date(r.paidBackAt).toLocaleString('en-IN') : '',
      'Notes': r.notes || '',
      'Admin Note': r.adminNote || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'GC Records');
    
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="gc-records-${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buf);
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

module.exports = router;
