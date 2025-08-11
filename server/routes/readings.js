const express = require('express');
const auth = require('../auth');
const db = require('../database');
const AdaptiveFoulingModel = require('../models/adaptiveModel');

const router = express.Router();

// Middleware to check vessel access
const checkVesselAccess = async (req, res, next) => {
    try {
        const vesselId = parseInt(req.body.vessel_id || req.params.vesselId);
        const userId = req.user.id;
        
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        req.vesselId = vesselId;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Error checking vessel access: ' + error.message });
    }
};

// Get reading prompt (suggests values for new reading)
router.get('/prompt', auth.middleware(), (req, res) => {
    try {
        const { vessel_id } = req.query;
        
        if (!vessel_id) {
            return res.status(400).json({ error: 'vessel_id is required' });
        }
        
        const vesselId = parseInt(vessel_id);
        const userId = req.user.id;
        
        // Check access
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        // Get vessel info
        const vessel = db.statements.getVesselById.get(vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Get last reading
        const lastReadings = db.statements.getReadingsByVessel.all(vesselId, 1);
        const lastReading = lastReadings.length > 0 ? lastReadings[0] : null;
        
        // Default suggestions
        const suggestions = {
            vessel_id: vesselId,
            vessel_name: vessel.name,
            last_reading: lastReading ? {
                timestamp: lastReading.timestamp,
                fuel_rate: lastReading.fuel_rate,
                speed: lastReading.speed,
                weather_condition: lastReading.weather_condition
            } : null,
            suggested_speed: lastReading?.speed || vessel.eco_speed,
            suggested_weather: 'moderate',
            current_time: new Date().toISOString()
        };
        
        res.json(suggestions);
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get reading prompt: ' + error.message });
    }
});

// Submit new fuel reading
router.post('/', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const {
            vessel_id, fuel_rate, fuel_unit = 'L/hr', currency = 'AUD',
            speed, weather_condition, latitude, longitude, timestamp
        } = req.body;
        
        // Validate required fields
        if (!fuel_rate || !speed || !weather_condition) {
            return res.status(400).json({ 
                error: 'fuel_rate, speed, and weather_condition are required' 
            });
        }
        
        // Validate values
        if (fuel_rate <= 0) {
            return res.status(400).json({ error: 'fuel_rate must be positive' });
        }
        
        if (speed <= 0 || speed > 50) {
            return res.status(400).json({ error: 'speed must be between 0 and 50 knots' });
        }
        
        const validWeatherConditions = ['calm', 'moderate', 'rough', 'storm'];
        if (!validWeatherConditions.includes(weather_condition)) {
            return res.status(400).json({ 
                error: 'weather_condition must be one of: ' + validWeatherConditions.join(', ')
            });
        }
        
        const validFuelUnits = ['L/hr', '$/hr'];
        if (!validFuelUnits.includes(fuel_unit)) {
            return res.status(400).json({ 
                error: 'fuel_unit must be one of: ' + validFuelUnits.join(', ')
            });
        }
        
        // Use provided timestamp or current time
        const readingTimestamp = timestamp || new Date().toISOString();
        
        // Create reading
        const result = db.statements.createReading.run(
            vessel_id,
            req.user.id,
            readingTimestamp,
            fuel_rate,
            fuel_unit,
            currency,
            speed,
            weather_condition,
            latitude || null,
            longitude || null,
            1 // synced
        );
        
        const readingId = result.lastInsertRowid;
        
        // Update adaptive model with new reading
        try {
            const vessel = db.statements.getVesselById.get(vessel_id);
            const adaptiveModel = new AdaptiveFoulingModel(vessel);
            
            // Convert fuel rate to L/hr if needed (trigger will handle this in DB)
            let fuelRateInLhr = fuel_rate;
            if (fuel_unit === '$/hr') {
                fuelRateInLhr = fuel_rate / 2.5; // Conversion factor from config
            }
            
            const modelUpdate = adaptiveModel.updateFromReading(
                fuelRateInLhr, speed, weather_condition, readingTimestamp
            );
            
            console.log(`Model updated for vessel ${vessel_id}:`, modelUpdate);
            
        } catch (modelError) {
            console.error('Error updating adaptive model:', modelError);
            // Don't fail the reading creation if model update fails
        }
        
        res.status(201).json({
            id: readingId,
            message: 'Reading recorded successfully',
            reading: {
                id: readingId,
                vessel_id: vessel_id,
                fuel_rate: fuel_rate,
                fuel_unit: fuel_unit,
                speed: speed,
                weather_condition: weather_condition,
                timestamp: readingTimestamp
            }
        });
        
    } catch (error) {
        // Handle unique constraint violations (duplicate timestamps)
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ 
                error: 'A reading already exists for this timestamp' 
            });
        }
        
        res.status(500).json({ error: 'Failed to create reading: ' + error.message });
    }
});

