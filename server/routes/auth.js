const express = require('express');
const auth = require('../auth');

const router = express.Router();

// Register new user
router.post('/signup', async (req, res) => {
    try {
        const { email, phone, name, password, notification_preference, notification_interval } = req.body;
        
        const result = await auth.register(
            email, phone, name, password, 
            notification_preference, notification_interval
        );
        
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const result = await auth.login(email, password);
        
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }
        
        const result = await auth.refreshToken(refreshToken);
        
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Get current user info (protected route)
router.get('/me', auth.middleware(), (req, res) => {
    res.json({ user: req.user });
});

// Reset password (placeholder - would need email service in production)
router.post('/reset-password', (req, res) => {
    res.status(501).json({ error: 'Password reset not implemented yet' });
});

module.exports = router;