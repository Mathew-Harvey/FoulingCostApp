const twilio = require('twilio');
const config = require('../config');
const db = require('../database');
const AdaptiveFoulingModel = require('../models/adaptiveModel');

class SMSService {
    constructor() {
        if (config.twilio.accountSid && config.twilio.authToken && 
            config.twilio.accountSid.startsWith('AC') && 
            config.twilio.authToken.length > 10) {
            try {
                this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
                this.phoneNumber = config.twilio.phoneNumber;
                this.enabled = true;
                console.log('Twilio SMS service initialized');
            } catch (error) {
                console.warn('Twilio initialization failed:', error.message);
                this.enabled = false;
            }
        } else {
            console.warn('Twilio credentials not properly configured, SMS service disabled');
            console.warn('Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env file');
            this.enabled = false;
        }
    }
    
    async sendMessage(to, message) {
        if (!this.enabled) {
            console.log('SMS would be sent to', to, ':', message);
            return { success: false, error: 'SMS not configured' };
        }
        
        try {
            const result = await this.client.messages.create({
                body: message,
                from: this.phoneNumber,
                to: to
            });
            
            console.log('SMS sent successfully:', result.sid);
            return { success: true, sid: result.sid };
        } catch (error) {
            console.error('Error sending SMS:', error);
            return { success: false, error: error.message };
        }
    }
    
    async sendFuelCheckPrompt(userPhone, vesselName, intervalHours = 6) {
        const message = `Fuel check for ${vesselName}. Reply: FUEL [rate] SPEED [knots] WEATHER [0-3]. Next check in ${intervalHours}hrs.`;
        return await this.sendMessage(userPhone, message);
    }
    
    async sendFoulingAlert(userPhone, vesselName, frLevel, extraCostPerDay, daysToBreakeven) {
        const message = `${vesselName} fouling alert: FR${frLevel} (+$${extraCostPerDay}/day). Consider cleaning in ${daysToBreakeven} days for best ROI.`;
        return await this.sendMessage(userPhone, message);
    }
    