// Get readings for a vessel
router.get('/vessel/:vesselId', auth.middleware(), (req, res) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
        const limit = parseInt(req.query.limit) || 50;
        const userId = req.user.id;
        
        // Check access
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        const readings = db.statements.getReadingsByVessel.all(vesselId, Math.min(limit, 200));
        
        res.json(readings);
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch readings: ' + error.message });
    }
});

// Get recent readings for analytics
router.get('/vessel/:vesselId/recent', auth.middleware(), (req, res) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
        const userId = req.user.id;
        
        // Check access
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        const readings = db.statements.getRecentReadings.all(vesselId);
        
        // Calculate basic statistics
        if (readings.length > 0) {
            const speeds = readings.map(r => r.speed);
            const fuelRates = readings.map(r => r.fuel_rate);
            
            const stats = {
                count: readings.length,
                avg_speed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
                avg_fuel_rate: fuelRates.reduce((a, b) => a + b, 0) / fuelRates.length,
                min_fuel_rate: Math.min(...fuelRates),
                max_fuel_rate: Math.max(...fuelRates),
                date_range: {
                    from: readings[readings.length - 1].timestamp,
                    to: readings[0].timestamp
                }
            };
            
            res.json({
                readings: readings,
                statistics: stats
            });
        } else {
            res.json({
                readings: [],
                statistics: null
            });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent readings: ' + error.message });
    }
});

// Delete a reading (only by creator or within 24 hours)
router.delete('/:id', auth.middleware(), (req, res) => {
    try {
        const readingId = parseInt(req.params.id);
        
        // Get reading details
        const reading = db.db.prepare('SELECT * FROM fuel_readings WHERE id = ?').get(readingId);
        
        if (!reading) {
            return res.status(404).json({ error: 'Reading not found' });
        }
        
        // Check access to vessel
        const hasAccess = db.statements.checkVesselAccess.all(req.user.id, reading.vessel_id);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Check if user can delete (creator or within 24 hours)
        const readingTime = new Date(reading.created_at);
        const now = new Date();
        const hoursSinceCreation = (now - readingTime) / (1000 * 60 * 60);
        
        if (reading.user_id !== req.user.id && hoursSinceCreation > 24) {
            return res.status(403).json({ error: 'Can only delete your own readings or within 24 hours' });
        }
        
        // Delete reading
        db.db.prepare('DELETE FROM fuel_readings WHERE id = ?').run(readingId);
        
        res.json({ message: 'Reading deleted successfully' });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete reading: ' + error.message });
    }
});

// Get fuel consumption trends
router.get('/vessel/:vesselId/trends', auth.middleware(), (req, res) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 30;
        
        // Check access
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        if (hasAccess.length === 0) {
            return res.status(403).json({ error: 'Access denied to this vessel' });
        }
        
        // Get readings within date range
        const readings = db.db.prepare(`
            SELECT 
                DATE(timestamp) as date,
                AVG(fuel_rate) as avg_fuel_rate,
                AVG(speed) as avg_speed,
                COUNT(*) as reading_count,
                GROUP_CONCAT(weather_condition) as weather_conditions
            FROM fuel_readings 
            WHERE vessel_id = ? AND timestamp > datetime('now', '-' || ? || ' days')
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `).all(vesselId, days);
        
        // Calculate efficiency trends (fuel per nautical mile)
        const trends = readings.map(reading => ({
            date: reading.date,
            avg_fuel_rate: Math.round(reading.avg_fuel_rate * 100) / 100,
            avg_speed: Math.round(reading.avg_speed * 100) / 100,
            fuel_per_nm: Math.round((reading.avg_fuel_rate / reading.avg_speed) * 100) / 100,
            reading_count: reading.reading_count,
            weather_conditions: reading.weather_conditions?.split(',') || []
        }));
        
        res.json({
            vessel_id: vesselId,
            period_days: days,
            trends: trends
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trends: ' + error.message });
    }
});

module.exports = router;