const express = require('express');
const auth = require('../auth');
const db = require('../database');
const BFMPGenerator = require('../models/bfmpGenerator');
const AdaptiveFoulingModel = require('../models/adaptiveModel');

const router = express.Router();

// Middleware to check vessel access
const checkVesselAccess = async (req, res, next) => {
    try {
        const vesselId = parseInt(req.params.vesselId);
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

// Generate BFMP for a vessel
router.post('/vessel/:vesselId/generate', auth.middleware(), checkVesselAccess, async (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Get recent readings for operational data
        const recentReadings = db.statements.getRecentReadings.all(req.vesselId);
        
        // Get operational data from request body (optional overrides)
        const operationalData = {
            flagState: req.body.flagState,
            tradingRoutes: req.body.tradingRoutes,
            climateZones: req.body.climateZones,
            afsSuitability: req.body.afsSuitability,
            cleaningMethod: req.body.cleaningMethod,
            inspectionFrequency: req.body.inspectionFrequency,
            responsiblePersonnel: req.body.responsiblePersonnel,
            responsibleOfficer: req.body.responsibleOfficer,
            approvalAuthority: req.body.approvalAuthority,
            version: req.body.version,
            author: req.user.name
        };
        
        const generator = new BFMPGenerator();
        
        // Generate BFMP data
        const bfmpData = await generator.generateFromVesselData(vessel, recentReadings, operationalData);
        
        // Validate the data
        const validationErrors = generator.validateBFMPData(bfmpData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'BFMP data validation failed',
                details: validationErrors
            });
        }
        
        // Generate HTML
        const planHtml = generator.generatePlanHtml(bfmpData);
        
        // Save BFMP data to vessel record
        try {
            db.statements.updateVessel.run(
                vessel.name, vessel.imo, vessel.vessel_type, vessel.length, vessel.beam,
                vessel.draft, vessel.cb, vessel.gross_tonnage, vessel.eco_speed,
                vessel.full_speed, vessel.cost_eco, vessel.cost_full, vessel.displacement,
                vessel.wave_exp, vessel.vessel_category, vessel.last_clean_date,
                vessel.next_clean_date, JSON.stringify(bfmpData), req.vesselId
            );
        } catch (dbError) {
            console.warn('Could not save BFMP data to database:', dbError);
        }
        
        res.json({
            success: true,
            vessel_id: req.vesselId,
            vessel_name: vessel.name,
            html: planHtml,
            data: bfmpData,
            generated_at: new Date().toISOString(),
            reading_count: recentReadings.length
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate BFMP: ' + error.message });
    }
});

// Get existing BFMP for a vessel
router.get('/vessel/:vesselId', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        if (!vessel.bfmp_data) {
            return res.status(404).json({ 
                error: 'No BFMP found for this vessel',
                message: 'Generate a BFMP first using the /generate endpoint'
            });
        }
        
        try {
            const bfmpData = JSON.parse(vessel.bfmp_data);
            const generator = new BFMPGenerator();
            const planHtml = generator.generatePlanHtml(bfmpData);
            
            res.json({
                vessel_id: req.vesselId,
                vessel_name: vessel.name,
                html: planHtml,
                data: bfmpData,
                last_updated: vessel.bfmp_data ? 'Available in database' : null
            });
            
        } catch (parseError) {
            return res.status(500).json({ 
                error: 'Invalid BFMP data in database',
                message: 'Please regenerate the BFMP'
            });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get BFMP: ' + error.message });
    }
});

// Update BFMP data for a vessel
router.put('/vessel/:vesselId', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        const { bfmp_data } = req.body;
        
        if (!bfmp_data) {
            return res.status(400).json({ error: 'bfmp_data is required' });
        }
        
        // Validate BFMP data structure
        const generator = new BFMPGenerator();
        let parsedData;
        
        try {
            parsedData = typeof bfmp_data === 'string' ? JSON.parse(bfmp_data) : bfmp_data;
        } catch (parseError) {
            return res.status(400).json({ error: 'Invalid JSON in bfmp_data' });
        }
        
        const validationErrors = generator.validateBFMPData(parsedData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'BFMP data validation failed',
                details: validationErrors
            });
        }
        
        // Update revision information
        parsedData.revision = {
            ...parsedData.revision,
            date: new Date().toISOString().split('T')[0],
            version: parsedData.revision?.version ? 
                String(parseFloat(parsedData.revision.version) + 0.1) : '1.1',
            author: req.user.name
        };
        
        // Update vessel record
        db.statements.updateVessel.run(
            vessel.name, vessel.imo, vessel.vessel_type, vessel.length, vessel.beam,
            vessel.draft, vessel.cb, vessel.gross_tonnage, vessel.eco_speed,
            vessel.full_speed, vessel.cost_eco, vessel.cost_full, vessel.displacement,
            vessel.wave_exp, vessel.vessel_category, vessel.last_clean_date,
            vessel.next_clean_date, JSON.stringify(parsedData), req.vesselId
        );
        
        // Generate updated HTML
        const planHtml = generator.generatePlanHtml(parsedData);
        
        res.json({
            success: true,
            message: 'BFMP updated successfully',
            vessel_id: req.vesselId,
            html: planHtml,
            data: parsedData,
            updated_at: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to update BFMP: ' + error.message });
    }
});

