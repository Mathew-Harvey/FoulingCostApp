const express = require('express');
const auth = require('../auth');
const db = require('../database');
const AdaptiveFoulingModel = require('../models/adaptiveModel');
const weatherService = require('../services/weather');

const router = express.Router();

// Helper functions
const getUrgencyLevel = (recommendations) => {
    if (recommendations.recommended && recommendations.daysToBreakeven < 30) {
        return {
            level: 'urgent',
            color: 'red',
            message: 'Immediate cleaning recommended'
        };
    } else if (recommendations.recommended && recommendations.daysToBreakeven < 60) {
        return {
            level: 'high',
            color: 'orange',
            message: 'Schedule cleaning soon'
        };
    } else if (recommendations.currentFRLevel >= 3) {
        return {
            level: 'moderate',
            color: 'yellow',
            message: 'Monitor closely'
        };
    } else {
        return {
            level: 'low',
            color: 'green',
            message: 'Continue monitoring'
        };
    }
};

const getNextEvaluationDate = (recommendations) => {
    const daysToAdd = recommendations.currentFRLevel < 2 ? 30 : 
                     recommendations.currentFRLevel < 4 ? 14 : 7;
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    
    return nextDate.toISOString().split('T')[0];
};

const calculateAccuracyMetrics = (data) => {
    const validComparisons = data.filter(d => d.actual_fuel_rate && d.predicted_fuel_rate);
    
    if (validComparisons.length === 0) {
        return {
            sample_size: 0,
            mean_error: null,
            mean_absolute_error: null,
            accuracy_percentage: null
        };
    }
    
    let totalError = 0;
    let totalAbsoluteError = 0;
    let accurateCount = 0;
    
    validComparisons.forEach(d => {
        const error = (d.actual_fuel_rate - d.predicted_fuel_rate) / d.predicted_fuel_rate;
        totalError += error;
        totalAbsoluteError += Math.abs(error);
        
        if (Math.abs(error) < 0.15) { // Within 15%
            accurateCount++;
        }
    });
    
    return {
        sample_size: validComparisons.length,
        mean_error: Math.round(totalError / validComparisons.length * 1000) / 10, // Percentage
        mean_absolute_error: Math.round(totalAbsoluteError / validComparisons.length * 1000) / 10,
        accuracy_percentage: Math.round(accurateCount / validComparisons.length * 100),
        last_updated: validComparisons[0]?.timestamp
    };
};

const groupTrendsByDate = (data) => {
    const grouped = {};
    
    data.forEach(d => {
        if (!grouped[d.date]) {
            grouped[d.date] = {
                date: d.date,
                predictions: [],
                avg_predicted: 0,
                avg_actual: 0,
                actual_count: 0
            };
        }
        
        grouped[d.date].predictions.push({
            speed: d.speed,
            predicted: d.predicted_fuel_rate,
            actual: d.actual_fuel_rate,
            fr_level: d.predicted_fr_level,
            weather: d.weather_condition
        });
    });
    
    // Calculate averages for each date
    Object.values(grouped).forEach(dateGroup => {
        const validActuals = dateGroup.predictions.filter(p => p.actual);
        
        if (dateGroup.predictions.length > 0) {
            dateGroup.avg_predicted = Math.round(
                dateGroup.predictions.reduce((sum, p) => sum + p.predicted, 0) / 
                dateGroup.predictions.length * 100
            ) / 100;
        }
        
        if (validActuals.length > 0) {
            dateGroup.avg_actual = Math.round(
                validActuals.reduce((sum, p) => sum + p.actual, 0) / 
                validActuals.length * 100
            ) / 100;
            dateGroup.actual_count = validActuals.length;
        }
    });
    
    return Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));
};

// Middleware to check vessel access
const checkVesselAccess = async (req, res, next) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
        const userId = req.user.id;
        
        // Check if vessel exists first
        const vessel = db.statements.getVesselById.get(vesselId);
        if (!vessel) {
            return res.status(404).json({ 
                error: 'Vessel not found',
                vessel_id: vesselId,
                user_id: userId
            });
        }
        
        const hasAccess = db.statements.checkVesselAccess.all(userId, vesselId);
        
        if (hasAccess.length === 0) {
            return res.status(403).json({ 
                error: 'Access denied to this vessel',
                vessel_id: vesselId,
                user_id: userId
            });
        }
        
        req.vesselId = vesselId;
        next();
    } catch (error) {
        console.error('Error in checkVesselAccess middleware:', error);
        res.status(500).json({ 
            error: 'Error checking vessel access: ' + error.message,
            stack: config.env === 'development' ? error.stack : undefined
        });
    }
};

