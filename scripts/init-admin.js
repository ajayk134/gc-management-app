const mongoose = require('mongoose');
const User = require('../models/User');

async function initAdmin() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { dbName: 'gc_management' });
  
  const adminEmail = process.env.ADMIN_EMAIL || 'sathvikak2002@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Administrator';

  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    console.log('Admin already exists:', adminEmail);
  } else {
    await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      active: true
    });
    console.log('Admin created:', adminEmail);
  }

  await mongoose.disconnect();
}

initAdmin().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
