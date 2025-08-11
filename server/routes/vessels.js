const express = require('express');
const auth = require('../auth');
const db = require('../database');
const FoulingPhysics = require('../models/foulingPhysics');
const AdaptiveFoulingModel = require('../models/adaptiveModel');

const router = express.Router();

// Middleware to check vessel access
const checkVesselAccess = async (req, res, next) => {
    try {
        const vesselId = parseInt(req.params.id);
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

// Get all vessels for the authenticated user
router.get('/', auth.middleware(), (req, res) => {
    try {
        const vessels = db.statements.getVesselsByUser.all(req.user.id);
        
        // Add fouling state information to each vessel
        const vesselsWithState = vessels.map(vessel => {
            try {
                const foulingState = db.statements.getFoulingState.get(vessel.id);
                return {
                    ...vessel,
                    fouling_state: foulingState || null
                };
            } catch (error) {
                console.error(`Error getting fouling state for vessel ${vessel.id}:`, error);
                return vessel;
            }
        });
        
        res.json(vesselsWithState);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vessels: ' + error.message });
    }
});

// Get specific vessel details
router.get('/:id', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const vessel = db.statements.getVesselById.get(req.vesselId);
        
        if (!vessel) {
            return res.status(404).json({ error: 'Vessel not found' });
        }
        
        // Get fouling model state
        const foulingState = db.statements.getFoulingState.get(req.vesselId);
        
        // Get recent readings
        const recentReadings = db.statements.getRecentReadings.all(req.vesselId);
        
        res.json({
            vessel: vessel,
            fouling_state: foulingState,
            recent_readings: recentReadings
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vessel details: ' + error.message });
    }
});

// Create new vessel
router.post('/', auth.middleware(), async (req, res) => {
    try {
        const {
            name, imo, vessel_type, length, beam, draft, cb, gross_tonnage,
            eco_speed, full_speed, cost_eco, cost_full, displacement, wave_exp,
            vessel_category, last_clean_date, next_clean_date
        } = req.body;
        
        // Validate required fields
        if (!name || !length || !beam || !draft || !cb || !eco_speed || !full_speed || 
            !cost_eco || !cost_full || !last_clean_date) {
            return res.status(400).json({ 
                error: 'Missing required fields: name, length, beam, draft, cb, eco_speed, full_speed, cost_eco, cost_full, last_clean_date' 
            });
        }
        
        // Validate vessel data using physics model
        const vesselData = {
            name, imo, vessel_type, length, beam, draft, cb, gross_tonnage,
            eco_speed, full_speed, cost_eco, cost_full, displacement, 
            wave_exp: wave_exp || 4.5, vessel_category, last_clean_date, next_clean_date
        };
        
        const physics = new FoulingPhysics(vesselData);
        const validationErrors = physics.validateVesselData();
        
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Vessel data validation failed',
                details: validationErrors 
            });
        }
        
        // Validate dates
        const lastClean = new Date(last_clean_date);
        const nextClean = next_clean_date ? new Date(next_clean_date) : null;
        
        if (isNaN(lastClean.getTime())) {
            return res.status(400).json({ error: 'Invalid last_clean_date' });
        }
        
        if (nextClean && nextClean <= lastClean) {
            return res.status(400).json({ error: 'next_clean_date must be after last_clean_date' });
        }
        
        // Create vessel with model in transaction
        const vesselId = db.createVesselWithModel(vesselData, req.user.id);
        
        // Initialize adaptive model with physics parameters
        const vessel = db.statements.getVesselById.get(vesselId);
        const adaptiveModel = new AdaptiveFoulingModel(vessel);
        
        res.status(201).json({
            id: vesselId,
            message: 'Vessel created successfully',
            vessel: vessel
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to create vessel: ' + error.message });
    }
});

// Update vessel
router.put('/:id', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const {
            name, imo, vessel_type, length, beam, draft, cb, gross_tonnage,
            eco_speed, full_speed, cost_eco, cost_full, displacement, wave_exp,
            vessel_category, last_clean_date, next_clean_date, bfmp_data
        } = req.body;
        
        // Validate vessel data if physics parameters are being updated
        if (length || beam || draft || cb || eco_speed || full_speed || cost_eco || cost_full) {
            const currentVessel = db.statements.getVesselById.get(req.vesselId);
            
            const updatedVessel = {
                ...currentVessel,
                name: name || currentVessel.name,
                length: length || currentVessel.length,
                beam: beam || currentVessel.beam,
                draft: draft || currentVessel.draft,
                cb: cb || currentVessel.cb,
                eco_speed: eco_speed || currentVessel.eco_speed,
                full_speed: full_speed || currentVessel.full_speed,
                cost_eco: cost_eco || currentVessel.cost_eco,
                cost_full: cost_full || currentVessel.cost_full
            };
            
            const physics = new FoulingPhysics(updatedVessel);
            const validationErrors = physics.validateVesselData();
            
            if (validationErrors.length > 0) {
                return res.status(400).json({ 
                    error: 'Vessel data validation failed',
                    details: validationErrors 
                });
            }
        }
        
        // Validate dates if provided
        if (last_clean_date) {
            const lastClean = new Date(last_clean_date);
            if (isNaN(lastClean.getTime())) {
                return res.status(400).json({ error: 'Invalid last_clean_date' });
            }
        }
        
        if (next_clean_date) {
            const nextClean = new Date(next_clean_date);
            if (isNaN(nextClean.getTime())) {
                return res.status(400).json({ error: 'Invalid next_clean_date' });
            }
        }
        
        // Update vessel
        db.statements.updateVessel.run(
            name, imo, vessel_type, length, beam, draft, cb, gross_tonnage,
            eco_speed, full_speed, cost_eco, cost_full, displacement, wave_exp,
            vessel_category, last_clean_date, next_clean_date, bfmp_data,
            req.vesselId
        );
        
        // If last_clean_date was updated, reset the fouling model
        if (last_clean_date) {
            const vessel = db.statements.getVesselById.get(req.vesselId);
            const adaptiveModel = new AdaptiveFoulingModel(vessel);
            // This will recalculate days_since_clean and reset model state
        }
        
        const updatedVessel = db.statements.getVesselById.get(req.vesselId);
        
        res.json({
            message: 'Vessel updated successfully',
            vessel: updatedVessel
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to update vessel: ' + error.message });
    }
});

// Delete vessel
router.delete('/:id', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        // Check if user is the creator (only creators can delete)
        const vessel = db.statements.getVesselById.get(req.vesselId);
        
        if (vessel.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Only the vessel creator can delete it' });
        }
        
        db.statements.deleteVessel.run(req.vesselId);
        
        res.json({ message: 'Vessel deleted successfully' });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete vessel: ' + error.message });
    }
});

