const cron = require('node-cron');
const db = require('../database');
const smsService = require('./sms');
const AdaptiveFoulingModel = require('../models/adaptiveModel');

class NotificationService {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
        this.initialize();
    }
    
    initialize() {
        // Run every 15 minutes to check for due notifications
        this.cronJob = cron.schedule('*/15 * * * *', () => {
            if (this.isRunning) return; // Prevent overlapping executions
            this.processDueNotifications();
        }, {
            scheduled: false // Don't start automatically
        });
        
        console.log('Notification service initialized');
    }
    
    start() {
        if (!this.cronJob) {
            console.error('Cron job not initialized');
            return;
        }
        
        this.cronJob.start();
        console.log('Notification service started');
    }
    
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('Notification service stopped');
        }
    }
    
    async processDueNotifications() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        
        try {
            console.log('Processing due notifications...');
            
            const dueNotifications = db.statements.getNotificationsDue.all();
            
            if (dueNotifications.length === 0) {
                console.log('No notifications due');
                return;
            }
            
            console.log(`Processing ${dueNotifications.length} due notifications`);
            
            for (const notification of dueNotifications) {
                await this.processNotification(notification);
            }
            
        } catch (error) {
            console.error('Error processing notifications:', error);
        } finally {
            this.isRunning = false;
        }
    }
    
    async processNotification(notification) {
        try {
            const { 
                id, user_id, vessel_id, name, phone, email, 
                notification_preference, vessel_name, missed_count 
            } = notification;
            
            console.log(`Processing notification for ${name} (${vessel_name})`);
            
            // Get vessel and model data for context
            const vessel = db.statements.getVesselById.get(vessel_id);
            if (!vessel) {
                console.error(`Vessel ${vessel_id} not found`);
                return;
            }
            
            const adaptiveModel = new AdaptiveFoulingModel(vessel);
            const recommendations = adaptiveModel.recommendCleaning();
            
            let notificationSent = false;
            
            // Send notification based on user preference
            switch (notification_preference) {
                case 'SMS':
                    if (phone) {
                        notificationSent = await this.sendSMSNotification(
                            phone, vessel_name, recommendations, missed_count
                        );
                    }
                    break;
                    
                case 'EMAIL':
                    // Email notification would be implemented here
                    console.log('Email notifications not implemented yet');
                    break;
                    
                case 'WEB':
                    // Web/push notifications would be implemented here
                    console.log('Web notifications not implemented yet');
                    notificationSent = true; // Mark as sent for web-only users
                    break;
                    
                default:
                    console.warn(`Unknown notification preference: ${notification_preference}`);
            }
            
            // Update notification record
            if (notificationSent) {
                await this.updateNotificationSent(notification, user_id);
            } else {
                await this.updateNotificationMissed(notification);
            }
            
        } catch (error) {
            console.error('Error processing individual notification:', error);
        }
    }
    
    async sendSMSNotification(phone, vesselName, recommendations, missedCount) {
        try {
            let message;
            
            if (recommendations.recommended) {
                // Urgent fouling alert
                message = `${vesselName} fouling alert: FR${recommendations.currentFRLevel} ` +
                         `(+$${recommendations.extraCostPerDay}/day). ` +
                         `Consider cleaning in ${recommendations.daysToBreakeven} days for best ROI. ` +
                         `Reply with fuel reading: FUEL [rate] SPEED [knots] WEATHER [0-3]`;
            } else {
                // Regular fuel check prompt
                message = `Fuel check for ${vesselName}. ` +
                         `Current fouling: FR${recommendations.currentFRLevel}. ` +
                         `Reply: FUEL [rate] SPEED [knots] WEATHER [0-3]`;
            }
            
            // Add missed count warning if applicable
            if (missedCount > 0) {
                message += ` (${missedCount} missed checks)`;
            }
            
            const result = await smsService.sendMessage(phone, message);
            
            if (result.success) {
                console.log(`SMS sent successfully to ${phone} for ${vesselName}`);
                return true;
            } else {
                console.error(`SMS failed for ${phone}:`, result.error);
                return false;
            }
            
        } catch (error) {
            console.error('Error sending SMS notification:', error);
            return false;
        }
    }
    
    async updateNotificationSent(notification, userId) {
        try {
            const now = new Date().toISOString();
            const user = db.statements.getUserById.get(userId);
            const intervalHours = user?.notification_interval || 6;
            
            // Calculate next notification time
            const nextNotification = new Date();
            nextNotification.setHours(nextNotification.getHours() + intervalHours);
            
            db.statements.updateNotificationSent.run(
                now, // last_notification
                nextNotification.toISOString(), // next_notification
                notification.id
            );
            
            console.log(`Next notification for ${notification.name} scheduled for ${nextNotification.toISOString()}`);
            
        } catch (error) {
            console.error('Error updating notification sent:', error);
        }
    }
    
    async updateNotificationMissed(notification) {
        try {
            const now = new Date().toISOString();
            const newMissedCount = (notification.missed_count || 0) + 1;
            
            // Increase interval for missed notifications (exponential backoff)
            let retryHours = 1; // Start with 1 hour retry
            if (newMissedCount >= 3) {
                retryHours = 24; // Daily retry after 3 misses
            } else if (newMissedCount >= 2) {
                retryHours = 4; // 4 hour retry after 2 misses
            }
            
            const nextNotification = new Date();
            nextNotification.setHours(nextNotification.getHours() + retryHours);
            
            db.db.prepare(`
                UPDATE notification_schedule 
                SET missed_count = ?, next_notification = ?
                WHERE id = ?
            `).run(newMissedCount, nextNotification.toISOString(), notification.id);
            
            console.log(`Notification missed (${newMissedCount}), retry in ${retryHours} hours`);
            
        } catch (error) {
            console.error('Error updating notification missed:', error);
        }
    }
    
    async scheduleUserNotifications(userId, vesselId, intervalHours = 6) {
        try {
            const nextNotification = new Date();
            nextNotification.setHours(nextNotification.getHours() + intervalHours);
            
            db.statements.scheduleNotification.run(
                userId,
                vesselId, 
                nextNotification.toISOString()
            );
            
            console.log(`Notifications scheduled for user ${userId}, vessel ${vesselId}`);
            
        } catch (error) {
            console.error('Error scheduling notifications:', error);
            throw error;
        }
    }
    
    async updateUserNotificationPreferences(userId, preference, intervalHours) {
        try {
            db.statements.updateUserPreferences.run(preference, intervalHours, userId);
            
            // Update existing notification schedules if interval changed
            const user = db.statements.getUserById.get(userId);
            if (user) {
                const vessels = db.statements.getVesselsByUser.all(userId);
                
                for (const vessel of vessels) {
                    await this.rescheduleNotifications(userId, vessel.id, intervalHours);
                }
            }
            
            console.log(`Updated notification preferences for user ${userId}`);
            
        } catch (error) {
            console.error('Error updating notification preferences:', error);
            throw error;
        }
    }
    
    async rescheduleNotifications(userId, vesselId, newIntervalHours) {
        try {
            const now = new Date();
            const nextNotification = new Date();
            nextNotification.setHours(nextNotification.getHours() + newIntervalHours);
            
            db.db.prepare(`
                UPDATE notification_schedule 
                SET next_notification = ?
                WHERE user_id = ? AND vessel_id = ?
            `).run(nextNotification.toISOString(), userId, vesselId);
            
            console.log(`Rescheduled notifications for user ${userId}, vessel ${vesselId}`);
            
        } catch (error) {
            console.error('Error rescheduling notifications:', error);
        }
    }
    
    async cancelNotifications(userId, vesselId = null) {
        try {
            if (vesselId) {
                // Cancel for specific vessel
                db.db.prepare(`
                    DELETE FROM notification_schedule 
                    WHERE user_id = ? AND vessel_id = ?
                `).run(userId, vesselId);
                
                console.log(`Cancelled notifications for user ${userId}, vessel ${vesselId}`);
            } else {
                // Cancel all notifications for user
                db.db.prepare(`
                    DELETE FROM notification_schedule 
                    WHERE user_id = ?
                `).run(userId);
                
                console.log(`Cancelled all notifications for user ${userId}`);
            }
            
        } catch (error) {
            console.error('Error cancelling notifications:', error);
            throw error;
        }
    }
    
    async getNotificationStatus(userId, vesselId = null) {
        try {
            let query = `
                SELECT ns.*, v.name as vessel_name
                FROM notification_schedule ns
                JOIN vessels v ON ns.vessel_id = v.id
                WHERE ns.user_id = ?
            `;
            const params = [userId];
            
            if (vesselId) {
                query += ' AND ns.vessel_id = ?';
                params.push(vesselId);
            }
            
            const notifications = db.db.prepare(query).all(...params);
            
            return notifications.map(n => ({
                vessel_id: n.vessel_id,
                vessel_name: n.vessel_name,
                next_notification: n.next_notification,
                last_notification: n.last_notification,
                last_response: n.last_response,
                missed_count: n.missed_count,
                status: new Date(n.next_notification) > new Date() ? 'scheduled' : 'due'
            }));
            
        } catch (error) {
            console.error('Error getting notification status:', error);
            throw error;
        }
    }
    
    // Manual trigger for testing
    async sendTestNotification(userId, vesselId) {
        try {
            const user = db.statements.getUserById.get(userId);
            const vessel = db.statements.getVesselById.get(vesselId);
            
            if (!user || !vessel) {
                throw new Error('User or vessel not found');
            }
            
            // Check access
            const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
            if (hasAccess.length === 0) {
                throw new Error('User does not have access to this vessel');
            }
            
            if (!user.phone && user.notification_preference === 'SMS') {
                throw new Error('User phone number not set');
            }
            
            const adaptiveModel = new AdaptiveFoulingModel(vessel);
            const recommendations = adaptiveModel.recommendCleaning();
            
            let result = false;
            
            if (user.notification_preference === 'SMS' && user.phone) {
                result = await this.sendSMSNotification(
                    user.phone, 
                    vessel.name, 
                    recommendations, 
                    0
                );
            }
            
            return {
                success: result,
                message: result ? 'Test notification sent successfully' : 'Failed to send notification',
                user_name: user.name,
                vessel_name: vessel.name,
                preference: user.notification_preference
            };
            
        } catch (error) {
            console.error('Error sending test notification:', error);
            throw error;
        }
    }
}

// Create singleton instance
const notificationService = new NotificationService();

// Export the service and start it
module.exports = notificationService;