// Get predictions for a vessel
router.get('/vessel/:vesselId', auth.middleware(), checkVesselAccess, async (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Validate required vessel parameters
        const requiredFields = ['cost_eco', 'cost_full', 'eco_speed', 'full_speed'];
        const missingFields = requiredFields.filter(field => !vessel[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: 'Vessel missing required parameters', 
                missing_fields: missingFields,
                vessel_id: req.vesselId 
            });
        }
        
        const adaptiveModel = new AdaptiveFoulingModel(vessel);
        
        // Get recent predictions from database
        const dbPredictions = db.statements.getPredictionsByVessel.all(req.vesselId, 50);
        
        // Generate current predictions for different speeds
        const speedCurve = adaptiveModel.generateSpeedCurve(
            Math.max(vessel.eco_speed - 3, 4),
            Math.min(vessel.full_speed + 2, 25),
            15
        );
        
        // Get model statistics
        const modelStats = adaptiveModel.getModelStatistics();
        
        // Get recommendations
        const recommendations = adaptiveModel.recommendCleaning();
        
        res.json({
            vessel_id: req.vesselId,
            current_predictions: speedCurve,
            historical_predictions: dbPredictions,
            model_statistics: modelStats,
            recommendations: recommendations,
            generated_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error in predictions endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to get predictions: ' + error.message,
            stack: config.env === 'development' ? error.stack : undefined
        });
    }
});

// Create prediction for specific conditions
router.post('/vessel/:vesselId/predict', auth.middleware(), checkVesselAccess, async (req, res) => {
    try {
        const { speed, weather_condition = 'moderate', latitude, longitude } = req.body;
        
        if (!speed || speed <= 0) {
            return res.status(400).json({ error: 'Valid speed is required' });
        }
        
        const vessel = db.statements.getVesselById.get(req.vesselId);
        const adaptiveModel = new AdaptiveFoulingModel(vessel);
        
        // Get weather data if coordinates provided
        let weatherCondition = weather_condition;
        let weatherDetails = null;
        
        if (latitude && longitude) {
            try {
                const weatherData = await weatherService.getWeatherForReading(latitude, longitude);
                weatherCondition = weatherData.condition;
                weatherDetails = weatherData;
            } catch (error) {
                console.warn('Could not get weather data:', error);
            }
        }
        
        // Generate prediction
        const prediction = adaptiveModel.predict(speed, weatherCondition, true);
        
        // Store prediction in database
        const result = db.statements.createPrediction.run(
            req.vesselId,
            new Date().toISOString(),
            speed,
            prediction.predicted,
            prediction.frLevel,
            prediction.confidence,
            weatherCondition
        );
        
        res.json({
            prediction_id: result.lastInsertRowid,
            speed: speed,
            weather_condition: weatherCondition,
            predicted_fuel_rate: Math.round(prediction.predicted * 100) / 100,
            fr_level: prediction.frLevel,
            confidence: Math.round(prediction.confidence * 100) / 100,
            correction_factor: Math.round(prediction.correctionFactor * 1000) / 1000,
            base_prediction: Math.round(prediction.base * 100) / 100,
            weather_multiplier: prediction.weatherMultiplier,
            weather_details: weatherDetails
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to create prediction: ' + error.message });
    }
});

// Get recommendations for a vessel
router.get('/vessel/:vesselId/recommendations', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Validate required vessel parameters
        const requiredFields = ['cost_eco', 'cost_full', 'eco_speed', 'full_speed'];
        const missingFields = requiredFields.filter(field => !vessel[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: 'Vessel missing required parameters', 
                missing_fields: missingFields,
                vessel_id: req.vesselId 
            });
        }
        
        const adaptiveModel = new AdaptiveFoulingModel(vessel);
        const recommendations = adaptiveModel.recommendCleaning();
        
        // Add additional context
        const enhancedRecommendations = {
            ...recommendations,
            vessel_name: vessel.name,
            last_clean_date: vessel.last_clean_date,
            next_scheduled_clean: vessel.next_clean_date,
            cost_analysis: {
                current_extra_cost_per_day: recommendations.extraCostPerDay,
                monthly_extra_cost: recommendations.extraCostPerDay * 30,
                annual_extra_cost: recommendations.annualSavings,
                cleaning_cost: recommendations.cleaningCost,
                roi_period_days: recommendations.daysToBreakeven
            },
            urgency_level: getUrgencyLevel(recommendations),
            next_evaluation_date: getNextEvaluationDate(recommendations)
        };
        
        res.json(enhancedRecommendations);
        
    } catch (error) {
        console.error('Error in recommendations endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to get recommendations: ' + error.message,
            stack: config.env === 'development' ? error.stack : undefined
        });
    }
});



// Get trends analysis
router.get('/vessel/:vesselId/trends', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        // Get predictions with actual readings for comparison
        const trendsData = db.db.prepare(`
            SELECT 
                p.*,
                fr.fuel_rate as actual_fuel_rate,
                fr.timestamp as reading_timestamp,
                DATE(p.timestamp) as date
            FROM predictions p
            LEFT JOIN fuel_readings fr ON fr.vessel_id = p.vessel_id 
                AND ABS((julianday(fr.timestamp) - julianday(p.timestamp)) * 24) < 2
            WHERE p.vessel_id = ? AND p.timestamp > datetime('now', '-' || ? || ' days')
            ORDER BY p.timestamp DESC
        `).all(req.vesselId, days);
        
        // Calculate accuracy metrics
        const accuracyMetrics = calculateAccuracyMetrics(trendsData);
        
        // Group by date for trend analysis
        const dailyTrends = groupTrendsByDate(trendsData);
        
        res.json({
            vessel_id: req.vesselId,
            period_days: days,
            accuracy_metrics: accuracyMetrics,
            daily_trends: dailyTrends,
            total_predictions: trendsData.length
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get trends: ' + error.message });
    }
});