// Invite user to vessel
router.post('/:id/invite', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Find user by email
        const invitedUser = db.statements.getUserByEmail.get(email);
        
        if (!invitedUser) {
            return res.status(404).json({ error: 'User not found with this email' });
        }
        
        // Check if user already has access
        const existingAccess = db.statements.checkVesselAccess.all(invitedUser.id, req.vesselId);
        
        if (existingAccess.length > 0) {
            return res.status(400).json({ error: 'User already has access to this vessel' });
        }
        
        // Add vessel access
        db.statements.addVesselAccess.run(invitedUser.id, req.vesselId, req.user.id);
        
        res.json({
            message: 'User invited successfully',
            invited_user: {
                id: invitedUser.id,
                email: invitedUser.email,
                name: invitedUser.name
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to invite user: ' + error.message });
    }
});

// Remove user access from vessel
router.delete('/:id/access/:userId', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const userIdToRemove = parseInt(req.params.userId);
        const vessel = db.statements.getVesselById.get(req.vesselId);
        
        // Only vessel creator can remove access, or users can remove themselves
        if (vessel.created_by !== req.user.id && userIdToRemove !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Cannot remove creator's access
        if (userIdToRemove === vessel.created_by) {
            return res.status(400).json({ error: 'Cannot remove creator access' });
        }
        
        db.statements.removeVesselAccess.run(userIdToRemove, req.vesselId);
        
        res.json({ message: 'Access removed successfully' });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove access: ' + error.message });
    }
});

// Get vessel users
router.get('/:id/users', auth.middleware(), checkVesselAccess, (req, res) => {
    try {
        const users = db.db.prepare(`
            SELECT u.id, u.email, u.name, va.joined_at, 
                   CASE WHEN v.created_by = u.id THEN 1 ELSE 0 END as is_creator
            FROM vessel_access va
            JOIN users u ON va.user_id = u.id
            JOIN vessels v ON va.vessel_id = v.id
            WHERE va.vessel_id = ?
            ORDER BY is_creator DESC, va.joined_at ASC
        `).all(req.vesselId);
        
        res.json(users);
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vessel users: ' + error.message });
    }
});

module.exports = router;