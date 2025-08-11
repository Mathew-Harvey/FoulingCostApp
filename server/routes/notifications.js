const express = require('express');
const auth = require('../auth');
const db = require('../database');
const notificationService = require('../services/notifications');

const router = express.Router();

// Get user notification preferences
router.get('/preferences', auth.middleware(), (req, res) => {
    try {
        const user = db.statements.getUserById.get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            user_id: user.id,
            notification_preference: user.notification_preference,
            notification_interval: user.notification_interval,
            phone: user.phone,
            email: user.email
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get preferences: ' + error.message });
    }
});

// Update user notification preferences
router.put('/preferences', auth.middleware(), async (req, res) => {
    try {
        const { notification_preference, notification_interval, phone, email } = req.body;
        
        // Validate notification preference
        const validPreferences = ['SMS', 'EMAIL', 'WEB'];
        if (notification_preference && !validPreferences.includes(notification_preference)) {
            return res.status(400).json({ 
                error: 'Invalid notification preference. Must be: ' + validPreferences.join(', ') 
            });
        }
        
        // Validate notification interval
        const validIntervals = [4, 6, 8, 12];
        if (notification_interval && !validIntervals.includes(notification_interval)) {
            return res.status(400).json({ 
                error: 'Invalid notification interval. Must be: ' + validIntervals.join(', ') + ' hours' 
            });
        }
        
        // Validate phone if SMS preference
        if (notification_preference === 'SMS' && !phone) {
            return res.status(400).json({ 
                error: 'Phone number is required for SMS notifications' 
            });
        }
        
        // Validate email if EMAIL preference
        if (notification_preference === 'EMAIL' && !email) {
            return res.status(400).json({ 
                error: 'Email is required for email notifications' 
            });
        }
        
        // Update user record
        const currentUser = db.statements.getUserById.get(req.user.id);
        
        db.db.prepare(`
            UPDATE users 
            SET notification_preference = ?, notification_interval = ?, phone = ?, email = ?
            WHERE id = ?
        `).run(
            notification_preference || currentUser.notification_preference,
            notification_interval || currentUser.notification_interval,
            phone !== undefined ? phone : currentUser.phone,
            email !== undefined ? email : currentUser.email,
            req.user.id
        );
        
        // Update notification schedules if interval changed
        if (notification_interval && notification_interval !== currentUser.notification_interval) {
            await notificationService.updateUserNotificationPreferences(
                req.user.id, 
                notification_preference || currentUser.notification_preference,
                notification_interval
            );
        }
        
        const updatedUser = db.statements.getUserById.get(req.user.id);
        
        res.json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: {
                notification_preference: updatedUser.notification_preference,
                notification_interval: updatedUser.notification_interval,
                phone: updatedUser.phone,
                email: updatedUser.email
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to update preferences: ' + error.message });
    }
});

// Get notification status for user's vessels
router.get('/status', auth.middleware(), async (req, res) => {
    try {
        const vesselId = req.query.vessel_id ? parseInt(req.query.vessel_id) : null;
        
        // Check vessel access if specific vessel requested
        if (vesselId) {
            const hasAccess = db.statements.checkVesselAccess.all(req.user.id, vesselId);
            if (hasAccess.length === 0) {
                return res.status(403).json({ error: 'Access denied to this vessel' });
            }
        }
        
        const notifications = await notificationService.getNotificationStatus(req.user.id, vesselId);
        
        res.json({
            user_id: req.user.id,
            notifications: notifications
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get notification status: ' + error.message });
    }
});

// Schedule notifications for a vessel
router.post('/schedule', auth.middleware(), async (req, res) => {
    try {
        const { vessel_id, interval_hours } = req.body;
        
        if (!vessel_id) {
            return res.status(400).json({ error: 'vessel_id is required' });
        }
        
        const vesselId = parseInt(vessel_id);
        
        // Check vessel access
        const hasAccess = db.statements.checkVesselAccess.all(req.user.id, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        // Get user's default interval if not provided
        const user = db.statements.getUserById.get(req.user.id);
        const intervalHours = interval_hours || user.notification_interval || 6;
        
        await notificationService.scheduleUserNotifications(req.user.id, vesselId, intervalHours);
        
        res.json({
            success: true,
            message: 'Notifications scheduled successfully',
            vessel_id: vesselId,
            interval_hours: intervalHours
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to schedule notifications: ' + error.message });
    }
});

// Cancel notifications
router.delete('/cancel', auth.middleware(), async (req, res) => {
    try {
        const { vessel_id } = req.body;
        const vesselId = vessel_id ? parseInt(vessel_id) : null;
        
        // Check vessel access if specific vessel
        if (vesselId) {
            const hasAccess = db.statements.checkVesselAccess.all(req.user.id, vesselId);
            if (hasAccess.length === 0) {
                return res.status(403).json({ error: 'Access denied to this vessel' });
            }
        }
        
        await notificationService.cancelNotifications(req.user.id, vesselId);
        
        res.json({
            success: true,
            message: vesselId ? 'Vessel notifications cancelled' : 'All notifications cancelled',
            vessel_id: vesselId
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel notifications: ' + error.message });
    }
});

// Send test notification
router.post('/test', auth.middleware(), async (req, res) => {
    try {
        const { vessel_id } = req.body;
        
        if (!vessel_id) {
            return res.status(400).json({ error: 'vessel_id is required' });
        }
        
        const vesselId = parseInt(vessel_id);
        
        const result = await notificationService.sendTestNotification(req.user.id, vesselId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Failed to send test notification: ' + error.message 
        });
    }
});

// Get notification history (last 10 notifications)
router.get('/history', auth.middleware(), (req, res) => {
    try {
        const history = db.db.prepare(`
            SELECT 
                ns.*,
                v.name as vessel_name,
                CASE 
                    WHEN ns.last_response > ns.last_notification THEN 'responded'
                    WHEN ns.last_notification IS NOT NULL THEN 'sent'
                    ELSE 'scheduled'
                END as status
            FROM notification_schedule ns
            JOIN vessels v ON ns.vessel_id = v.id
            WHERE ns.user_id = ?
            ORDER BY COALESCE(ns.last_notification, ns.next_notification) DESC
            LIMIT 10
        `).all(req.user.id);
        
        res.json({
            user_id: req.user.id,
            history: history
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get notification history: ' + error.message });
    }
});

// Manual trigger for processing due notifications (admin/debug)
router.post('/process-due', auth.middleware(), async (req, res) => {
    try {
        // This could be restricted to admin users
        await notificationService.processDueNotifications();
        
        res.json({
            success: true,
            message: 'Due notifications processed'
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to process notifications: ' + error.message });
    }
});

module.exports = router;