const Database = require('better-sqlite3');
const config = require('./config');

class DatabaseManager {
    constructor() {
        try {
            const dbPath = config.database.path;
            console.log('Attempting to connect to database at:', dbPath);
            
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
            
            // Test database connection
            this.db.prepare('SELECT 1').get();
            console.log('Database connected successfully:', dbPath);
        } catch (error) {
            console.error('Failed to connect to database:', error);
            console.error('Database path:', config.database.path);
            throw error;
        }
        
        // Prepare commonly used statements
        this.statements = {};
        
        try {
            this.statements = {
                // Users
                createUser: this.db.prepare(`
                    INSERT INTO users (email, phone, name, password_hash, notification_preference, notification_interval)
                    VALUES (?, ?, ?, ?, ?, ?)
                `),
            getUserByEmail: this.db.prepare('SELECT * FROM users WHERE email = ?'),
            getUserById: this.db.prepare('SELECT * FROM users WHERE id = ?'),
            updateUserPreferences: this.db.prepare(`
                UPDATE users SET notification_preference = ?, notification_interval = ? WHERE id = ?
            `),
            
            // Vessels
            createVessel: this.db.prepare(`
                INSERT INTO vessels (name, imo, created_by, vessel_type, length, beam, draft, cb, gross_tonnage,
                                   eco_speed, full_speed, cost_eco, cost_full, displacement, wave_exp, 
                                   vessel_category, last_clean_date, next_clean_date, bfmp_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            getVesselById: this.db.prepare('SELECT * FROM vessels WHERE id = ?'),
            getVesselsByUser: this.db.prepare(`
                SELECT v.* FROM vessels v
                JOIN vessel_access va ON v.id = va.vessel_id
                WHERE va.user_id = ?
            `),
            updateVessel: this.db.prepare(`
                UPDATE vessels SET name = ?, imo = ?, vessel_type = ?, length = ?, beam = ?, draft = ?, 
                                 cb = ?, gross_tonnage = ?, eco_speed = ?, full_speed = ?, cost_eco = ?, 
                                 cost_full = ?, displacement = ?, wave_exp = ?, vessel_category = ?, 
                                 last_clean_date = ?, next_clean_date = ?, bfmp_data = ?
                WHERE id = ?
            `),
            deleteVessel: this.db.prepare('DELETE FROM vessels WHERE id = ?'),
            
            // Vessel Access
            addVesselAccess: this.db.prepare(`
                INSERT INTO vessel_access (user_id, vessel_id, invited_by) VALUES (?, ?, ?)
            `),
            removeVesselAccess: this.db.prepare(`
                DELETE FROM vessel_access WHERE user_id = ? AND vessel_id = ?
            `),
            checkVesselAccess: this.db.prepare(`
                SELECT 1 FROM vessel_access WHERE user_id = ? AND vessel_id = ?
            `),
            
            // Fuel Readings
            createReading: this.db.prepare(`
                INSERT INTO fuel_readings (vessel_id, user_id, timestamp, fuel_rate, fuel_unit, currency,
                                         speed, weather_condition, latitude, longitude, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            getReadingsByVessel: this.db.prepare(`
                SELECT * FROM fuel_readings WHERE vessel_id = ? ORDER BY timestamp DESC LIMIT ?
            `),
            getRecentReadings: this.db.prepare(`
                SELECT * FROM fuel_readings 
                WHERE vessel_id = ? AND timestamp > datetime('now', '-30 days')
                ORDER BY timestamp DESC
            `),
            
            // Fouling Models
            createFoulingModel: this.db.prepare(`
                INSERT INTO fouling_models (vessel_id, base_alpha, base_beta, correction_factor, 
                                          fouling_accumulation_rate, estimated_fr_level, confidence_score,
                                          training_data_count, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            getFoulingModel: this.db.prepare('SELECT * FROM fouling_models WHERE vessel_id = ?'),
            updateFoulingModel: this.db.prepare(`
                UPDATE fouling_models 
                SET correction_factor = ?, fouling_accumulation_rate = ?, estimated_fr_level = ?,
                    confidence_score = ?, training_data_count = ?, last_updated = ?
                WHERE vessel_id = ?
            `),
            getFoulingState: this.db.prepare(`
                SELECT * FROM vessel_fouling_state WHERE vessel_id = ?
            `),
            
            // Predictions
            createPrediction: this.db.prepare(`
                INSERT INTO predictions (vessel_id, timestamp, speed, predicted_fuel_rate, predicted_fr_level,
                                       confidence, weather_condition)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `),
            updatePredictionActual: this.db.prepare(`
                UPDATE predictions SET actual_fuel_rate = ?, error_percentage = ? WHERE id = ?
            `),
            getPredictionsByVessel: this.db.prepare(`
                SELECT * FROM predictions WHERE vessel_id = ? ORDER BY timestamp DESC LIMIT ?
            `),
            
            // Notifications
            scheduleNotification: this.db.prepare(`
                INSERT OR REPLACE INTO notification_schedule (user_id, vessel_id, next_notification)
                VALUES (?, ?, ?)
            `),
            getNotificationsDue: this.db.prepare(`
                SELECT ns.*, u.name, u.phone, u.email, u.notification_preference, v.name as vessel_name
                FROM notification_schedule ns
                JOIN users u ON ns.user_id = u.id
                JOIN vessels v ON ns.vessel_id = v.id
                WHERE ns.next_notification <= datetime('now')
            `),
            updateNotificationSent: this.db.prepare(`
                UPDATE notification_schedule 
                SET last_notification = ?, next_notification = ?, missed_count = 0
                WHERE id = ?
            `),
            updateNotificationResponse: this.db.prepare(`
                UPDATE notification_schedule SET last_response = ? WHERE user_id = ? AND vessel_id = ?
            `)
        };
        
        console.log('Database statements prepared successfully');
    } catch (error) {
        console.error('Failed to prepare database statements:', error);
        throw error;
    }
}
    
    // Helper methods for common operations
    createUserWithAccess(userData, vesselId) {
        const transaction = this.db.transaction((userData, vesselId) => {
            const result = this.statements.createUser.run(
                userData.email, userData.phone, userData.name, userData.password_hash,
                userData.notification_preference || 'SMS', userData.notification_interval || 6
            );
            
            if (vesselId) {
                this.statements.addVesselAccess.run(result.lastInsertRowid, vesselId, null);
            }
            
            return result;
        });
        
        return transaction(userData, vesselId);
    }
    
    createVesselWithModel(vesselData, userId) {
        const transaction = this.db.transaction((vesselData, userId) => {
            // Create vessel
            const vesselResult = this.statements.createVessel.run(
                vesselData.name, vesselData.imo, userId, vesselData.vessel_type,
                vesselData.length, vesselData.beam, vesselData.draft, vesselData.cb,
                vesselData.gross_tonnage, vesselData.eco_speed, vesselData.full_speed,
                vesselData.cost_eco, vesselData.cost_full, vesselData.displacement,
                vesselData.wave_exp, vesselData.vessel_category, vesselData.last_clean_date,
                vesselData.next_clean_date, vesselData.bfmp_data
            );
            
            const vesselId = vesselResult.lastInsertRowid;
            
            // Add vessel access for creator
            this.statements.addVesselAccess.run(userId, vesselId, null);
            
            // Create fouling model with initial values
            this.statements.createFoulingModel.run(
                vesselId, null, null, 1.0, 1.0, 0, 0.0, 0, new Date().toISOString()
            );
            
            return vesselId;
        });
        
        return transaction(vesselData, userId);
    }
    
    close() {
        this.db.close();
    }
}

module.exports = new DatabaseManager();