// Debug endpoint to list all vessels
router.get('/debug/vessels', auth.middleware(), (req, res) => {
    try {
        // Get all vessels
        const vessels = db.db.prepare('SELECT * FROM vessels').all();
        
        // Get vessel access for current user
        const userVessels = db.statements.getVesselsByUser.all(req.user.id);
        
        res.json({
            total_vessels: vessels.length,
            user_vessels: userVessels.length,
            all_vessels: vessels.map(v => ({
                id: v.id,
                name: v.name,
                created_by: v.created_by,
                cost_eco: v.cost_eco,
                cost_full: v.cost_full,
                eco_speed: v.eco_speed,
                full_speed: v.full_speed
            })),
            user_vessel_ids: userVessels.map(v => v.id),
            current_user_id: req.user.id
        });
        
    } catch (error) {
        console.error('Error in vessels debug endpoint:', error);
        res.status(500).json({ 
            error: 'Vessels debug endpoint error: ' + error.message,
            stack: config.env === 'development' ? error.stack : undefined
        });
    }
});

// Debug endpoint to check vessel data
router.get('/debug/vessel/:vesselId', auth.middleware(), (req, res) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
        
        // Get vessel data
        const vessel = db.statements.getVesselById.get(vesselId);
        if (!vessel) {
            return res.status(404).json({ 
                error: 'Vessel not found',
                vessel_id: vesselId
            });
        }
        
        // Check vessel access
        const hasAccess = db.statements.checkVesselAccess.all(req.user.id, vesselId);
        
        // Get fouling model if exists
        const foulingModel = db.statements.getFoulingModel.get(vesselId);
        
        res.json({
            vessel: {
                id: vessel.id,
                name: vessel.name,
                cost_eco: vessel.cost_eco,
                cost_full: vessel.cost_full,
                eco_speed: vessel.eco_speed,
                full_speed: vessel.full_speed,
                last_clean_date: vessel.last_clean_date,
                next_clean_date: vessel.next_clean_date
            },
            access: hasAccess.length > 0,
            fouling_model_exists: !!foulingModel,
            user_id: req.user.id
        });
        
    } catch (error) {
        console.error('Error in debug endpoint:', error);
        res.status(500).json({ 
            error: 'Debug endpoint error: ' + error.message,
            stack: config.env === 'development' ? error.stack : undefined
        });
    }
});

// Get emissions calculations
router.get('/vessel/:vesselId/emissions', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        const adaptiveModel = new AdaptiveFoulingModel(vessel);
        
        // Emission factor for marine diesel (kg CO2 per liter)
        const emissionFactor = 2.68;
        
        // Calculate daily emissions at eco speed
        const ecoFuelRate = adaptiveModel.predict(vessel.eco_speed);
        const dailyFuelConsumption = ecoFuelRate * 24; // L/day
        const dailyEmissions = dailyFuelConsumption * emissionFactor; // kg CO2/day
        
        // Calculate extra emissions due to fouling
        const cleanFuelRate = adaptiveModel.physics.calculateCostAt(vessel.eco_speed, 0);
        const extraFuelPerDay = (ecoFuelRate - cleanFuelRate) * 24;
        const extraEmissionsPerDay = Math.max(0, extraFuelPerDay * emissionFactor);
        
        res.json({
            vessel_id: req.vesselId,
            fuel_consumption: {
                current_rate_lhr: Math.round(ecoFuelRate * 100) / 100,
                daily_liters: Math.round(dailyFuelConsumption),
                clean_rate_lhr: Math.round(cleanFuelRate * 100) / 100,
                extra_daily_liters: Math.round(extraFuelPerDay)
            },
            emissions: {
                daily_co2_kg: Math.round(dailyEmissions),
                annual_co2_tonnes: Math.round(dailyEmissions * 365 / 1000 * 10) / 10,
                extra_daily_co2_kg: Math.round(extraEmissionsPerDay),
                extra_annual_co2_tonnes: Math.round(extraEmissionsPerDay * 365 / 1000 * 10) / 10
            },
            fouling_impact: {
                fr_level: adaptiveModel.estimateFRLevel(),
                days_since_clean: adaptiveModel.daysSinceClean,
                efficiency_loss_percent: Math.round((ecoFuelRate / cleanFuelRate - 1) * 100)
            },
            calculated_at: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to calculate emissions: ' + error.message });
    }
});

module.exports = router;