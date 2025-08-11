const express = require('express');
const auth = require('../auth');
const smsService = require('../services/sms');

const router = express.Router();

// Twilio webhook for incoming SMS messages
router.post('/webhook', smsService.webhookHandler());

// Test SMS sending (protected route)
router.post('/test', auth.middleware(), async (req, res) => {
    try {
        const { phone_number, message } = req.body;
        
        if (!phone_number) {
            return res.status(400).json({ error: 'phone_number is required' });
        }
        
        const testMessage = message || `Test SMS from Vessel Fouling App. Reply "FUEL 450 SPEED 12 WEATHER 1" to test data collection.`;
        
        const result = await smsService.sendMessage(phone_number, testMessage);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Test SMS sent successfully',
                sid: result.sid
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to send test SMS: ' + error.message });
    }
});

// Send fuel check prompt to user
router.post('/fuel-prompt', auth.middleware(), async (req, res) => {
    try {
        const { vessel_id } = req.body;
        
        if (!vessel_id) {
            return res.status(400).json({ error: 'vessel_id is required' });
        }
        
        const vesselId = parseInt(vessel_id);
        
        // Check access
        const hasAccess = require('../database').statements.checkVesselAccess.all(req.user.id, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        // Get vessel and user info
        const vessel = require('../database').statements.getVesselById.get(vesselId);
        const user = require('../database').statements.getUserById.get(req.user.id);
        
        if (!user.phone) {
            return res.status(400).json({ error: 'User phone number not set' });
        }
        
        const result = await smsService.sendFuelCheckPrompt(
            user.phone, 
            vessel.name, 
            user.notification_interval || 6
        );
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Fuel check prompt sent successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to send fuel prompt: ' + error.message });
    }
});

// Parse SMS message (for testing)
router.post('/parse', auth.middleware(), (req, res) => {
    try {
        const { message, from_phone } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }
        
        const result = smsService.parseIncomingSMS(message, from_phone || '+1234567890');
        
        res.json(result);
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to parse SMS: ' + error.message });
    }
});

module.exports = router;