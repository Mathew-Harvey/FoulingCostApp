const express = require('express');
const router = express.Router();
const CalculatorService = require('../services/calculator');
const auth = require('../auth');

// Initialize calculator service
const calculatorService = new CalculatorService();

// Middleware to validate vessel data
function validateVesselData(req, res, next) {
    const { length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full } = req.body;
    
    const errors = [];
    
    if (!length || length <= 0) errors.push('Length must be positive');
    if (!beam || beam <= 0) errors.push('Beam must be positive');
    if (!draft || draft <= 0) errors.push('Draft must be positive');
    if (!cb || cb <= 0 || cb > 1) errors.push('Block coefficient must be between 0 and 1');
    if (!eco_speed || eco_speed <= 0) errors.push('Economic speed must be positive');
    if (!full_speed || full_speed <= 0) errors.push('Full speed must be positive');
    if (full_speed <= eco_speed) errors.push('Full speed must be greater than economic speed');
    if (!cost_eco || cost_eco <= 0) errors.push('Economic cost must be positive');
    if (!cost_full || cost_full <= 0) errors.push('Full cost must be positive');
    if (cost_full <= cost_eco) errors.push('Full cost must be greater than economic cost');
    
    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors: errors
        });
    }
    
    next();
}

// Get available currencies
router.get('/currencies', (req, res) => {
    try {
        const currencies = calculatorService.getAvailableCurrencies();
        res.json({
            success: true,
            data: currencies
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Calculate fouling impact at specific speed and FR level
router.post('/impact', auth.middleware(), validateVesselData, (req, res) => {
    try {
        const {
            length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full,
            vessel_type, vessel_category, wave_exp, fr_level, speed, currency = 'AUD'
        } = req.body;
        
        // Validate FR level
        if (fr_level < 0 || fr_level > 5 || !Number.isInteger(fr_level)) {
            return res.status(400).json({
                success: false,
                error: 'FR level must be an integer between 0 and 5'
            });
        }
        
        // Validate speed
        if (speed < 0) {
            return res.status(400).json({
                success: false,
                error: 'Speed must be positive'
            });
        }
        
        // Prepare vessel data
        const vesselData = {
            length: parseFloat(length),
            beam: parseFloat(beam),
            draft: parseFloat(draft),
            cb: parseFloat(cb),
            eco_speed: parseFloat(eco_speed),
            full_speed: parseFloat(full_speed),
            cost_eco: parseFloat(cost_eco),
            cost_full: parseFloat(cost_full),
            vessel_type: vessel_type || 'custom',
            vessel_category: vessel_category || 'cargo',
            wave_exp: parseFloat(wave_exp) || 4.5
        };
        
        // Calculate impact
        const impact = calculatorService.calculateFoulingImpact(vesselData, fr_level, speed, currency);
        
        res.json({
            success: true,
            data: impact
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Calculate cost curves for charting
router.post('/curves', auth.middleware(), validateVesselData, (req, res) => {
    try {
        const {
            length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full,
            vessel_type, vessel_category, wave_exp, fr_level, currency = 'AUD'
        } = req.body;
        
        // Validate FR level
        if (fr_level < 0 || fr_level > 5 || !Number.isInteger(fr_level)) {
            return res.status(400).json({
                success: false,
                error: 'FR level must be an integer between 0 and 5'
            });
        }
        
        // Prepare vessel data
        const vesselData = {
            length: parseFloat(length),
            beam: parseFloat(beam),
            draft: parseFloat(draft),
            cb: parseFloat(cb),
            eco_speed: parseFloat(eco_speed),
            full_speed: parseFloat(full_speed),
            cost_eco: parseFloat(cost_eco),
            cost_full: parseFloat(cost_full),
            vessel_type: vessel_type || 'custom',
            vessel_category: vessel_category || 'cargo',
            wave_exp: parseFloat(wave_exp) || 4.5
        };
        
        // Calculate curves
        const curves = calculatorService.calculateCostCurves(vesselData, fr_level, currency);
        
        res.json({
            success: true,
            data: curves
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Calculate comprehensive vessel analysis
router.post('/analysis', auth.middleware(), validateVesselData, (req, res) => {
    try {
        const {
            length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full,
            vessel_type, vessel_category, wave_exp, currency = 'AUD'
        } = req.body;
        
        // Prepare vessel data
        const vesselData = {
            length: parseFloat(length),
            beam: parseFloat(beam),
            draft: parseFloat(draft),
            cb: parseFloat(cb),
            eco_speed: parseFloat(eco_speed),
            full_speed: parseFloat(full_speed),
            cost_eco: parseFloat(cost_eco),
            cost_full: parseFloat(cost_full),
            vessel_type: vessel_type || 'custom',
            vessel_category: vessel_category || 'cargo',
            wave_exp: parseFloat(wave_exp) || 4.5
        };
        
        // Calculate comprehensive analysis
        const analysis = calculatorService.calculateVesselAnalysis(vesselData, currency);
        
        res.json({
            success: true,
            data: analysis
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Calculate multiple FR levels at once
router.post('/multi-fr', auth.middleware(), validateVesselData, (req, res) => {
    try {
        const {
            length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full,
            vessel_type, vessel_category, wave_exp, speeds, currency = 'AUD'
        } = req.body;
        
        // Validate speeds array
        if (!Array.isArray(speeds) || speeds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Speeds must be a non-empty array'
            });
        }
        
        // Prepare vessel data
        const vesselData = {
            length: parseFloat(length),
            beam: parseFloat(beam),
            draft: parseFloat(draft),
            cb: parseFloat(cb),
            eco_speed: parseFloat(eco_speed),
            full_speed: parseFloat(full_speed),
            cost_eco: parseFloat(cost_eco),
            cost_full: parseFloat(cost_full),
            vessel_type: vessel_type || 'custom',
            vessel_category: vessel_category || 'cargo',
            wave_exp: parseFloat(wave_exp) || 4.5
        };
        
        // Calculate impact for each FR level at each speed
        const results = {};
        
        for (let fr = 0; fr <= 5; fr++) {
            results[`FR${fr}`] = {};
            for (const speed of speeds) {
                try {
                    const impact = calculatorService.calculateFoulingImpact(vesselData, fr, speed, currency);
                    results[`FR${fr}`][speed] = impact;
                } catch (error) {
                    results[`FR${fr}`][speed] = { error: error.message };
                }
            }
        }
        
        res.json({
            success: true,
            data: {
                vessel: vesselData,
                results: results,
                currency: currency
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get vessel parameter recommendations
router.post('/recommendations', auth.middleware(), (req, res) => {
    try {
        const { length, beam, draft, vessel_category = 'cargo' } = req.body;
        
        if (!length || !beam || !draft) {
            return res.status(400).json({
                success: false,
                error: 'Length, beam, and draft are required'
            });
        }
        
        // Create temporary vessel data for estimation
        const vesselData = {
            length: parseFloat(length),
            beam: parseFloat(beam),
            draft: parseFloat(draft),
            cb: 0.65, // Default block coefficient
            vessel_category: vessel_category
        };
        
        // Use physics model to estimate parameters
        const FoulingPhysics = require('../models/foulingPhysics');
        const physics = new FoulingPhysics(vesselData);
        
        const recommendations = {
            estimatedSpeeds: {
                eco: physics.ecoSpeed,
                full: physics.fullSpeed
            },
            estimatedCosts: {
                eco: physics.costEco,
                full: physics.costFull
            },
            vesselCharacteristics: physics.getVesselCharacteristics(),
            suggestions: []
        };
        
        // Generate suggestions based on vessel type
        if (vessel_category === 'cargo') {
            recommendations.suggestions.push({
                type: 'info',
                message: 'For cargo vessels, consider block coefficient between 0.65-0.75 for optimal efficiency',
                impact: 'Improved fuel efficiency and cargo capacity'
            });
        } else if (vessel_category === 'cruise') {
            recommendations.suggestions.push({
                type: 'info',
                message: 'Cruise vessels benefit from lower block coefficients (0.55-0.65) for better speed performance',
                impact: 'Enhanced passenger comfort and reduced travel time'
            });
        }
        
        res.json({
            success: true,
            data: recommendations
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Calculator service is healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

module.exports = router;
