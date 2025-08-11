require('dotenv').config();
const path = require('path');

module.exports = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    database: {
        path: process.env.DATABASE_PATH || path.join(__dirname, '../data/vessels.db')
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-key',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key',
        expiresIn: '7d',
        refreshExpiresIn: '30d'
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    openWeather: {
        apiKey: process.env.OPENWEATHER_API_KEY
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    }
};