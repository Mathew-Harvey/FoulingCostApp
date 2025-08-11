const weatherService = require('../services/weather');

class BFMPGenerator {
    constructor() {
        this.templateVersion = '1.0';
        this.generatedDate = new Date().toISOString().split('T')[0];
    }
    
    generatePlanHtml(bfmpData) {
        if (!bfmpData) {
            throw new Error('BFMP data is required');
        }
        
        const { vessel, revision, operatingProfile, maintenance, riskManagement } = bfmpData;
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Biofouling Management Plan - ${vessel?.name || 'N/A'}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #2c3e50;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .vessel-info {
            background: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #3498db;
            margin-bottom: 20px;
        }
        .section {
            margin-bottom: 25px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .section h3 {
            color: #2c3e50;
            margin-top: 0;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        .data-table th,
        .data-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        .data-table th {
            background-color: #f2f2f2;
            font-weight: bold;
        }
        .risk-level {
            padding: 4px 8px;
            border-radius: 3px;
            color: white;
            font-weight: bold;
        }
        .risk-low { background-color: #27ae60; }
        .risk-medium { background-color: #f39c12; }
        .risk-high { background-color: #e74c3c; }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 0.9em;
            color: #666;
        }
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Biofouling Management Plan</h1>
        <h2>${vessel?.name || 'N/A'}</h2>
        <p>IMO: ${vessel?.imo || 'N/A'} | Generated: ${this.generatedDate}</p>
        <p>Document Version: ${revision?.version || '1.0'} | Revision Date: ${revision?.date || this.generatedDate}</p>
    </div>

    <div class="vessel-info">
        <h3>Vessel Information</h3>
        <table class="data-table">
            <tr><th>Name</th><td>${vessel?.name || 'N/A'}</td></tr>
            <tr><th>IMO Number</th><td>${vessel?.imo || 'N/A'}</td></tr>
            <tr><th>Vessel Type</th><td>${vessel?.type || 'N/A'}</td></tr>
            <tr><th>Length Overall</th><td>${vessel?.length ? vessel.length + ' m' : 'N/A'}</td></tr>
            <tr><th>Beam</th><td>${vessel?.beam ? vessel.beam + ' m' : 'N/A'}</td></tr>
            <tr><th>Draft</th><td>${vessel?.draft ? vessel.draft + ' m' : 'N/A'}</td></tr>
            <tr><th>Gross Tonnage</th><td>${vessel?.grossTonnage ? vessel.grossTonnage + ' GT' : 'N/A'}</td></tr>
            <tr><th>Flag State</th><td>${vessel?.flagState || 'N/A'}</td></tr>
        </table>
    </div>

    <div class="section">
        <h3>1. Operating Profile</h3>
        <table class="data-table">
            <tr><th>Operating Speed</th><td>${operatingProfile?.speed ? operatingProfile.speed + ' knots' : 'N/A'}</td></tr>
            <tr><th>In-Service Period</th><td>${operatingProfile?.inServicePeriod ? operatingProfile.inServicePeriod + ' days' : 'N/A'}</td></tr>
            <tr><th>Trading Routes</th><td>${operatingProfile?.tradingRoutes || 'N/A'}</td></tr>
            <tr><th>Operating Area</th><td>${operatingProfile?.operatingArea || 'N/A'}</td></tr>
            <tr><th>Climate Zones</th><td>${operatingProfile?.climateZones || 'N/A'}</td></tr>
            <tr><th>AFS Suitability</th><td>${operatingProfile?.afsSuitability || 'N/A'}</td></tr>
        </table>
    </div>

    <div class="section">
        <h3>2. Maintenance and Inspection Schedule</h3>
        <table class="data-table">
            <tr><th>Last Hull Cleaning</th><td>${maintenance?.lastCleaning || 'N/A'}</td></tr>
            <tr><th>Next Scheduled Cleaning</th><td>${maintenance?.nextCleaning || 'N/A'}</td></tr>
            <tr><th>Cleaning Method</th><td>${maintenance?.cleaningMethod || 'In-water cleaning'}</td></tr>
            <tr><th>Inspection Frequency</th><td>${maintenance?.inspectionFrequency || 'Quarterly'}</td></tr>
            <tr><th>Responsible Personnel</th><td>${maintenance?.responsiblePersonnel || 'Marine Superintendent'}</td></tr>
            <tr><th>Documentation Requirements</th><td>${maintenance?.documentation || 'Digital photos, condition report'}</td></tr>
        </table>
        
        <h4>Inspection Checklist</h4>
        <ul>
            <li>Visual inspection of hull surfaces</li>
            <li>Assessment of fouling levels (FR0-FR5 scale)</li>
            <li>Photography of representative areas</li>
            <li>Performance monitoring (fuel consumption)</li>
            <li>Water intake inspection</li>
            <li>Propeller and rudder assessment</li>
        </ul>
    </div>

    <div class="section">
        <h3>3. Risk Management</h3>
        <table class="data-table">
            <tr>
                <th>Risk Factor</th>
                <th>Level</th>
                <th>Mitigation Measures</th>
            </tr>
            <tr>
                <td>Biosecurity Risk</td>
                <td><span class="risk-level ${this.getRiskClass(riskManagement?.biosecurityRisk)}">${riskManagement?.biosecurityRisk || 'MEDIUM'}</span></td>
                <td>${riskManagement?.biosecurityMitigation || 'Hull inspections at each port, cleaning before high-risk areas'}</td>
            </tr>
            <tr>
                <td>Performance Impact</td>
                <td><span class="risk-level ${this.getRiskClass(riskManagement?.performanceRisk)}">${riskManagement?.performanceRisk || 'MEDIUM'}</span></td>
                <td>${riskManagement?.performanceMitigation || 'Regular fuel monitoring, predictive cleaning schedule'}</td>
            </tr>
            <tr>
                <td>Compliance Risk</td>
                <td><span class="risk-level ${this.getRiskClass(riskManagement?.complianceRisk)}">${riskManagement?.complianceRisk || 'LOW'}</span></td>
                <td>${riskManagement?.complianceMitigation || 'Maintain BMP records, port state inspection readiness'}</td>
            </tr>
        </table>

        <h4>Emergency Procedures</h4>
        <ol>
            <li><strong>Heavy Fouling Detection:</strong> ${riskManagement?.emergencyHeavyFouling || 'Assess cleaning options, consider emergency dry-docking'}</li>
            <li><strong>Performance Degradation:</strong> ${riskManagement?.emergencyPerformance || 'Monitor fuel consumption, adjust speed profile, schedule cleaning'}</li>
            <li><strong>Port State Inspection:</strong> ${riskManagement?.emergencyInspection || 'Present BMP documentation, provide inspection records'}</li>
        </ol>
    </div>

    <div class="section">
        <h3>4. Monitoring and Record Keeping</h3>
        <p><strong>Fouling Assessment System:</strong> ${bfmpData.monitoringSystem || 'Digital fuel monitoring with predictive analytics'}</p>
        
        <h4>Key Performance Indicators</h4>
        <ul>
            <li>Fuel consumption rate (L/hr) by speed</li>
            <li>Fouling Rating (FR0-FR5 scale)</li>
            <li>Days since last cleaning</li>
            <li>Speed loss at constant power</li>
            <li>Hull roughness measurements (where applicable)</li>
        </ul>

        <h4>Documentation Requirements</h4>
        <ul>
            <li>Daily fuel consumption logs</li>
            <li>Weekly performance analysis reports</li>
            <li>Hull inspection records with photographs</li>
            <li>Cleaning certificates and waste disposal records</li>
            <li>Port inspection reports</li>
        </ul>
    </div>

    <div class="section">
        <h3>5. Training and Competency</h3>
        <table class="data-table">
            <tr><th>Personnel</th><th>Training Requirements</th><th>Frequency</th></tr>
            <tr>
                <td>Master</td>
                <td>BMP implementation, performance monitoring, record keeping</td>
                <td>Annual refresher</td>
            </tr>
            <tr>
                <td>Chief Engineer</td>
                <td>Performance analysis, fuel monitoring, inspection procedures</td>
                <td>Annual refresher</td>
            </tr>
            <tr>
                <td>Deck Officers</td>
                <td>Visual inspection techniques, fouling identification</td>
                <td>Biannual</td>
            </tr>
            <tr>
                <td>Crew</td>
                <td>Basic fouling awareness, safety procedures during inspection</td>
                <td>During vessel familiarization</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h3>6. Review and Updates</h3>
        <p><strong>Review Schedule:</strong> This BMP shall be reviewed annually or following significant operational changes.</p>
        <p><strong>Update Triggers:</strong></p>
        <ul>
            <li>Change in trading patterns or operating areas</li>
            <li>Installation of new anti-fouling systems</li>
            <li>Significant performance degradation events</li>
            <li>Regulatory requirement changes</li>
            <li>Technology upgrades to monitoring systems</li>
        </ul>
        <p><strong>Responsible Officer:</strong> ${bfmpData.responsibleOfficer || 'Marine Superintendent'}</p>
        <p><strong>Approval Authority:</strong> ${bfmpData.approvalAuthority || 'Technical Manager'}</p>
    </div>

    <div class="footer">
        <p>This Biofouling Management Plan has been developed in accordance with IMO Guidelines for the Control and Management of Ships' Biofouling (Resolution MEPC.207(62)).</p>
        <p>Generated by Vessel Fouling Management System on ${this.generatedDate}</p>
        <p>© ${new Date().getFullYear()} - Confidential Document</p>
    </div>
</body>
</html>`;
    }
    
    getRiskClass(riskLevel) {
        const level = (riskLevel || '').toLowerCase();
        if (level === 'low') return 'risk-low';
        if (level === 'high') return 'risk-high';
        return 'risk-medium';
    }
    
    async generateFromVesselData(vessel, recentReadings = [], operationalData = {}) {
        try {
            // Calculate operational statistics
            const avgSpeed = recentReadings.length > 0 ? 
                recentReadings.reduce((sum, r) => sum + r.speed, 0) / recentReadings.length : 
                vessel.eco_speed;
            
            const inServiceDays = vessel.last_clean_date ? 
                Math.floor((new Date() - new Date(vessel.last_clean_date)) / (1000 * 60 * 60 * 24)) : 
                0;
            
            // Determine operating area from readings
            let operatingArea = 'Not specified';
            if (recentReadings.length > 0 && recentReadings[0].latitude && recentReadings[0].longitude) {
                try {
                    operatingArea = await weatherService.reverseGeocode(
                        recentReadings[0].latitude, 
                        recentReadings[0].longitude
                    );
                } catch (error) {
                    console.warn('Could not determine operating area:', error);
                }
            }
            
            // Assess risk levels based on vessel data
            const riskAssessment = this.assessRisks(vessel, inServiceDays, recentReadings);
            
            const bfmpData = {
                vessel: {
                    name: vessel.name,
                    imo: vessel.imo,
                    type: this.getVesselTypeDescription(vessel.vessel_type),
                    length: vessel.length,
                    beam: vessel.beam,
                    draft: vessel.draft,
                    grossTonnage: vessel.gross_tonnage,
                    flagState: operationalData.flagState || 'Not specified'
                },
                revision: {
                    version: operationalData.version || '1.0',
                    date: new Date().toISOString().split('T')[0],
                    author: operationalData.author || 'System Generated'
                },
                operatingProfile: {
                    speed: Math.round(avgSpeed * 10) / 10,
                    inServicePeriod: inServiceDays,
                    tradingRoutes: operationalData.tradingRoutes || 'Regional coastal trading',
                    operatingArea: operatingArea,
                    climateZones: operationalData.climateZones || 'Temperate/Tropical',
                    afsSuitability: operationalData.afsSuitability || 'Yes'
                },
                maintenance: {
                    lastCleaning: vessel.last_clean_date,
                    nextCleaning: vessel.next_clean_date,
                    cleaningMethod: operationalData.cleaningMethod || 'In-water cleaning',
                    inspectionFrequency: operationalData.inspectionFrequency || 'Monthly',
                    responsiblePersonnel: operationalData.responsiblePersonnel || 'Chief Engineer',
                    documentation: operationalData.documentation || 'Digital photos, fuel consumption logs'
                },
                riskManagement: riskAssessment,
                monitoringSystem: 'Automated fuel monitoring with predictive fouling analytics',
                responsibleOfficer: operationalData.responsibleOfficer || 'Marine Superintendent',
                approvalAuthority: operationalData.approvalAuthority || 'Technical Manager'
            };
            
            return bfmpData;
            
        } catch (error) {
            console.error('Error generating BFMP data:', error);
            throw new Error('Failed to generate BFMP data: ' + error.message);
        }
    }
    
    getVesselTypeDescription(vesselType) {
        const types = {
            'tug': 'Tugboat',
            'cruiseShip': 'Cruise Ship',
            'cargo': 'Cargo Vessel',
            'container': 'Container Ship',
            'cruise': 'Cruise Ship',
            'naval': 'Naval Vessel',
            'workboat': 'Work Boat',
            'yacht': 'Motor Yacht',
            'custom': 'Commercial Vessel'
        };
        
        return types[vesselType] || 'Commercial Vessel';
    }
    
    assessRisks(vessel, daysSinceClean, recentReadings) {
        // Biosecurity risk assessment
        let biosecurityRisk = 'LOW';
        if (daysSinceClean > 180) biosecurityRisk = 'HIGH';
        else if (daysSinceClean > 90) biosecurityRisk = 'MEDIUM';
        
        // Performance risk assessment
        let performanceRisk = 'LOW';
        if (recentReadings.length > 0) {
            const avgFuelRate = recentReadings.reduce((sum, r) => sum + r.fuel_rate, 0) / recentReadings.length;
            // Simple heuristic - if fuel consumption is significantly high, increase risk
            if (avgFuelRate > vessel.cost_eco * 1.3) performanceRisk = 'HIGH';
            else if (avgFuelRate > vessel.cost_eco * 1.15) performanceRisk = 'MEDIUM';
        }
        
        // Compliance risk - based on documentation and inspection readiness
        let complianceRisk = 'LOW';
        if (!vessel.last_clean_date || !vessel.imo) complianceRisk = 'MEDIUM';
        
        return {
            biosecurityRisk,
            biosecurityMitigation: 'Regular hull inspections, cleaning before entering sensitive areas, ballast water management compliance',
            performanceRisk,
            performanceMitigation: 'Continuous fuel monitoring, predictive maintenance schedule, speed optimization',
            complianceRisk,
            complianceMitigation: 'Maintain comprehensive BMP records, regular crew training, inspection readiness protocols',
            emergencyHeavyFouling: 'Assess immediate cleaning options, consider emergency dry-docking, notify technical management',
            emergencyPerformance: 'Monitor fuel consumption closely, adjust operational profile, schedule emergency cleaning if required',
            emergencyInspection: 'Present BMP documentation, provide inspection records, ensure crew awareness of procedures'
        };
    }
    
    validateBFMPData(bfmpData) {
        const errors = [];
        
        if (!bfmpData.vessel?.name) errors.push('Vessel name is required');
        if (!bfmpData.vessel?.length) errors.push('Vessel length is required');
        if (!bfmpData.maintenance?.lastCleaning) errors.push('Last cleaning date is required');
        if (!bfmpData.operatingProfile?.speed) errors.push('Operating speed is required');
        
        return errors;
    }
    
    generatePDF(bfmpData) {
        // This would integrate with a PDF library like Puppeteer or PDFKit
        // For now, returning HTML that can be printed to PDF
        const html = this.generatePlanHtml(bfmpData);
        
        return {
            html: html,
            format: 'html',
            note: 'Use browser print to PDF or integrate PDF generation library'
        };
    }
}

module.exports = BFMPGenerator;