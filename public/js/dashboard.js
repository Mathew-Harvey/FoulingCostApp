// Dashboard module
class Dashboard {
    static init(user) {
        this.currentUser = user;
        this.currentVessel = null;
        this.charts = {};
        this.refreshInterval = null;
        
        this.bindEvents();
        this.loadVessels();
        this.startAutoRefresh();
    }
    
    static bindEvents() {
        // Vessel selector
        const vesselSelector = document.getElementById('vessel-selector');
        if (vesselSelector) {
            vesselSelector.addEventListener('change', this.handleVesselChange.bind(this));
        }
        
        // Add vessel buttons
        const addVesselBtn = document.getElementById('add-vessel-btn');
        const addFirstVesselBtn = document.getElementById('add-first-vessel-btn');
        
        if (addVesselBtn) {
            addVesselBtn.addEventListener('click', this.showVesselModal.bind(this));
        }
        
        if (addFirstVesselBtn) {
            addFirstVesselBtn.addEventListener('click', this.showVesselModal.bind(this));
        }
        
        // Modal events
        this.bindModalEvents();
        
        // Fuel entry form
        const fuelForm = document.getElementById('fuel-entry-form');
        if (fuelForm) {
            fuelForm.addEventListener('submit', this.handleFuelEntry.bind(this));
        }
    }
    
