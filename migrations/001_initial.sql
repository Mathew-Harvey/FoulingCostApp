-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    notification_preference TEXT DEFAULT 'SMS', -- SMS, WEB, EMAIL
    notification_interval INTEGER DEFAULT 6, -- hours: 4, 6, 8, or 12
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vessels table (stores all params from existing calculator)
CREATE TABLE vessels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    imo TEXT,
    created_by INTEGER NOT NULL,
    vessel_type TEXT, -- 'tug', 'cruiseShip', 'custom'
   
    -- Core vessel parameters from calculator
    length REAL,
    beam REAL,
    draft REAL,
    cb REAL, -- block coefficient
    gross_tonnage REAL,
   
    -- Speed and cost parameters
    eco_speed REAL,
    full_speed REAL,
    cost_eco REAL,
    cost_full REAL,
   
    -- Additional parameters for custom vessels
    displacement REAL,
    wave_exp REAL DEFAULT 4.5,
    vessel_category TEXT, -- cargo, container, cruise, naval, workboat, yacht
   
    -- Maintenance dates
    last_clean_date DATE NOT NULL,
    next_clean_date DATE,
   
    -- BFMP data (JSON)
    bfmp_data TEXT,
   
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- User access to vessels
CREATE TABLE vessel_access (
    user_id INTEGER NOT NULL,
    vessel_id INTEGER NOT NULL,
    invited_by INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, vessel_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (vessel_id) REFERENCES vessels(id),
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- Fuel consumption readings
CREATE TABLE fuel_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    timestamp DATETIME NOT NULL UNIQUE ON CONFLICT FAIL, -- Prevent duplicates
    fuel_rate REAL NOT NULL, -- L/hr or $/hr
    fuel_unit TEXT NOT NULL, -- 'L/hr' or '$/hr'
    currency TEXT DEFAULT 'AUD', -- AUD, USD, GBP
    speed REAL NOT NULL, -- knots
    weather_condition TEXT NOT NULL, -- 'calm', 'moderate', 'rough', 'storm'
    latitude REAL,
    longitude REAL,
    synced BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vessel_id) REFERENCES vessels(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Fouling model state
CREATE TABLE fouling_models (
    vessel_id INTEGER PRIMARY KEY,
    -- Physics model parameters
    base_alpha REAL,
    base_beta REAL,
   
    -- Learned corrections
    correction_factor REAL DEFAULT 1.0,
    fouling_accumulation_rate REAL DEFAULT 1.0,
   
    -- Current estimated state
    estimated_fr_level INTEGER DEFAULT 0, -- 0-5 scale
    -- days_since_clean is calculated dynamically via VIEW below
   
    -- Model confidence and training
    confidence_score REAL DEFAULT 0.0,
    training_data_count INTEGER DEFAULT 0,
    last_updated DATETIME,
   
    FOREIGN KEY (vessel_id) REFERENCES vessels(id)
);

-- View for dynamic days_since_clean
CREATE VIEW vessel_fouling_state AS
SELECT 
    fm.*,
    JULIANDAY(CURRENT_DATE) - JULIANDAY(v.last_clean_date) AS days_since_clean
FROM fouling_models fm
JOIN vessels v ON fm.vessel_id = v.id;

-- Predictions and recommendations
CREATE TABLE predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id INTEGER NOT NULL,
    timestamp DATETIME NOT NULL,
    speed REAL NOT NULL,
    predicted_fuel_rate REAL NOT NULL,
    predicted_fr_level INTEGER,
    confidence REAL,
    actual_fuel_rate REAL, -- filled when reading comes in
    error_percentage REAL, -- calculated after actual reading
    weather_condition TEXT, -- Align with readings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vessel_id) REFERENCES vessels(id)
);

-- Notification schedule
CREATE TABLE notification_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    vessel_id INTEGER NOT NULL,
    next_notification DATETIME NOT NULL,
    last_notification DATETIME,
    last_response DATETIME,
    missed_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (vessel_id) REFERENCES vessels(id)
);

-- Indexes for performance
CREATE INDEX idx_fuel_readings_vessel_id ON fuel_readings(vessel_id);
CREATE INDEX idx_fuel_readings_timestamp ON fuel_readings(timestamp);
CREATE INDEX idx_predictions_vessel_id ON predictions(vessel_id);
CREATE INDEX idx_vessel_access_user_id ON vessel_access(user_id);
CREATE INDEX idx_vessels_created_by ON vessels(created_by);

-- Trigger for normalizing fuel_rate to L/hr (assuming conversion factor; adjust as needed)
CREATE TRIGGER normalize_fuel AFTER INSERT ON fuel_readings
BEGIN
    UPDATE fuel_readings 
    SET fuel_rate = fuel_rate / 2.5, fuel_unit = 'L/hr' 
    WHERE fuel_unit = '$/hr' AND id = NEW.id;
END;