// Get BFMP template/example
router.get('/template', auth.middleware(), (req, res) => {
    try {
        const generator = new BFMPGenerator();
        
        // Create example BFMP data
        const exampleData = {
            vessel: {
                name: 'Example Vessel',
                imo: '1234567',
                type: 'Cargo Vessel',
                length: 100,
                beam: 18,
                draft: 6,
                grossTonnage: 8000,
                flagState: 'Example Flag State'
            },
            revision: {
                version: '1.0',
                date: new Date().toISOString().split('T')[0],
                author: 'System Template'
            },
            operatingProfile: {
                speed: 12.5,
                inServicePeriod: 45,
                tradingRoutes: 'Regional coastal trading',
                operatingArea: 'North Pacific',
                climateZones: 'Temperate',
                afsSuitability: 'Yes'
            },
            maintenance: {
                lastCleaning: '2024-01-01',
                nextCleaning: '2024-07-01',
                cleaningMethod: 'In-water cleaning',
                inspectionFrequency: 'Monthly',
                responsiblePersonnel: 'Chief Engineer',
                documentation: 'Digital photos, fuel consumption logs'
            },
            riskManagement: {
                biosecurityRisk: 'MEDIUM',
                biosecurityMitigation: 'Regular hull inspections, cleaning before sensitive areas',
                performanceRisk: 'LOW',
                performanceMitigation: 'Continuous fuel monitoring, predictive maintenance',
                complianceRisk: 'LOW',
                complianceMitigation: 'Maintain comprehensive BMP records, regular training'
            },
            monitoringSystem: 'Digital fuel monitoring with predictive analytics',
            responsibleOfficer: 'Marine Superintendent',
            approvalAuthority: 'Technical Manager'
        };
        
        const templateHtml = generator.generatePlanHtml(exampleData);
        
        res.json({
            template_data: exampleData,
            template_html: templateHtml,
            description: 'Example BFMP template - customize for your vessel'
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to get BFMP template: ' + error.message });
    }
});

// Delete BFMP for a vessel
router.delete('/vessel/:vesselId', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Only vessel creator can delete BFMP
        if (vessel.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Only vessel creator can delete BFMP' });
        }
        
        // Clear BFMP data
        db.statements.updateVessel.run(
            vessel.name, vessel.imo, vessel.vessel_type, vessel.length, vessel.beam,
            vessel.draft, vessel.cb, vessel.gross_tonnage, vessel.eco_speed,
            vessel.full_speed, vessel.cost_eco, vessel.cost_full, vessel.displacement,
            vessel.wave_exp, vessel.vessel_category, vessel.last_clean_date,
            vessel.next_clean_date, null, req.vesselId
        );
        
        res.json({
            success: true,
            message: 'BFMP deleted successfully',
            vessel_id: req.vesselId
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete BFMP: ' + error.message });
    }
});

// Export BFMP as PDF (placeholder - would need PDF library integration)
router.get('/vessel/:vesselId/pdf', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        if (!vessel || !vessel.bfmp_data) {
            return res.status(404).json({ error: 'BFMP not found for this vessel' });
        }
        
        const bfmpData = JSON.parse(vessel.bfmp_data);
        const generator = new BFMPGenerator();
        const pdfData = generator.generatePDF(bfmpData);
        
        res.json({
            vessel_id: req.vesselId,
            pdf_data: pdfData,
            message: 'PDF generation available - integrate with PDF library',
            instructions: 'Use the HTML content with Puppeteer or similar to generate PDF'
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to export BFMP as PDF: ' + error.message });
    }
});

module.exports = router;