    static bindModalEvents() {
        const modal = document.getElementById('vessel-modal');
        const closeBtn = modal?.querySelector('.modal-close');
        const cancelBtn = modal?.querySelector('.modal-cancel');
        const form = document.getElementById('vessel-form');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', this.hideVesselModal.bind(this));
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.hideVesselModal.bind(this));
        }
        
        if (form) {
            form.addEventListener('submit', this.handleVesselSubmit.bind(this));
        }
        
        // Close modal on backdrop click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideVesselModal();
                }
            });
        }
    }
    
    static async loadVessels() {
        try {
            const vessels = await ApiClient.get('/vessels');
            this.populateVesselSelector(vessels);
            
            if (vessels.length === 0) {
                this.showNoVesselState();
            } else {
                // Try to select previously selected vessel or first vessel
                const savedVesselId = localStorage.getItem(STORAGE_KEYS.SELECTED_VESSEL);
                const targetVessel = savedVesselId ? 
                    vessels.find(v => v.id == savedVesselId) : vessels[0];
                
                if (targetVessel) {
                    this.selectVessel(targetVessel.id);
                }
            }
            
        } catch (error) {
            console.error('Failed to load vessels:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to load vessels';
            if (error.status === 401) {
                errorMessage = 'Authentication required';
            } else if (error.error) {
                errorMessage = error.error;
            }
            
            Toast.error(errorMessage);
            this.showNoVesselState();
        }
    }
    
    static populateVesselSelector(vessels) {
        const selector = document.getElementById('vessel-selector');
        if (!selector) return;
        
        // Clear existing options
        selector.innerHTML = '<option value="">Select Vessel...</option>';
        
        vessels.forEach(vessel => {
            const option = document.createElement('option');
            option.value = vessel.id;
            option.textContent = vessel.name;
            selector.appendChild(option);
        });
    }
    
    static handleVesselChange(event) {
        const vesselId = parseInt(event.target.value);
        if (vesselId) {
            this.selectVessel(vesselId);
        } else {
            this.showNoVesselState();
        }
    }
    
    static async selectVessel(vesselId) {
        LoadingManager.show('Loading vessel data...');
        
        try {
            // Get vessel details
            const vesselData = await ApiClient.get(`/vessels/${vesselId}`);
            
            this.currentVessel = vesselData.vessel;
            localStorage.setItem(STORAGE_KEYS.SELECTED_VESSEL, vesselId);
            
            // Update selector
            const selector = document.getElementById('vessel-selector');
            if (selector) {
                selector.value = vesselId;
            }
            
            // Show dashboard content
            this.showDashboardContent();
            
            // Load all vessel data
            await this.loadVesselDashboard();
            
        } catch (error) {
            console.error('Failed to load vessel:', error);
            Toast.error('Failed to load vessel data');
        } finally {
            LoadingManager.hide();
        }
    }
    
    static showNoVesselState() {
        const noVessel = document.getElementById('no-vessel-selected');
        const dashboardContent = document.getElementById('dashboard-content');
        
        if (noVessel && dashboardContent) {
            noVessel.style.display = 'block';
            dashboardContent.classList.remove('active');
        }
        
        this.currentVessel = null;
        localStorage.removeItem(STORAGE_KEYS.SELECTED_VESSEL);
    }
    
    static showDashboardContent() {
        const noVessel = document.getElementById('no-vessel-selected');
        const dashboardContent = document.getElementById('dashboard-content');
        
        if (noVessel && dashboardContent) {
            noVessel.style.display = 'none';
            dashboardContent.classList.add('active');
        }
    }
    
    static async loadVesselDashboard() {
        if (!this.currentVessel) return;
        
        const vesselId = this.currentVessel.id;
        
        try {
            // Load data in parallel
            const [predictions, recommendations, emissions, trends] = await Promise.all([
                ApiClient.get(`/predictions/vessel/${vesselId}`),
                ApiClient.get(`/predictions/vessel/${vesselId}/recommendations`),
                ApiClient.get(`/predictions/vessel/${vesselId}/emissions`),
                ApiClient.get(`/readings/vessel/${vesselId}/trends?days=30`)
            ]);
            
            // Update dashboard sections
            this.updateStatusSection(recommendations, predictions.model_statistics);
            this.updateChartsSection(trends, predictions.current_predictions);
            this.updateRecommendationsSection(recommendations, emissions);
            this.updateMetricsSection(recommendations, emissions);
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to load dashboard data';
            if (error.status === 404) {
                errorMessage = 'Vessel not found';
            } else if (error.status === 403) {
                errorMessage = 'Access denied to this vessel';
            } else if (error.status === 400 && error.missing_fields) {
                errorMessage = `Vessel missing required data: ${error.missing_fields.join(', ')}`;
            } else if (error.error) {
                errorMessage = error.error;
            }
            
            Toast.error(errorMessage);
        }
    }
    
    static updateStatusSection(recommendations, modelStats) {
        // Update fouling gauge
        const gaugeCanvas = document.getElementById('foulingGauge');
        if (gaugeCanvas) {
            FoulingGauge.draw(
                gaugeCanvas, 
                recommendations.currentFRLevel || 0, 
                recommendations.confidence || 0
            );
        }
        
        // Update status metrics
        document.getElementById('current-fr').textContent = recommendations.currentFRLevel || 0;
        document.getElementById('days-since-clean').textContent = recommendations.daysSinceClean || 0;
        document.getElementById('next-clean-date').textContent = 
            DateUtils.formatDate(this.currentVessel.next_clean_date) || 'Not scheduled';
        document.getElementById('model-confidence').textContent = 
            `${Math.round(recommendations.confidence || 0)}%`;
        
        // Update next notification (would need to get from notifications API)
        document.getElementById('next-notification').textContent = 'In 6 hours'; // Placeholder
    }
    
    static updateChartsSection(trends, speedCurve) {
        this.createFuelTrendChart(trends.trends);
        this.createCostImpactChart(speedCurve);
    }
    
    static createFuelTrendChart(trendsData) {
        const canvas = document.getElementById('fuelTrendChart');
        if (!canvas) return;
        
        // Destroy existing chart
        if (this.charts.fuelTrend) {
            this.charts.fuelTrend.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        const colors = ChartUtils.getDefaultColors();
        
        // Check if we have actual trend data
        if (!trendsData || trendsData.length === 0) {
            // No data available - show placeholder chart
            const data = {
                labels: ['No Data'],
                datasets: [
                    {
                        label: 'No Fuel Readings',
                        data: [0],
                        borderColor: colors[0],
                        backgroundColor: colors[0] + '20',
                        fill: false,
                        tension: 0.4
                    }
                ]
            };
            
            this.charts.fuelTrend = new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    ...ChartUtils.getChartOptions(),
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: 'Fuel Rate (L/hr)'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: () => 'No fuel data recorded yet',
                                label: () => 'Record fuel data to see trends'
                            }
                        }
                    }
                }
            });
            return;
        }
        
        const data = {
            labels: trendsData.map(t => DateUtils.formatDate(t.date)),
            datasets: [
                {
                    label: 'Predicted Fuel Rate',
                    data: trendsData.map(t => t.avg_predicted || 0),
                    borderColor: colors[0],
                    backgroundColor: colors[0] + '20',
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Actual Fuel Rate',
                    data: trendsData.map(t => t.avg_actual || null),
                    borderColor: colors[1],
                    backgroundColor: colors[1] + '20',
                    fill: false,
                    tension: 0.4
                }
            ]
        };
        
        this.charts.fuelTrend = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                ...ChartUtils.getChartOptions(),
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Fuel Rate (L/hr)'
                        }
                    }
                }
            }
        });
    }
    
    static createCostImpactChart(speedCurve) {
        const canvas = document.getElementById('costImpactChart');
        if (!canvas) return;
        
        // Destroy existing chart
        if (this.charts.costImpact) {
            this.charts.costImpact.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        const colors = ChartUtils.getDefaultColors();
        
        // Check if we have speed curve data
        if (!speedCurve || speedCurve.length === 0) {
            // No data available - show placeholder chart
            const data = {
                labels: ['No Data'],
                datasets: [
                    {
                        label: 'No Speed Data',
                        data: [0],
                        borderColor: colors[2],
                        backgroundColor: colors[2] + '20',
                        fill: false,
                        tension: 0.4
                    }
                ]
            };
            
            this.charts.costImpact = new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    ...ChartUtils.getChartOptions(),
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: 'Fuel Rate (L/hr)'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: () => 'No speed curve data available',
                                label: () => 'Vessel data is being processed'
                            }
                        }
                    }
                }
            });
            return;
        }
        
        const data = {
            labels: speedCurve.map(s => `${s.speed} kn`),
            datasets: [
                {
                    label: 'Current Fuel Rate',
                    data: speedCurve.map(s => s.fuelRate),
                    borderColor: colors[2],
                    backgroundColor: colors[2] + '20',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Clean Hull Fuel Rate',
                    data: speedCurve.map(s => s.fuelRate - s.extraFuel),
                    borderColor: colors[0],
                    backgroundColor: colors[0] + '20',
                    fill: false,
                    tension: 0.4,
                    borderDash: [5, 5]
                }
            ]
        };
        
        this.charts.costImpact = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                ...ChartUtils.getChartOptions(),
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Fuel Rate (L/hr)'
                        }
                    }
                }
            }
        });
    }
    
    static updateRecommendationsSection(recommendations, emissions) {
        const content = document.getElementById('recommendation-content');
        if (!content) return;
        
        const currentFR = recommendations.currentFRLevel || 0;
        const daysSinceClean = recommendations.daysSinceClean || 0;
        
        // Calculate if cleaning is recommended based on FR level and days since clean
        let shouldClean = false;
        let urgencyClass = 'status-good';
        let urgencyText = 'Continue Monitoring';
        
        if (currentFR >= 3) {
            shouldClean = true;
            urgencyClass = 'status-danger';
            urgencyText = 'Cleaning Recommended';
        } else if (currentFR >= 2 && daysSinceClean > 90) {
            shouldClean = true;
            urgencyClass = 'status-warning';
            urgencyText = 'Consider Cleaning Soon';
        } else if (daysSinceClean > 180) {
            shouldClean = true;
            urgencyClass = 'status-warning';
            urgencyText = 'Schedule Maintenance';
        }
        
        // Calculate estimated costs
        let extraCostPerDay = 0;
        let annualSavings = 0;
        let daysToBreakeven = 0;
        
        if (currentFR > 0 && this.currentVessel) {
            const costIncrease = Math.pow(1.1, currentFR) - 1;
            const baseCost = this.currentVessel.cost_eco || 100;
            extraCostPerDay = Math.round(baseCost * costIncrease * 24);
            annualSavings = extraCostPerDay * 365;
            
            const cleaningCost = 15000;
            daysToBreakeven = extraCostPerDay > 0 ? Math.ceil(cleaningCost / extraCostPerDay) : 0;
        }
        
        content.innerHTML = `
            <div class="recommendation-status ${urgencyClass}">
                <h4>${urgencyText}</h4>
                <p>Current fouling level: <strong>FR${currentFR}</strong></p>
                <p>Days since cleaning: <strong>${daysSinceClean}</strong></p>
            </div>
            
            ${shouldClean ? `
                <div class="recommendation-details">
                    <h5>Cleaning Analysis</h5>
                    <ul>
                        <li>Extra cost per day: <strong>${NumberUtils.formatCurrency(extraCostPerDay)}</strong></li>
                        <li>ROI period: <strong>${daysToBreakeven} days</strong></li>
                        <li>Annual savings: <strong>${NumberUtils.formatCurrency(annualSavings)}</strong></li>
                        <li>Estimated cleaning cost: <strong>${NumberUtils.formatCurrency(15000)}</strong></li>
                    </ul>
                </div>
            ` : `
                <div class="recommendation-details">
                    <h5>Current Performance</h5>
                    <p>Vessel is operating efficiently. Continue regular monitoring and scheduled maintenance.</p>
                    ${currentFR === 0 ? '<p><strong>Hull is clean - optimal performance.</strong></p>' : ''}
                    ${currentFR === 1 ? '<p><strong>Light fouling detected - monitor closely.</strong></p>' : ''}
                </div>
            `}
        `;
    }
    
    static updateMetricsSection(recommendations, emissions) {
        // Calculate extra cost per day based on current FR level and vessel parameters
        const currentFR = recommendations.currentFRLevel || 0;
        const daysSinceClean = recommendations.daysSinceClean || 0;
        
        // Estimate extra cost per day based on FR level (rough calculation)
        let extraCostPerDay = 0;
        if (currentFR > 0 && this.currentVessel) {
            // Rough estimate: FR1 = 10% increase, FR2 = 20%, FR3 = 40%, etc.
            const costIncrease = Math.pow(1.1, currentFR) - 1;
            const baseCost = this.currentVessel.cost_eco || 100;
            extraCostPerDay = Math.round(baseCost * costIncrease * 24); // 24 hours
        }
        
        // Calculate CO2 impact based on FR level
        let co2Impact = 0;
        if (currentFR > 0) {
            // Rough estimate: 3.16 kg CO2 per kg fuel, assume 0.85 kg/L fuel density
            const fuelDensity = 0.85; // kg/L
            const co2Factor = 3.16; // kg CO2/kg fuel
            const extraFuelPerHour = extraCostPerDay / 24 / 1.92; // Convert cost to fuel (assuming $1.92/L)
            co2Impact = Math.round(extraFuelPerHour * fuelDensity * co2Factor * 24 * 10) / 10; // kg/day
        }
        
        // Calculate annual savings
        const annualSavings = extraCostPerDay * 365;
        
        // Calculate ROI period (assuming $15,000 cleaning cost)
        const cleaningCost = 15000;
        const roiPeriod = extraCostPerDay > 0 ? Math.ceil(cleaningCost / extraCostPerDay) : 0;
        
        document.getElementById('extra-cost-day').textContent = 
            NumberUtils.formatCurrency(extraCostPerDay);
        
        document.getElementById('co2-impact').textContent = 
            `${co2Impact} kg/day`;
        
        document.getElementById('annual-savings').textContent = 
            NumberUtils.formatCurrency(annualSavings);
        
        document.getElementById('roi-period').textContent = 
            `${roiPeriod} days`;
    }
    
    static async handleFuelEntry(event) {
        event.preventDefault();
        
        if (!this.currentVessel) {
            Toast.error('Please select a vessel first');
            return;
        }
        
        const formData = FormUtils.getFormData(event.target);
        const data = {
            vessel_id: this.currentVessel.id,
            speed: formData.speed,
            fuel_rate: formData['fuel-rate'],
            fuel_unit: formData['fuel-unit'] || 'L/hr',
            weather_condition: formData['weather-condition'] || 'moderate'
        };
        
        // Validate data
        if (!data.speed || !data.fuel_rate) {
            Toast.error('Please fill in all required fields');
            return;
        }
        
        LoadingManager.show('Recording fuel data...');
        
        try {
            await ApiClient.post('/readings', data);
            
            Toast.success('Fuel data recorded successfully');
            
            // Clear form
            event.target.reset();
            
            // Refresh dashboard data
            await this.loadVesselDashboard();
            
        } catch (error) {
            console.error('Failed to record fuel data:', error);
            Toast.error(error.message || 'Failed to record fuel data');
        } finally {
            LoadingManager.hide();
        }
    }
    
    static showVesselModal(vessel = null) {
        const modal = document.getElementById('vessel-modal');
        const title = document.getElementById('vessel-modal-title');
        const form = document.getElementById('vessel-form');
        
        if (!modal || !form) return;
        
        // Set title
        if (title) {
            title.textContent = vessel ? 'Edit Vessel' : 'Add New Vessel';
        }
        
        // Clear or populate form
        if (vessel) {
            FormUtils.populateForm(form, vessel);
        } else {
            FormUtils.clearForm(form);
            // Set default dates
            const lastCleanInput = document.getElementById('vessel-last-clean');
            if (lastCleanInput) {
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                lastCleanInput.value = sixMonthsAgo.toISOString().split('T')[0];
            }
        }
        
        modal.classList.add('active');
    }
    
    static hideVesselModal() {
        const modal = document.getElementById('vessel-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    static async handleVesselSubmit(event) {
        event.preventDefault();
        
        const formData = FormUtils.getFormData(event.target);
        const vesselData = {
            name: formData['vessel-name'],
            imo: formData['vessel-imo'],
            vessel_type: formData['vessel-type'],
            vessel_category: formData['vessel-category'],
            length: formData['vessel-length'],
            beam: formData['vessel-beam'],
            draft: formData['vessel-draft'],
            cb: formData['vessel-cb'],
            gross_tonnage: formData['vessel-gt'],
            displacement: formData['vessel-displacement'],
            eco_speed: formData['vessel-eco-speed'],
            full_speed: formData['vessel-full-speed'],
            cost_eco: formData['vessel-cost-eco'],
            cost_full: formData['vessel-cost-full'],
            last_clean_date: formData['vessel-last-clean'],
            next_clean_date: formData['vessel-next-clean']
        };
        
        // Validate data
        const errors = Validators.validateVesselData(vesselData);
        if (errors.length > 0) {
            Toast.error(errors[0]);
            return;
        }
        
        LoadingManager.show('Saving vessel...');
        
        try {
            const response = await ApiClient.post('/vessels', vesselData);
            
            Toast.success('Vessel saved successfully');
            this.hideVesselModal();
            
            // Reload vessels and select new one
            await this.loadVessels();
            this.selectVessel(response.id);
            
        } catch (error) {
            console.error('Failed to save vessel:', error);
            Toast.error(error.message || 'Failed to save vessel');
        } finally {
            LoadingManager.hide();
        }
    }
    
    static startAutoRefresh() {
        // Refresh data every 5 minutes
        this.refreshInterval = setInterval(async () => {
            if (this.currentVessel) {
                await this.loadVesselDashboard();
            }
        }, 5 * 60 * 1000);
    }
    
    static cleanup() {
        // Clean up intervals and charts
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
        
        this.charts = {};
        this.currentVessel = null;
        this.currentUser = null;
    }
}

// Export for global use
window.Dashboard = Dashboard;