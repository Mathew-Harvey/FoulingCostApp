const FoulingPhysics = require('./foulingPhysics');
const db = require('../database');

class AdaptiveFoulingModel {
    constructor(vessel) {
        this.vesselId = vessel.id;
        
        // Validate required vessel parameters
        const requiredFields = ['cost_eco', 'cost_full', 'eco_speed', 'full_speed'];
        const missingFields = requiredFields.filter(field => !vessel[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Vessel missing required parameters: ${missingFields.join(', ')}`);
        }
        
        this.physics = new FoulingPhysics(vessel);
        
        // Initialize or load model parameters
        this.loadModelState();
        
        // Physics model parameters (calculated once)
        const { alpha, beta } = this.physics.solveAlphaBeta(
            vessel.cost_eco, vessel.cost_full, 
            vessel.eco_speed, vessel.full_speed
        );
        this.baseAlpha = alpha;
        this.baseBeta = beta;
        
        // Adaptive parameters (loaded from DB or defaults)
        this.correctionFactor = this.modelState?.correction_factor || 1.0;
        this.foulingAccumulationRate = this.modelState?.fouling_accumulation_rate || 1.0;
        this.confidence = this.modelState?.confidence_score || 0.0;
        this.trainingDataCount = this.modelState?.training_data_count || 0;
        
        // Calculate days since clean
        this.daysSinceClean = this.calculateDaysSinceClean(vessel.last_clean_date);
        
        // Training data buffer (in memory for batch processing)
        this.trainingDataBuffer = [];
        this.maxBufferSize = 100;
    }
    
    loadModelState() {
        try {
            this.modelState = db.statements.getFoulingModel.get(this.vesselId);
        } catch (error) {
            console.error('Error loading model state:', error);
            this.modelState = null;
        }
    }
    
    saveModelState() {
        const now = new Date().toISOString();
        
        try {
            if (this.modelState) {
                // Update existing model
                db.statements.updateFoulingModel.run(
                    this.correctionFactor,
                    this.foulingAccumulationRate,
                    this.estimateFRLevel(this.daysSinceClean),
                    this.confidence,
                    this.trainingDataCount,
                    now,
                    this.vesselId
                );
            } else {
                // Create new model
                db.statements.createFoulingModel.run(
                    this.vesselId,
                    this.baseAlpha,
                    this.baseBeta,
                    this.correctionFactor,
                    this.foulingAccumulationRate,
                    this.estimateFRLevel(this.daysSinceClean),
                    this.confidence,
                    this.trainingDataCount,
                    now
                );
            }
        } catch (error) {
            console.error('Error saving model state:', error);
        }
    }
    
    calculateDaysSinceClean(lastCleanDate) {
        if (!lastCleanDate) return 0;
        
        const now = new Date();
        const clean = new Date(lastCleanDate);
        return Math.max(0, Math.floor((now - clean) / (1000 * 60 * 60 * 24)));
    }
    
    estimateFRLevel(daysSinceClean = null) {
        const days = daysSinceClean !== null ? daysSinceClean : this.daysSinceClean;
        const adjustedDays = days * this.foulingAccumulationRate;
        
        // Progressive fouling scale based on adjusted days
        if (adjustedDays < 30) return 0;      // Clean (0-30 days)
        if (adjustedDays < 60) return 1;      // Light fouling (30-60 days)
        if (adjustedDays < 120) return 2;     // Moderate fouling (60-120 days)
        if (adjustedDays < 180) return 3;     // Heavy fouling (120-180 days)
        if (adjustedDays < 270) return 4;     // Very heavy fouling (180-270 days)
        return 5;                             // Extreme fouling (270+ days)
    }
    
    predict(speed, weather = 'calm', returnComponents = false) {
        // Get current fouling level
        const frLevel = this.estimateFRLevel();
        
        // Base prediction from physics model
        const baseCost = this.physics.calculateCostAt(speed, frLevel);
        
        // Weather impact multipliers
        const weatherMultipliers = {
            calm: 1.0,
            moderate: 1.05,
            rough: 1.15,
            storm: 1.30
        };
        
        const weatherMultiplier = weatherMultipliers[weather] || weatherMultipliers.moderate;
        
        // Apply adaptive correction
        const predictedCost = baseCost * this.correctionFactor * weatherMultiplier;
        
        if (returnComponents) {
            return {
                predicted: predictedCost,
                base: baseCost,
                frLevel: frLevel,
                correctionFactor: this.correctionFactor,
                weatherMultiplier: weatherMultiplier,
                confidence: this.confidence
            };
        }
        
        return predictedCost;
    }
    
    updateFromReading(actualFuelRate, speed, weather = 'calm', timestamp = null) {
        if (actualFuelRate <= 0) {
            console.warn('Invalid fuel rate for model update:', actualFuelRate);
            return;
        }
        
        // Get prediction for comparison
        const prediction = this.predict(speed, weather, true);
        const predicted = prediction.predicted;
        
        // Calculate error metrics
        const absoluteError = Math.abs(actualFuelRate - predicted);
        const relativeError = absoluteError / predicted;
        const signedError = (actualFuelRate - predicted) / predicted;
        
        // Adaptive learning rate based on confidence
        const baseLearningRate = 0.1;
        const confidenceAdjustment = Math.max(0.5, 1 - this.confidence / 100);
        const learningRate = baseLearningRate * confidenceAdjustment;
        
        // Update correction factor with bounds checking
        const correctionUpdate = 1 + signedError * learningRate;
        this.correctionFactor = Math.max(0.3, Math.min(3.0, 
            this.correctionFactor * (1 - learningRate) + correctionUpdate * learningRate
        ));
        
        // Update confidence based on prediction accuracy
        this.updateConfidence(relativeError);
        
        // Store training data
        this.storeTrainingData({
            actual: actualFuelRate,
            predicted: predicted,
            speed: speed,
            weather: weather,
            frLevel: prediction.frLevel,
            error: relativeError,
            timestamp: timestamp || new Date().toISOString()
        });
        
        // Increment training counter
        this.trainingDataCount++;
        
        // Check if we should retrain the model
        if (this.shouldRetrain()) {
            this.retrainModel();
        }
        
        // Save updated state
        this.saveModelState();
        
        return {
            error: relativeError,
            correctionFactor: this.correctionFactor,
            confidence: this.confidence
        };
    }
    
    updateConfidence(relativeError) {
        // Confidence update based on prediction accuracy
        const errorThreshold = 0.15; // 15% error threshold
        
        if (relativeError < errorThreshold) {
            // Good prediction - increase confidence
            const improvement = (errorThreshold - relativeError) * 100;
            this.confidence = Math.min(100, this.confidence + improvement * 0.5);
        } else {
            // Poor prediction - decrease confidence
            const degradation = (relativeError - errorThreshold) * 100;
            this.confidence = Math.max(0, this.confidence - degradation * 0.3);
        }
    }
    
    storeTrainingData(dataPoint) {
        this.trainingDataBuffer.push(dataPoint);
        
        // Keep buffer size manageable
        if (this.trainingDataBuffer.length > this.maxBufferSize) {
            this.trainingDataBuffer.shift(); // Remove oldest
        }
    }
    
    shouldRetrain() {
        // Retrain every 10 readings or if confidence drops below 50%
        return (this.trainingDataCount % 10 === 0) || 
               (this.confidence < 50 && this.trainingDataBuffer.length >= 5);
    }
    
    retrainModel() {
        if (this.trainingDataBuffer.length < 3) {
            console.log('Insufficient training data for retraining');
            return;
        }
        
        console.log(`Retraining model for vessel ${this.vesselId} with ${this.trainingDataBuffer.length} data points`);
        
        // Simple linear regression on fouling accumulation rate
        // More sophisticated ML models could be implemented here
        try {
            this.updateFoulingAccumulationRate();
            console.log(`Updated fouling accumulation rate: ${this.foulingAccumulationRate}`);
        } catch (error) {
            console.error('Error in model retraining:', error);
        }
    }
    
    updateFoulingAccumulationRate() {
        // Analyze the relationship between days since clean and prediction errors
        const dataPoints = this.trainingDataBuffer.filter(d => d.frLevel > 0);
        
        if (dataPoints.length < 3) return;
        
        // Calculate average error by FR level
        const errorsByFR = {};
        dataPoints.forEach(d => {
            if (!errorsByFR[d.frLevel]) {
                errorsByFR[d.frLevel] = [];
            }
            errorsByFR[d.frLevel].push(d.error);
        });
        
        // If consistently over-predicting at higher FR levels, fouling accumulates slower
        // If under-predicting, fouling accumulates faster
        let totalAdjustment = 0;
        let adjustmentCount = 0;
        
        Object.keys(errorsByFR).forEach(frLevel => {
            const errors = errorsByFR[frLevel];
            const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
            
            // If actual > predicted (positive error), fouling might be accumulating faster
            totalAdjustment += avgError * 0.5;
            adjustmentCount++;
        });
        
        if (adjustmentCount > 0) {
            const adjustment = totalAdjustment / adjustmentCount;
            this.foulingAccumulationRate = Math.max(0.5, Math.min(2.0, 
                this.foulingAccumulationRate * (1 + adjustment)
            ));
        }
    }
    
    calculateExtraCostPerDay() {
        const currentSpeed = this.physics.ecoSpeed;
        
        // Calculate cost at clean condition (FR0)
        const cleanCost = this.physics.calculateCostAt(currentSpeed, 0);
        
        // Calculate current cost with fouling
        const currentCost = this.predict(currentSpeed);
        
        // Extra cost per day (assuming 24 hours operation)
        return Math.max(0, (currentCost - cleanCost) * 24);
    }
    
    recommendCleaning() {
        const currentFRLevel = this.estimateFRLevel();
        const extraCostPerDay = this.calculateExtraCostPerDay();
        
        // Typical hull cleaning cost (configurable)
        const cleaningCost = 15000; // AUD
        
        // Calculate payback period
        const daysToBreakeven = extraCostPerDay > 0 ? cleaningCost / extraCostPerDay : Infinity;
        
        // Annual savings if cleaned now
        const annualSavings = extraCostPerDay * 365;
        
        // Recommend cleaning if:
        // 1. FR level is 3 or higher
        // 2. Payback period is less than 60 days
        // 3. Annual savings exceed 2x cleaning cost
        const shouldClean = currentFRLevel >= 3 || 
                           daysToBreakeven < 60 || 
                           annualSavings > cleaningCost * 2;
        
        return {
            recommended: shouldClean,
            currentFRLevel: currentFRLevel,
            extraCostPerDay: Math.round(extraCostPerDay),
            daysToBreakeven: Math.round(daysToBreakeven),
            annualSavings: Math.round(annualSavings),
            cleaningCost: cleaningCost,
            confidence: Math.round(this.confidence),
            daysSinceClean: this.daysSinceClean,
            correctionFactor: this.correctionFactor
        };
    }
    
    getModelStatistics() {
        return {
            vesselId: this.vesselId,
            baseAlpha: this.baseAlpha,
            baseBeta: this.baseBeta,
            correctionFactor: this.correctionFactor,
            foulingAccumulationRate: this.foulingAccumulationRate,
            confidence: this.confidence,
            trainingDataCount: this.trainingDataCount,
            currentFRLevel: this.estimateFRLevel(),
            daysSinceClean: this.daysSinceClean,
            bufferSize: this.trainingDataBuffer.length
        };
    }
    
    // Predict fuel consumption at various speeds for dashboard
    generateSpeedCurve(minSpeed = 6, maxSpeed = 20, steps = 15) {
        const speedRange = maxSpeed - minSpeed;
        const speedStep = speedRange / (steps - 1);
        const curve = [];
        
        for (let i = 0; i < steps; i++) {
            const speed = minSpeed + (i * speedStep);
            
            // Get fuel rate prediction instead of cost
            const fuelData = this.physics.estimateFuelRate(speed, this.estimateFRLevel());
            const cleanFuelData = this.physics.estimateFuelRate(speed, 0);
            
            curve.push({
                speed: Math.round(speed * 10) / 10,
                fuelRate: Math.round(fuelData.fuelRate * 100) / 100, // Convert to L/hr
                cost: Math.round(fuelData.cost * 100) / 100,
                frLevel: this.estimateFRLevel(),
                confidence: Math.round(this.confidence),
                extraFuel: Math.round((fuelData.fuelRate - cleanFuelData.fuelRate) * 100) / 100
            });
        }
        
        return curve;
    }
}

module.exports = AdaptiveFoulingModel;