const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const contactRoutes = require('./routes/contact');
const eventRoutes = require('./routes/events');
const newsletterRoutes = require('./routes/newsletter');
const calendarRoutes = require('./routes/calendar');
const memberRoutes = require('./routes/members');
const authRoutes = require('./routes/auth');
const { startBackupSchedule } = require('./utils/backup');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.WEBSITE_URL || 'https://www.fwv-raura.ch',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/contact', contactRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/auth', authRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
