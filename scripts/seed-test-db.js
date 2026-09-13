const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const DB_NAME = process.env.DB_NAME || 'gc_management_test';

async function run() {
  await mongoose.connect(uri, { dbName: DB_NAME });
  console.log('Connected to test DB:', DB_NAME);

  await mongoose.connection.dropDatabase();
  console.log('Dropped existing test database');

  const User = require('../models/User');
  const providerModel = require('../models/Provider');
  const GCRecord = require('../models/GCRecord');
  const AuditLog = require('../models/AuditLog');
  await AuditLog.deleteMany({});

  const admin = await User.create({
    name: 'Test Admin',
    email: 'sathvikak2002@gmail.com',
    password: 'Admin@12345',
    role: 'admin',
    active: true
  });

  const user = await User.create({
    name: 'Pavan Sai Kasula',
    email: 'pavansaikasula@gmail.com',
    password: 'Pavan$4321',
    role: 'user',
    active: true
  });
  const user2 = await User.create({
    name: 'Second Test User',
    email: 'second.test@example.com',
    password: 'Secret123',
    role: 'user',
    active: true
  });

  const now = Date.now();
  const records = [
    { giftCard: 'SHR-TEST-1', giftCardPin: '1111', giftCardAmount: 500, paid: 350, provider: 'Flipkart', user: user._id, notes: 'shared-single-alpha', shared: true, sharedBy: admin._id, sharedAt: new Date(now - 50000) },
    { giftCard: 'SHR-TEST-2', giftCardPin: '2222', giftCardAmount: 1000, paid: 800, provider: 'Amazon', user: user._id, notes: 'shared-single-beta', shared: true, sharedBy: admin._id, sharedAt: new Date(now - 40000) },
    { giftCard: 'SHR-TEST-3', giftCardPin: '3333', giftCardAmount: 750, paid: 500, provider: 'Myntra', user: user._id, notes: 'unshared-pending', shared: false, paymentStatus: 'paid_back', paidBackAt: new Date(now - 10000) },
    { giftCard: 'SHR-TEST-4', giftCardPin: '4444', giftCardAmount: 200, paid: 100, provider: 'Croma', user: user2._id, notes: 'unshared-legacy-no-field' },
    { giftCard: 'SHR-TEST-5', giftCardPin: '5555', giftCardAmount: 300, paid: 150, provider: 'Amazon', user: user2._id, notes: 'unshared-payback', shared: false, paymentStatus: 'paid_back', paidBackAt: new Date(now - 20000) },
    { giftCard: 'SHR-TEST-6', giftCardPin: '6666', giftCardAmount: 900, paid: 700, provider: 'Flipkart', user: user._id, notes: 'shared-payback-search-match', shared: true, sharedBy: admin._id, sharedAt: new Date(now - 30000), paymentStatus: 'paid_back', paidBackAt: new Date(now - 15000) }
  ];

  await GCRecord.insertMany(records);
  // Simulate a legacy record created before the shared field existed so we can
  // verify missing-field records behave as Unshared.
  await GCRecord.updateOne(
    { giftCard: 'SHR-TEST-4' },
    { $unset: { shared: '' } }
  );

  const Provider = providerModel;
  await Provider.insertMany([
    { name: 'Flipkart', isCustom: false },
    { name: 'Amazon', isCustom: false }
  ]);

  const auditTestUser = await User.create({
    name: 'Audit Check Operator',
    email: 'audit.operator@example.com',
    password: 'Operator123',
    role: 'admin',
    active: true
  });

  console.log('Admin id:', admin._id.toString());
  console.log('User id:', user._id.toString());
  console.log('User2 id:', user2._id.toString());
  console.log('AuditOperator id:', auditTestUser._id.toString());
  console.log('Records:', records.map(r => r.giftCard).join(', '));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});