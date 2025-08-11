const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { runMigrations } = require('../migrations/run');
const config = require('./config');
const notificationService = require('./services/notifications');

// Test database connection early
try {
    require('./database');
    console.log('Database module loaded successfully');
} catch (error) {
    console.error('Failed to load database module:', error);
    process.exit(1);
}

// Import routes
const authRoutes = require('./routes/auth');
const vesselRoutes = require('./routes/vessels');
const readingRoutes = require('./routes/readings');
const predictionRoutes = require('./routes/predictions');
const bfmpRoutes = require('./routes/bfmp');
const notificationRoutes = require('./routes/notifications');
const smsRoutes = require('./routes/sms');
const calculatorRoutes = require('./routes/calculator');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.openweathermap.org"]
        }
    }
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // In development, allow localhost
        if (config.env === 'development') {
            return callback(null, true);
        }
        
        // In production, you would specify allowed origins
        const allowedOrigins = ['https://yourdomain.com'];
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: config.env
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/bfmp', bfmpRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sms', smsRoutes);

// Catch-all route for SPA (serve index.html for client-side routing)
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    res.status(500).json({ 
        error: config.env === 'development' ? error.message : 'Internal server error'
    });
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('Starting Vessel Fouling Management System...');
        
        // Run database migrations
        console.log('Running database migrations...');
        try {
            runMigrations();
            console.log('Database migrations completed successfully');
        } catch (error) {
            console.error('Database migration failed:', error);
            throw error;
        }
        
        // Start notification service
        console.log('Starting notification service...');
        notificationService.start();
        
        // Start the server
        const server = app.listen(config.port, () => {
            console.log(`Server running on port ${config.port}`);
            console.log(`Environment: ${config.env}`);
            console.log(`Database: ${config.database.path}`);
            console.log(`Health check: http://localhost:${config.port}/health`);
            
            if (config.env === 'development') {
                console.log(`Dashboard: http://localhost:${config.port}/dashboard.html`);
            }
        });
        
        // Graceful shutdown handling
        const gracefulShutdown = (signal) => {
            console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
            
            // Stop notification service
            notificationService.stop();
            
            // Close server
            server.close((err) => {
                if (err) {
                    console.error('Error during server shutdown:', err);
                    process.exit(1);
                }
                
                // Close database connections
                try {
                    require('./database').close();
                } catch (dbError) {
                    console.error('Error closing database:', dbError);
                }
                
                console.log('Server shut down gracefully');
                process.exit(0);
            });
        };
        
        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = app;