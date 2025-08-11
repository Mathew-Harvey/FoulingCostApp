// Enhanced Hull Fouling Calculator Component
class EnhancedCalculator {
    constructor() {
        this.currentCurrency = 'AUD';
        this.chart = null;
        this.vesselData = null;
        this.currentAnalysis = null;
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        console.log('🚢 Enhanced Hull Fouling Calculator - Initializing...');
        
        this.setupEventListeners();
        this.loadCurrencies();
        this.initializeDefaultVessel();
        
        console.log('✅ Enhanced Calculator initialized successfully');
    }
    
    setupEventListeners() {
        // Vessel type change
        const vesselTypeSelect = document.getElementById('vesselType');
        if (vesselTypeSelect) {
            vesselTypeSelect.addEventListener('change', (e) => this.onVesselTypeChange(e));
        }
        
        // Custom vessel inputs
        const customInputs = ['customLength', 'customBeam', 'customDraft', 'customCb', 'vesselCategory'];
        customInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => this.onCustomVesselChange());
            }
        });
        
        // Cost inputs
        const costInputs = ['costEco', 'costFull'];
        costInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => this.onCostInputChange(e));
            }
        });
        
        // FR slider
        const frSlider = document.getElementById('frSlider');
        if (frSlider) {
            frSlider.addEventListener('input', () => this.onFRLevelChange());
        }
        
        // Currency selector
        const currencySelect = document.getElementById('currencySelect');
        if (currencySelect) {
            currencySelect.addEventListener('change', (e) => this.onCurrencyChange(e));
        }
        
        // Range ticks
        document.querySelectorAll('.range-tick').forEach(tick => {
            tick.addEventListener('click', (e) => this.onRangeTickClick(e));
        });
        
        // Calculate button
        const calculateBtn = document.getElementById('calculateBtn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', () => this.calculate());
        }
    }
    
    async loadCurrencies() {
        try {
            const response = await fetch('/api/calculator/currencies');
            if (response.ok) {
                const data = await response.json();
                this.populateCurrencySelector(data.data);
            }
        } catch (error) {
            console.error('Failed to load currencies:', error);
        }
    }
    
    populateCurrencySelector(currencies) {
        const selector = document.getElementById('currencySelect');
        if (!selector) return;
        
        selector.innerHTML = '';
        currencies.forEach(currency => {
            const option = document.createElement('option');
            option.value = currency.code;
            option.textContent = `${currency.symbol} ${currency.name}`;
            selector.appendChild(option);
        });
    }
    
    initializeDefaultVessel() {
        // Set default vessel data
        this.vesselData = {
            vessel_type: 'tug',
            vessel_category: 'workboat',
            length: 32,
            beam: 10,
            draft: 4.5,
            cb: 0.65,
            eco_speed: 8,
            full_speed: 13,
            cost_eco: 600,
            cost_full: 2160,
            wave_exp: 4.5
        };
        
        this.updateVesselInputs();
    }
    
    onVesselTypeChange(event) {
        const vesselType = event.target.value;
        
        if (vesselType === 'custom') {
            this.showCustomVesselSection();
        } else {
            this.hideCustomVesselSection();
            this.loadPresetVessel(vesselType);
        }
        
        this.updateVesselInputs();
        this.calculate();
    }
    
    loadPresetVessel(vesselType) {
        const presets = {
            tug: {
                name: "Harbor Tug (32m)",
                length: 32,
                beam: 10,
                draft: 4.5,
                cb: 0.65,
                eco_speed: 8,
                full_speed: 13,
                cost_eco: 600,
                cost_full: 2160,
                wave_exp: 4.5,
                vessel_category: 'workboat'
            },
            cruiseShip: {
                name: "Passenger Cruise Ship (93m)",
                length: 93,
                beam: 16,
                draft: 5.2,
                cb: 0.62,
                eco_speed: 10,
                full_speed: 13.8,
                cost_eco: 1600,
                cost_full: 4200,
                wave_exp: 4.6,
                vessel_category: 'cruise'
            }
        };
        
        if (presets[vesselType]) {
            this.vesselData = { ...presets[vesselType], vessel_type: vesselType };
        }
    }
    
    showCustomVesselSection() {
        const customSection = document.getElementById('customVesselParams');
        if (customSection) {
            customSection.style.display = 'block';
        }
    }
    
    hideCustomVesselSection() {
        const customSection = document.getElementById('customVesselParams');
        if (customSection) {
            customSection.style.display = 'none';
        }
    }
    
    onCustomVesselChange() {
        this.updateVesselDataFromInputs();
        this.calculate();
    }
    
    onCostInputChange(event) {
        const input = event.target;
        input.setAttribute('data-user-edited', 'true');
        this.updateVesselDataFromInputs();
        this.calculate();
    }
    
    onFRLevelChange() {
        this.updateFRLabel();
        this.calculate();
    }
    
    onCurrencyChange(event) {
        const newCurrency = event.target.value;
        if (newCurrency !== this.currentCurrency) {
            this.currentCurrency = newCurrency;
            this.convertCosts();
            this.calculate();
        }
    }
    
    onRangeTickClick(event) {
        const tick = event.currentTarget;
        const value = tick.getAttribute('data-value');
        const slider = document.getElementById('frSlider');
        if (slider) {
            slider.value = value;
            this.updateFRLabel();
            this.calculate();
        }
    }
    
    updateVesselDataFromInputs() {
        const inputs = {
            length: 'customLength',
            beam: 'customBeam',
            draft: 'customDraft',
            cb: 'customCb',
            eco_speed: 'customEcoSpeed',
            full_speed: 'customFullSpeed',
            vessel_category: 'vesselCategory'
        };
        
        for (const [key, id] of Object.entries(inputs)) {
            const input = document.getElementById(id);
            if (input && input.value) {
                this.vesselData[key] = parseFloat(input.value) || this.vesselData[key];
            }
        }
        
        // Update displacement
        this.updateDisplacement();
    }
    
    updateDisplacement() {
        const displacementInput = document.getElementById('customDisplacement');
        if (displacementInput) {
            const displacement = this.vesselData.length * this.vesselData.beam * 
                               this.vesselData.draft * this.vesselData.cb * 1.025;
            displacementInput.value = Math.round(displacement);
        }
    }
    
    updateVesselInputs() {
        // Update form inputs with current vessel data
        const inputs = {
            customLength: this.vesselData.length,
            customBeam: this.vesselData.beam,
            customDraft: this.vesselData.draft,
            customCb: this.vesselData.cb,
            customEcoSpeed: this.vesselData.eco_speed,
            customFullSpeed: this.vesselData.full_speed,
            vesselCategory: this.vesselData.vessel_category
        };
        
        for (const [id, value] of Object.entries(inputs)) {
            const input = document.getElementById(id);
            if (input) {
                input.value = value;
            }
        }
        
        this.updateDisplacement();
    }
    
    updateFRLabel() {
        const slider = document.getElementById('frSlider');
        const label = document.getElementById('frLabel');
        if (slider && label) {
            const value = slider.value;
            label.textContent = `FR${value}`;
        }
    }
    
    convertCosts() {
        // Convert costs to new currency
        const costInputs = ['costEco', 'costFull'];
        costInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input && input.value) {
                const costInAUD = parseFloat(input.value);
                const convertedCost = this.convertCurrency(costInAUD, 'AUD', this.currentCurrency);
                input.value = Math.round(convertedCost);
            }
        });
    }
    
    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        
        // Simple conversion rates (in production, these would come from an API)
        const rates = {
            AUD: 1,
            GBP: 0.495,
            USD: 0.644
        };
        
        const amountInAUD = fromCurrency === 'AUD' ? amount : amount / rates[fromCurrency];
        return amountInAUD * rates[toCurrency];
    }
    
    async calculate() {
        try {
            this.showLoadingState();
            
            // Get current FR level
            const frSlider = document.getElementById('frSlider');
            const frLevel = frSlider ? parseInt(frSlider.value) : 2;
            
            // Update vessel data from inputs
            this.updateVesselDataFromInputs();
            
            // Calculate fouling impact
            const impact = await this.calculateFoulingImpact(frLevel);
            
            // Calculate cost curves for charting
            const curves = await this.calculateCostCurves(frLevel);
            
            // Update display
            this.updateResults(impact);
            this.updateChart(curves);
            this.updateFoulingTable(frLevel);
            
            this.currentAnalysis = { impact, curves };
            
        } catch (error) {
            console.error('Calculation failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoadingState();
        }
    }
    
    async calculateFoulingImpact(frLevel) {
        const response = await fetch('/api/calculator/impact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getAuthToken()}`
            },
            body: JSON.stringify({
                ...this.vesselData,
                fr_level: frLevel,
                currency: this.currentCurrency
            })
        });
        
        if (!response.ok) {
            throw new Error(`Calculation failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data;
    }
    
    async calculateCostCurves(frLevel) {
        const response = await fetch('/api/calculator/curves', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getAuthToken()}`
            },
            body: JSON.stringify({
                ...this.vesselData,
                fr_level: frLevel,
                currency: this.currentCurrency
            })
        });
        
        if (!response.ok) {
            throw new Error(`Curve calculation failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data;
    }
    
    updateResults(impact) {
        const resultsContainer = document.getElementById('resultsText');
        if (!resultsContainer) return;
        
        const html = this.generateResultsHTML(impact);
        resultsContainer.innerHTML = html;
    }
    
    generateResultsHTML(impact) {
        const { costs, confidence, physics, fuel, emissions, annual, validation } = impact;
        const currency = impact.currency;
        
        let html = `
            <div class="result-item">
                <span class="result-label">Vessel Type:</span>
                <span class="result-value">${this.vesselData.vessel_type === 'custom' ? 'Custom Vessel' : this.vesselData.vessel_type}</span>
            </div>
            
            <div class="result-group">
                <div class="result-group-header">
                    <i class="fas fa-tachometer-alt"></i>
                    <h4>Cost Analysis</h4>
                </div>
                <div class="result-item">
                    <span class="result-label">Clean Hull:</span>
                    <span class="result-value">${this.formatCurrency(costs.clean, currency.code)}/hr</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fouled Hull (FR${this.getCurrentFRLevel()}):</span>
                    <span class="result-value">${this.formatCurrency(costs.fouled, currency.code)}/hr</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Cost Increase:</span>
                    <span class="result-value">${costs.increasePercentage.toFixed(1)}%</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional Cost:</span>
                    <span class="result-value">${this.formatCurrency(costs.increase, currency.code)}/hr</span>
                </div>
            </div>
        `;
        
        // Add validation badge if applicable
        if (validation.validated) {
            html += `
                <div class="validation-badge">
                    <i class="fas fa-check-circle"></i>
                    <span>${validation.message}</span>
                </div>
            `;
        }
        
        // Add confidence intervals
        html += `
            <div class="result-group">
                <div class="result-group-header">
                    <i class="fas fa-chart-line"></i>
                    <h4>Confidence Intervals</h4>
                </div>
                <div class="result-item">
                    <span class="result-label">Lower Bound:</span>
                    <span class="result-value">${this.formatCurrency(confidence.lower, currency.code)}/hr</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Upper Bound:</span>
                    <span class="result-value">${this.formatCurrency(confidence.upper, currency.code)}/hr</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Confidence Level:</span>
                    <span class="result-value">±${(confidence.interval * 100).toFixed(0)}%</span>
                </div>
            </div>
        `;
        
        // Add physics analysis
        html += `
            <div class="result-group">
                <div class="result-group-header">
                    <i class="fas fa-atom"></i>
                    <h4>Physics Analysis</h4>
                </div>
                <div class="result-item">
                    <span class="result-label">Fouling Increase:</span>
                    <span class="result-value">${(physics.foulingIncrease * 100).toFixed(1)}%</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Speed Reduction Factor:</span>
                    <span class="result-value">${(physics.speedReduction * 100).toFixed(0)}%</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Surface Roughness:</span>
                    <span class="result-value">${(physics.roughness * 1000000).toFixed(0)} μm</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Reynolds Number:</span>
                    <span class="result-value">${(physics.reynolds / 1000000).toFixed(1)}M</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Froude Number:</span>
                    <span class="result-value">${physics.froude.toFixed(3)}</span>
                </div>
            </div>
        `;
        
        // Add fuel and emissions
        html += `
            <div class="result-group">
                <div class="result-group-header">
                    <i class="fas fa-leaf"></i>
                    <h4>Environmental Impact</h4>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional Fuel:</span>
                    <span class="result-value">${fuel.extra.toFixed(2)} kg/hr</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional CO₂:</span>
                    <span class="result-value">${emissions.extra.toFixed(1)} kg/hr</span>
                </div>
            </div>
        `;
        
        // Add annual impact
        html += `
            <div class="result-group">
                <div class="result-group-header">
                    <i class="fas fa-calendar-alt"></i>
                    <h4>Annual Impact (${annual.operatingHours} hrs/year)</h4>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional Fuel Cost:</span>
                    <span class="result-value">${this.formatCurrency(annual.extraCost, currency.code)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional Fuel:</span>
                    <span class="result-value">${annual.extraFuel.toFixed(1)} tonnes</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Additional CO₂:</span>
                    <span class="result-value">${annual.extraCO2.toFixed(1)} tonnes</span>
                </div>
            </div>
        `;
        
        return html;
    }
    
    updateChart(curves) {
        if (!this.chart) {
            this.initializeChart();
        }
        
        this.chart.data.labels = curves.speeds;
        this.chart.data.datasets[0].data = curves.cleanCosts;
        this.chart.data.datasets[1].data = curves.fouledCosts;
        this.chart.data.datasets[2].data = curves.fouledCostsUpper;
        this.chart.data.datasets[3].data = curves.fouledCostsLower;
        this.chart.data.datasets[4].data = curves.co2Emissions;
        
        this.chart.options.scales.y.title.text = `Operating Cost (${curves.currency.symbol}/hr)`;
        
        this.chart.update();
    }
    
    initializeChart() {
        const ctx = document.getElementById('myChart');
        if (!ctx) return;
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Clean Hull (FR0)',
                        data: [],
                        borderColor: 'rgba(30, 77, 120, 1)',
                        backgroundColor: 'rgba(30, 77, 120, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y',
                        borderWidth: 2
                    },
                    {
                        label: 'Fouled Hull',
                        data: [],
                        borderColor: 'rgba(232, 119, 34, 1)',
                        backgroundColor: 'rgba(232, 119, 34, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y',
                        borderWidth: 2
                    },
                    {
                        label: 'Confidence Interval',
                        data: [],
                        borderColor: 'rgba(232, 119, 34, 0.3)',
                        backgroundColor: 'rgba(232, 119, 34, 0.05)',
                        fill: '+1',
                        tension: 0.4,
                        yAxisID: 'y',
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        showLine: true
                    },
                    {
                        label: 'Confidence Lower',
                        data: [],
                        borderColor: 'rgba(232, 119, 34, 0.3)',
                        backgroundColor: 'rgba(232, 119, 34, 0.05)',
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y',
                        borderWidth: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        showLine: true
                    },
                    {
                        label: 'Additional CO₂ Emissions',
                        data: [],
                        borderColor: 'rgba(16, 133, 101, 1)',
                        backgroundColor: 'rgba(16, 133, 101, 0)',
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1',
                        borderDash: [5, 5],
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.dataset.label === 'Confidence Interval' || 
                                    ctx.dataset.label === 'Confidence Lower') {
                                    return null;
                                }
                                if (ctx.dataset.yAxisID === 'y1') {
                                    return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kg/hr`;
                                }
                                return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)}/hr`;
                            }
                        },
                        filter: function(tooltipItem) {
                            return tooltipItem.dataset.label !== 'Confidence Interval' && 
                                   tooltipItem.dataset.label !== 'Confidence Lower';
                        }
                    },
                    legend: {
                        position: 'top',
                        align: 'start',
                        labels: {
                            boxWidth: 12,
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            filter: function(legendItem) {
                                return legendItem.text !== 'Confidence Interval' && 
                                       legendItem.text !== 'Confidence Lower';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Speed (knots)',
                            font: { weight: 'bold' }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(226, 232, 240, 0.6)'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Operating Cost (/hr)',
                            font: { weight: 'bold' }
                        },
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(226, 232, 240, 0.6)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Additional CO₂ (kg/hr)',
                            font: { weight: 'bold' }
                        },
                        beginAtZero: true,
                        grid: {
                            drawOnChartArea: false,
                            color: 'rgba(226, 232, 240, 0.6)'
                        }
                    }
                }
            }
        });
    }
    
    updateFoulingTable(frLevel) {
        // Update active tick on slider
        document.querySelectorAll('.range-tick').forEach(tick => {
            const tickValue = parseInt(tick.getAttribute('data-value'));
            const tickDot = tick.querySelector('.tick-dot');
            
            if (tickValue === frLevel) {
                tickDot.style.backgroundColor = 'var(--primary)';
                tickDot.style.transform = 'scale(1.5)';
            } else {
                tickDot.style.backgroundColor = 'var(--neutral-500)';
                tickDot.style.transform = 'scale(1)';
            }
        });
    }
    
    getCurrentFRLevel() {
        const slider = document.getElementById('frSlider');
        return slider ? parseInt(slider.value) : 2;
    }
    
    formatCurrency(value, currency = 'AUD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            currencyDisplay: 'symbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }
    
    getAuthToken() {
        // Get auth token from localStorage or other storage
        return localStorage.getItem('authToken') || '';
    }
    
    showLoadingState() {
        const calculateBtn = document.getElementById('calculateBtn');
        if (calculateBtn) {
            calculateBtn.disabled = true;
            calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
        }
    }
    
    hideLoadingState() {
        const calculateBtn = document.getElementById('calculateBtn');
        if (calculateBtn) {
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<i class="fas fa-calculator"></i> Calculate';
        }
    }
    
    showError(message) {
        // Show error message to user
        console.error('Calculator error:', message);
        // You can implement a toast notification system here
    }
}

// Initialize the enhanced calculator when the page loads
if (typeof window !== 'undefined') {
    window.EnhancedCalculator = EnhancedCalculator;
    
    // Auto-initialize if calculator container exists
    if (document.getElementById('calculatorContainer') || document.getElementById('myChart')) {
        new EnhancedCalculator();
    }
}

module.exports = EnhancedCalculator;
