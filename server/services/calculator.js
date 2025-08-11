const FoulingPhysics = require('../models/foulingPhysics');

class CalculatorService {
    constructor() {
        // Currency conversion rates (relative to AUD)
        this.conversionRates = {
            AUD: 1,
            GBP: 0.495,  // 1 AUD = 0.495 GBP
            USD: 0.644   // 1 AUD = 0.644 USD
        };

        this.currencySymbols = {
            AUD: '$',
            GBP: '£',
            USD: '$'
        };
    }

    // Convert between currencies
    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        
        const amountInAUD = fromCurrency === 'AUD'
            ? amount
            : amount / this.conversionRates[fromCurrency];
        return amountInAUD * this.conversionRates[toCurrency];
    }

    // Format currency for display
    formatCurrency(value, currency = 'AUD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            currencyDisplay: 'symbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    // Calculate comprehensive fouling impact analysis
    calculateFoulingImpact(vesselData, frLevel, speed, currency = 'AUD') {
        try {
            // Create physics model instance
            const physics = new FoulingPhysics(vesselData);
            
            // Validate vessel data
            const validation = physics.validateVesselData();
            if (!validation.isValid) {
                throw new Error(`Vessel data validation failed: ${validation.errors.join(', ')}`);
            }

            // Calculate costs at specified speed and FR level
            const costAnalysis = physics.calculateCostAt(speed, frLevel);
            
            // Calculate confidence intervals
            const confidenceAnalysis = physics.calculateConfidenceIntervals(speed, frLevel);
            
            // Calculate resistance components
            const resistanceAnalysis = physics.calculateResistanceComponents(speed, frLevel);
            
            // Calculate power requirements
            const powerAnalysis = physics.calculatePowerRequired(speed, frLevel);
            
            // Calculate fuel consumption and emissions
            const fuelAnalysis = physics.estimateFuelRate(speed, frLevel);
            const cleanFuelAnalysis = physics.estimateFuelRate(speed, 0);
            
            // Calculate annual impact (assuming 2400 operating hours per year)
            const annualAnalysis = physics.calculateAnnualImpact(speed, frLevel, 2400);
            
            // Get validation status for research studies
            const validationStatus = physics.getValidationStatus(frLevel, speed);
            
            // Convert costs to requested currency
            const convertedCosts = this.convertCostsToCurrency(costAnalysis, currency);
            const convertedConfidence = this.convertCostsToCurrency(confidenceAnalysis, currency);
            const convertedAnnual = this.convertCostsToCurrency(annualAnalysis, currency);
            
            return {
                // Basic cost analysis
                costs: {
                    clean: convertedCosts.clean,
                    fouled: convertedCosts.fouled,
                    increase: convertedCosts.fouled - convertedCosts.clean,
                    increasePercentage: ((convertedCosts.fouled - convertedCosts.clean) / convertedCosts.clean * 100)
                },
                
                // Confidence intervals
                confidence: {
                    lower: convertedConfidence.confidenceLower,
                    upper: convertedConfidence.confidenceUpper,
                    interval: confidenceAnalysis.confidenceInterval
                },
                
                // Physics analysis
                physics: {
                    foulingIncrease: costAnalysis.foulingIncrease,
                    speedReduction: costAnalysis.speedReduction,
                    roughness: costAnalysis.roughness,
                    reynolds: resistanceAnalysis.reynolds,
                    froude: resistanceAnalysis.froude,
                    formFactor: resistanceAnalysis.form
                },
                
                // Resistance breakdown
                resistance: {
                    friction: resistanceAnalysis.friction,
                    wave: resistanceAnalysis.wave,
                    form: resistanceAnalysis.form,
                    total: resistanceAnalysis.total
                },
                
                // Power and efficiency
                power: {
                    required: powerAnalysis.power,
                    efficiency: powerAnalysis.efficiency
                },
                
                // Fuel and emissions
                fuel: {
                    clean: cleanFuelAnalysis.fuelRate,
                    fouled: fuelAnalysis.fuelRate,
                    extra: fuelAnalysis.fuelRate - cleanFuelAnalysis.fuelRate,
                    cost: this.convertCurrency(fuelAnalysis.cost, 'AUD', currency)
                },
                
                emissions: {
                    clean: cleanFuelAnalysis.co2Emissions,
                    fouled: fuelAnalysis.co2Emissions,
                    extra: fuelAnalysis.co2Emissions - cleanFuelAnalysis.co2Emissions
                },
                
                // Annual impact
                annual: {
                    extraCost: convertedAnnual.annualExtraCost,
                    extraFuel: convertedAnnual.annualExtraFuel,
                    extraCO2: convertedAnnual.annualExtraCO2,
                    operatingHours: convertedAnnual.operatingHours
                },
                
                // Research validation
                validation: validationStatus,
                
                // Currency information
                currency: {
                    code: currency,
                    symbol: this.currencySymbols[currency]
                }
            };
            
        } catch (error) {
            throw new Error(`Calculation failed: ${error.message}`);
        }
    }

    // Calculate cost curves for charting
    calculateCostCurves(vesselData, frLevel, currency = 'AUD') {
        try {
            const physics = new FoulingPhysics(vesselData);
            const validation = physics.validateVesselData();
            
            if (!validation.isValid) {
                throw new Error(`Vessel data validation failed: ${validation.errors.join(', ')}`);
            }

            // Calculate speed range for chart
            const minSpeed = Math.max(vesselData.eco_speed - 4, 4);
            const maxSpeed = vesselData.full_speed + 2;
            
            // Adjust step size based on speed range for better readability
            const stepSize = (maxSpeed - minSpeed) > 8 ? 0.5 : 0.25;
            
            const speeds = [];
            const cleanCosts = [];
            const fouledCosts = [];
            const fouledCostsLower = [];
            const fouledCostsUpper = [];
            const co2Emissions = [];
            const resistanceData = [];
            
            for (let s = minSpeed; s <= maxSpeed; s += stepSize) {
                const speedKnots = s;
                
                // Calculate costs
                const costAnalysis = physics.calculateCostAt(speedKnots, frLevel);
                const confidenceAnalysis = physics.calculateConfidenceIntervals(speedKnots, frLevel);
                const resistanceAnalysis = physics.calculateResistanceComponents(speedKnots, frLevel);
                const fuelAnalysis = physics.estimateFuelRate(speedKnots, frLevel);
                const cleanFuelAnalysis = physics.estimateFuelRate(speedKnots, 0);
                
                speeds.push(speedKnots.toFixed(1));
                
                // Convert costs to display currency
                const displayCleanCost = this.convertCurrency(costAnalysis.clean, 'AUD', currency);
                const displayFouledCost = this.convertCurrency(costAnalysis.fouled, 'AUD', currency);
                const displayFouledLower = this.convertCurrency(confidenceAnalysis.confidenceLower, 'AUD', currency);
                const displayFouledUpper = this.convertCurrency(confidenceAnalysis.confidenceUpper, 'AUD', currency);
                
                cleanCosts.push(displayCleanCost);
                fouledCosts.push(displayFouledCost);
                fouledCostsLower.push(displayFouledLower);
                fouledCostsUpper.push(displayFouledUpper);
                
                // CO2 emissions based on extra fuel
                const extraCO2 = fuelAnalysis.co2Emissions - cleanFuelAnalysis.co2Emissions;
                co2Emissions.push(extraCO2);
                
                // Resistance data for analysis
                resistanceData.push({
                    speed: speedKnots,
                    friction: resistanceAnalysis.friction,
                    wave: resistanceAnalysis.wave,
                    total: resistanceAnalysis.total,
                    froude: resistanceAnalysis.froude
                });
            }
            
            return {
                speeds,
                cleanCosts,
                fouledCosts,
                fouledCostsLower,
                fouledCostsUpper,
                co2Emissions,
                resistanceData,
                currency: {
                    code: currency,
                    symbol: this.currencySymbols[currency]
                }
            };
            
        } catch (error) {
            throw new Error(`Cost curve calculation failed: ${error.message}`);
        }
    }

    // Calculate comprehensive vessel analysis
    calculateVesselAnalysis(vesselData, currency = 'AUD') {
        try {
            const physics = new FoulingPhysics(vesselData);
            const validation = physics.validateVesselData();
            
            if (!validation.isValid) {
                throw new Error(`Vessel data validation failed: ${validation.errors.join(', ')}`);
            }

            // Calculate at economic and full speeds for different FR levels
            const analysis = {
                ecoSpeed: {},
                fullSpeed: {},
                vesselCharacteristics: physics.getVesselCharacteristics(),
                recommendations: []
            };

            // Analyze at economic speed
            for (let fr = 0; fr <= 5; fr++) {
                const ecoAnalysis = this.calculateFoulingImpact(vesselData, fr, vesselData.eco_speed, currency);
                analysis.ecoSpeed[`FR${fr}`] = ecoAnalysis;
            }

            // Analyze at full speed
            for (let fr = 0; fr <= 5; fr++) {
                const fullAnalysis = this.calculateFoulingImpact(vesselData, fr, vesselData.full_speed, currency);
                analysis.fullSpeed[`FR${fr}`] = fullAnalysis;
            }

            // Generate recommendations
            analysis.recommendations = this.generateRecommendations(analysis);

            return analysis;
            
        } catch (error) {
            throw new Error(`Vessel analysis failed: ${error.message}`);
        }
    }

    // Generate operational recommendations
    generateRecommendations(analysis) {
        const recommendations = [];
        
        // Analyze cost impact at different FR levels
        const ecoFR5 = analysis.ecoSpeed.FR5;
        const fullFR5 = analysis.fullSpeed.FR5;
        
        if (ecoFR5 && fullFR5) {
            const ecoIncrease = ecoFR5.costs.increasePercentage;
            const fullIncrease = fullFR5.costs.increasePercentage;
            
            if (ecoIncrease > 50) {
                recommendations.push({
                    type: 'warning',
                    priority: 'high',
                    message: `Heavy fouling (FR5) increases economic speed costs by ${ecoIncrease.toFixed(1)}%. Consider immediate hull cleaning.`,
                    impact: 'High cost impact at operational speeds'
                });
            }
            
            if (fullIncrease > 100) {
                recommendations.push({
                    type: 'critical',
                    priority: 'urgent',
                    message: `Heavy fouling (FR5) increases full speed costs by ${fullIncrease.toFixed(1)}%. Hull cleaning required before high-speed operations.`,
                    impact: 'Severe cost impact at high speeds'
                });
            }
            
            // Annual impact analysis
            const annualExtraCost = fullFR5.annual.extraCost;
            if (annualExtraCost > 100000) {
                recommendations.push({
                    type: 'info',
                    priority: 'medium',
                    message: `Annual fouling cost impact: ${this.formatCurrency(annualExtraCost, fullFR5.currency.code)}. Regular hull maintenance recommended.`,
                    impact: 'Significant annual cost savings potential'
                });
            }
        }
        
        return recommendations;
    }

    // Convert cost objects to different currency
    convertCostsToCurrency(costObject, targetCurrency) {
        if (targetCurrency === 'AUD') return costObject;
        
        const converted = {};
        for (const [key, value] of Object.entries(costObject)) {
            if (typeof value === 'number' && key.toLowerCase().includes('cost')) {
                converted[key] = this.convertCurrency(value, 'AUD', targetCurrency);
            } else {
                converted[key] = value;
            }
        }
        return converted;
    }

    // Get available currencies
    getAvailableCurrencies() {
        return Object.keys(this.conversionRates).map(code => ({
            code,
            symbol: this.currencySymbols[code],
            name: this.getCurrencyName(code)
        }));
    }

    // Get currency display name
    getCurrencyName(code) {
        const names = {
            AUD: 'Australian Dollar',
            GBP: 'British Pound',
            USD: 'US Dollar'
        };
        return names[code] || code;
    }
}

module.exports = CalculatorService;