    parseIncomingSMS(messageBody, fromPhone) {
        try {
            const body = messageBody.trim().toUpperCase();
            
            // FUEL [rate] SPEED [knots] WEATHER [0-3] format
            const fuelMatch = body.match(/FUEL\s+(\d+(?:\.\d+)?)/);
            const speedMatch = body.match(/SPEED\s+(\d+(?:\.\d+)?)/);
            const weatherMatch = body.match(/WEATHER\s+([0-3])/);
            
            if (!fuelMatch || !speedMatch || !weatherMatch) {
                return {
                    success: false,
                    error: 'Invalid format. Use: FUEL [rate] SPEED [knots] WEATHER [0-3]',
                    errorCode: 'INVALID_FORMAT'
                };
            }
            
            const fuelRate = parseFloat(fuelMatch[1]);
            const speed = parseFloat(speedMatch[1]);
            const weatherCode = parseInt(weatherMatch[1]);
            
            // Validate ranges
            if (fuelRate <= 0 || fuelRate > 10000) {
                return {
                    success: false,
                    error: 'Fuel rate must be between 0 and 10000',
                    errorCode: 'INVALID_FUEL_RATE'
                };
            }
            
            if (speed <= 0 || speed > 50) {
                return {
                    success: false,
                    error: 'Speed must be between 0 and 50 knots',
                    errorCode: 'INVALID_SPEED'
                };
            }
            
            const weatherConditions = ['calm', 'moderate', 'rough', 'storm'];
            const weatherCondition = weatherConditions[weatherCode];
            
            return {
                success: true,
                data: {
                    fuel_rate: fuelRate,
                    speed: speed,
                    weather_condition: weatherCondition,
                    fuel_unit: 'L/hr', // Default assumption
                    from_phone: fromPhone
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: 'Error parsing message: ' + error.message,
                errorCode: 'PARSE_ERROR'
            };
        }
    }
    
    async findUserByPhone(phone) {
        try {
            // Normalize phone number (remove spaces, dashes, etc.)
            const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
            
            const user = db.db.prepare(`
                SELECT * FROM users 
                WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '()', '') = ?
            `).get(normalizedPhone);
            
            return user;
        } catch (error) {
            console.error('Error finding user by phone:', error);
            return null;
        }
    }
    
    async findUserVessel(userId) {
        try {
            // Get the most recently accessed or created vessel for this user
            const vessels = db.statements.getVesselsByUser.all(userId);
            
            if (vessels.length === 0) {
                return null;
            }
            
            // Return the first vessel (could be improved with user preferences)
            return vessels[0];
        } catch (error) {
            console.error('Error finding user vessel:', error);
            return null;
        }
    }
    
    async processIncomingSMS(fromPhone, messageBody) {
        try {
            console.log(`Processing SMS from ${fromPhone}: ${messageBody}`);
            
            // Parse the message
            const parseResult = this.parseIncomingSMS(messageBody, fromPhone);
            
            if (!parseResult.success) {
                await this.sendMessage(fromPhone, parseResult.error);
                return {
                    success: false,
                    error: parseResult.error,
                    response_sent: true
                };
            }
            
            // Find user by phone number
            const user = await this.findUserByPhone(fromPhone);
            
            if (!user) {
                await this.sendMessage(fromPhone, 'Phone number not registered. Please register at the web portal first.');
                return {
                    success: false,
                    error: 'User not found',
                    response_sent: true
                };
            }
            
            // Find user's vessel
            const vessel = await this.findUserVessel(user.id);
            
            if (!vessel) {
                await this.sendMessage(fromPhone, 'No vessel found for your account. Please add a vessel first.');
                return {
                    success: false,
                    error: 'No vessel found',
                    response_sent: true
                };
            }
            
            // Create the reading
            const readingData = {
                ...parseResult.data,
                vessel_id: vessel.id,
                user_id: user.id,
                timestamp: new Date().toISOString()
            };
            
            const result = db.statements.createReading.run(
                readingData.vessel_id,
                readingData.user_id,
                readingData.timestamp,
                readingData.fuel_rate,
                readingData.fuel_unit,
                'AUD', // Default currency
                readingData.speed,
                readingData.weather_condition,
                null, // latitude
                null, // longitude
                1 // synced
            );
            
            // Update adaptive model
            const adaptiveModel = new AdaptiveFoulingModel(vessel);
            const modelUpdate = adaptiveModel.updateFromReading(
                readingData.fuel_rate,
                readingData.speed,
                readingData.weather_condition,
                readingData.timestamp
            );
            
            // Get recommendation
            const recommendation = adaptiveModel.recommendCleaning();
            
            // Send confirmation with fouling info
            let responseMessage = `Recorded: ${readingData.fuel_rate}L/hr at ${readingData.speed}kn.`;
            responseMessage += ` Fouling: FR${recommendation.currentFRLevel} (+$${recommendation.extraCostPerDay}/day).`;
            
            if (recommendation.recommended) {
                responseMessage += ` Consider cleaning in ${recommendation.daysToBreakeven} days.`;
            } else {
                const nextCheckHours = user.notification_interval || 6;
                responseMessage += ` Next check in ${nextCheckHours}hrs.`;
            }
            
            await this.sendMessage(fromPhone, responseMessage);
            
            // Update notification response time
            db.statements.updateNotificationResponse.run(
                new Date().toISOString(),
                user.id,
                vessel.id
            );
            
            return {
                success: true,
                reading_id: result.lastInsertRowid,
                response_sent: true,
                recommendation: recommendation
            };
            
        } catch (error) {
            console.error('Error processing SMS:', error);
            
            try {
                await this.sendMessage(fromPhone, 'Error processing your message. Please try again or use the web portal.');
            } catch (sendError) {
                console.error('Error sending error response:', sendError);
            }
            
            return {
                success: false,
                error: error.message,
                response_sent: true
            };
        }
    }
    
    // Express middleware for handling Twilio webhooks
    webhookHandler() {
        return async (req, res) => {
            try {
                const { From, Body } = req.body;
                
                if (!From || !Body) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }
                
                const result = await this.processIncomingSMS(From, Body);
                
                res.json({
                    success: result.success,
                    message: result.success ? 'Message processed successfully' : result.error
                });
                
            } catch (error) {
                console.error('Webhook handler error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        };
    }
    
    // Test SMS functionality
    async testSMS(phoneNumber) {
        const testMessage = 'Test message from Vessel Fouling App. Reply FUEL 450 SPEED 12 WEATHER 1 to test data entry.';
        return await this.sendMessage(phoneNumber, testMessage);
    }
}

module.exports = new SMSService();