const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const gcRoutes = require('./routes/gcRecords');
const statsRoutes = require('./routes/stats');
const auditRoutes = require('./routes/audit');
const exportRoutes = require('./routes/export');
const providerRoutes = require('./routes/providers');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust the Render proxy so rate limiting works correctly behind it
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  message: { error: 'Too many login attempts, please try again later.' }
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,https://gc-management-app.onrender.com,https://giftcardmanager.duckdns.org')
  .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/gc-records', gcRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/providers', providerRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB and start server
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  dbName: process.env.DB_NAME || 'gc_management'
}).then(async () => {
  console.log('Connected to MongoDB');
  
  // Initialize default admin if needed
  const User = require('./models/User');
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'sathvikak2002@gmail.com';
    const adminName = process.env.ADMIN_NAME || 'Administrator';

    await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      active: true
    });
    console.log('Default admin account created');
  }

  // Seed built-in gift card providers if they do not exist yet
  const Provider = require('./models/Provider');
  const DEFAULT_PROVIDERS = [
    'Flipkart', 'Amazon', 'Myntra', 'Croma', 'Reliance Digital', 'Ajio', 'Nykaa',
    'Meesho', 'Swiggy', 'Zomato', 'Amazon Pay', 'Paytm', 'Big Bazaar',
    'Shoppers Stop', 'Tata CLiQ', 'Snapdeal', 'BookMyShow', 'KFC', "McDonald's",
    'Pizza Hut', "Domino's", 'Bata', 'Pantaloons', 'Westside', 'Lifestyle',
    'Puma', 'Adidas', 'Nike', 'Decathlon'
  ];
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const providerName of DEFAULT_PROVIDERS) {
    await Provider.updateOne(
      { name: { $regex: `^${escapeRegex(providerName)}$`, $options: 'i' } },
      { $setOnInsert: { name: providerName, isCustom: false } },
      { upsert: true }
    );
  }
  console.log('Gift card providers ensured');
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});
