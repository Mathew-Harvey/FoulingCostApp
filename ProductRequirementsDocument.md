Final Product Requirements Document: Vessel Fouling & Fuel Prediction Application
Project Overview
A web application that tracks vessel fuel consumption and predicts fouling-related costs by combining physics-based models with machine learning from real-world data. The system reuses existing hull fouling calculator and BFMP generator code, adding data collection and adaptive learning capabilities.
Technology Stack

Backend: Node.js with minimal Express
Frontend: Vanilla JavaScript, HTML, CSS (no frameworks)
Database: SQLite (server and client-side via sql.js for offline)
Existing Code: Hull fouling calculator (summarized below from paste.txt) and BFMP generator (summarized below from paste-2.txt)
External Services: OpenWeatherMap API, Twilio SMS
Additional Libraries:

Backend: express@^4.18.2, sqlite3@^5.1.7, jsonwebtoken@^9.0.2, bcrypt@^5.1.1, twilio@^5.2.2, node-fetch@^2.7.0, node-cron@^3.0.3, better-sqlite3@^10.0.0 (for performance)
Frontend: chart.js@^4.4.3 (for dashboards), sql.js@^1.11.1 (WASM SQLite for client-side offline)


Package.json Snippet (for reproducibility):
json{
  "name": "vessel-fouling-app",
  "version": "1.0.0",
  "main": "server/index.js",
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.7",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "twilio": "^5.2.2",
    "node-fetch": "^2.7.0",
    "node-cron": "^3.0.3",
    "better-sqlite3": "^10.0.0",
    "chart.js": "^4.4.3",
    "sql.js": "^1.11.1"
  },
  "scripts": {
    "start": "node server/index.js"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}


Summary of Existing Code
To ensure self-contained implementation, key functions from paste.txt (Hull Fouling Calculator) and paste-2.txt (BFMP Generator) are summarized here. These must be extracted into separate modules as indicated.
From paste.txt (Hull Fouling Calculator)

Class: FoulingPhysics

Constructor: Takes vessel parameters (length, beam, draft, cb, gross_tonnage, etc.).
solveAlphaBeta(ecoCost, fullCost, ecoSpeed, fullSpeed): Solves for alpha and beta coefficients using physics equations. Returns { alpha, beta }.

Example: Assumes quadratic cost model: cost = alpha * speed^2 + beta.
Edge Case: If speeds are equal, throw error "Speeds must differ".


calculateCostAt(speed, frLevel): Calculates fuel cost at given speed and fouling rating (FR 0-5). Applies fouling multipliers (e.g., FR0: 1.0, FR1: 1.1, ..., FR5: 1.5).

Formula: baseCost * (1 + frLevel * 0.1)
Edge Case: Clamp speed between min/max vessel speeds.




Other Functions: Include any wave resistance calcs using wave_exp.

From paste-2.txt (BFMP Generator)

generatePlanHtml(bfmpData): Takes a JSON object with vessel, revision, operatingProfile, maintenance, riskManagement sections and returns an HTML string formatted as a BFMP document.

Example: Uses template literals to build  sections for each part.
Edge Case: If data missing, use defaults like "N/A".



1. Database Schema
sql-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
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
CREATE INDEX idx_predictions_vessel_id ON predictions(vessel_id);

-- Trigger for normalizing fuel_rate to L/hr (assuming conversion factor; adjust as needed)
CREATE TRIGGER normalize_fuel AFTER INSERT ON fuel_readings
BEGIN
    UPDATE fuel_readings SET fuel_rate = fuel_rate / 2.5 WHERE fuel_unit = '$/hr' AND id = NEW.id; -- Example conversion
    UPDATE fuel_readings SET fuel_unit = 'L/hr' WHERE fuel_unit = '$/hr' AND id = NEW.id;
END;
2. File Structure
textvessel-fouling-app/
├── server/
│   ├── index.js # Express server setup with rate limiting and HTTPS enforcement
│   ├── config.js # Environment config
│   ├── database.js # SQLite connection (using better-sqlite3) and parameterized queries
│   ├── auth.js # JWT authentication with refresh tokens
│   │
│   ├── models/
│   │   ├── foulingPhysics.js # Extracted from paste.txt
│   │   ├── adaptiveModel.js # Learning layer
│   │   └── bfmpGenerator.js # Extracted from paste-2.txt
│   │
│   ├── routes/
│   │   ├── auth.js # Login, signup, password reset
│   │   ├── vessels.js # Vessel CRUD
│   │   ├── readings.js # Fuel data endpoints
│   │   ├── predictions.js # Predictions and trends
│   │   ├── bfmp.js # BFMP management
│   │   └── notifications.js # Notification prefs
│   │
│   └── services/
│       ├── sms.js # Twilio integration with parsing error handling
│       ├── weather.js # OpenWeatherMap with fallback to 'moderate'
│       ├── notifications.js # Scheduler using node-cron
│       └── modelTraining.js # Model update logic with batch retraining
│
├── public/
│   ├── index.html # Login/signup
│   ├── dashboard.html # Dashboard
│   ├── vessel-setup.html # Vessel config
│   ├── calculator.html # What-if calculator
│   ├── bfmp-generator.html # BFMP creation
│   │
│   ├── css/
│   │   ├── main.css # Core styles with media queries for mobile
│   │   ├── calculator.css # Existing
│   │   └── dashboard.css # Dashboard styles
│   │
│   ├── js/
│   │   ├── app.js # Main logic
│   │   ├── auth.js # Auth handling
│   │   ├── calculator.js # Modified existing
│   │   ├── bfmpGenerator.js # Modified existing
│   │   ├── dashboard.js # Charts/UI with real-time updates via setInterval
│   │   ├── dataEntry.js # Fuel input
│   │   ├── offline.js # Offline sync
│   │   └── utils.js # Utilities (e.g., date formatting)
│   │
│   └── service-worker.js # PWA support
│
├── migrations/
│   └── 001_initial.sql # Full schema above
│
└── package.json # As above
3. Core Features Implementation
3.1 User Authentication
javascript// server/routes/auth.js
// Simple JWT-based auth with email/phone and refresh tokens
// POST /api/auth/signup
// Body: { "email": "skipper@vessel.com", "phone": "+61400000000", "name": "John Skipper", "password": "securepassword" }
// Validation: Email/phone unique, password min 8 chars
// Hash with bcrypt, store, return { token, refreshToken, user }

// POST /api/auth/login
// Body: { "email": "skipper@vessel.com", "password": "securepassword" }
// Returns: { token: "jwt_token", refreshToken: "refresh_token", user: {...} }
// Edge Case: Invalid creds -> 401 { error: "Invalid credentials" }

// POST /api/auth/refresh
// Body: { refreshToken }
// Returns new token if valid

// All other endpoints require Authorization: Bearer <token>
3.2 Vessel Setup
javascript// POST /api/vessels
// Body example:
{
  "name": "MV Cargo Ship",
  "imo": "9876543",
  "vessel_type": "custom",
  "length": 93,
  "beam": 16,
  "draft": 5.2,
  "cb": 0.62,
  "gross_tonnage": 5000,
  "eco_speed": 10,
  "full_speed": 13.8,
  "cost_eco": 1600,
  "cost_full": 4200,
  "vessel_category": "cargo",
  "last_clean_date": "2024-10-01",
  "next_clean_date": "2025-04-01"
}
// Validation: last_clean_date < next_clean_date, speeds differ
// Edge Case: Invalid dates -> 400 { error: "Invalid dates" }
3.3 Data Collection Flow
Web Interface
javascript// GET /api/readings/prompt
// Returns: { vessel_id: 1, vessel_name: "MV Cargo Ship", last_reading: "2024-12-01T06:00:00Z", suggested_weather: "moderate", current_location: {lat, long} }
// suggested_weather from OpenWeatherMap if lat/long provided, fallback 'moderate'

// POST /api/readings
// Body: { vessel_id: 1, fuel_rate: 450, fuel_unit: "L/hr", speed: 12.5, weather_condition: "moderate" }
// Edge Case: Offline -> queue in local DB
SMS Interface
javascript// Incoming SMS: "FUEL 450 SPEED 12.5 WEATHER 2"
// Parse with regex; if fail, reply "Invalid format. Try: FUEL [rate] SPEED [knots] WEATHER [0-3]"
// Weather: 0=calm, 1=moderate, 2=rough, 3=storm
// Response: "Recorded: 450L/hr at 12.5kn. Next check in 6hrs. Fouling: FR2 (35% increase). Consider cleaning in 45 days."
// Edge Case: Unknown vessel -> "No vessel associated. Reply with VESSEL [name]"
3.4 Adaptive Model Implementation
javascript// server/models/adaptiveModel.js
class AdaptiveFoulingModel {
    constructor(vessel) {
        this.physics = new FoulingPhysics(vessel);
        const { alpha, beta } = this.physics.solveAlphaBeta(vessel.cost_eco, vessel.cost_full, vessel.eco_speed, vessel.full_speed);
        this.baseAlpha = alpha;
        this.baseBeta = beta;
        this.correctionFactor = 1.0;
        this.foulingRate = 1.0;
        this.daysSinceClean = this.calculateDaysSinceClean(vessel.last_clean_date);
        this.trainingData = []; // Array for batch retraining
        this.confidence = 0.0;
    }

    calculateDaysSinceClean(lastCleanDate) {
        const now = new Date();
        const clean = new Date(lastCleanDate);
        return Math.floor((now - clean) / (1000 * 60 * 60 * 24));
    }

    estimateFRLevel(daysSinceClean) {
        const adjustedDays = daysSinceClean * this.foulingRate;
        if (adjustedDays < 30) return 0;
        if (adjustedDays < 60) return 1;
        if (adjustedDays < 120) return 2;
        if (adjustedDays < 180) return 3;
        if (adjustedDays < 270) return 4;
        return 5;
    }

    predict(speed, weather = 'calm') {
        const frLevel = this.estimateFRLevel(this.daysSinceClean);
        const baseCost = this.physics.calculateCostAt(speed, frLevel);
        const weatherMultiplier = { calm: 1.0, moderate: 1.05, rough: 1.15, storm: 1.30 }[weather];
        return baseCost * this.correctionFactor * weatherMultiplier;
    }

    updateFromReading(actualFuelRate, speed, weather) {
        if (actualFuelRate === 0) return; // Edge: Avoid div by zero
        const predicted = this.predict(speed, weather);
        const error = (actualFuelRate - predicted) / predicted;
        const learningRate = 0.1;
        this.correctionFactor = Math.max(0.5, Math.min(2.0, this.correctionFactor * (1 - learningRate) + (actualFuelRate / predicted) * learningRate)); // Cap
        this.updateConfidence(Math.abs(error));
        this.storeTrainingData(actualFuelRate, speed, weather, predicted);
        if (this.shouldRetrain()) this.retrainModel();
    }

    updateConfidence(error) {
        this.confidence = Math.max(0, Math.min(100, this.confidence + (0.05 - error) * 10)); // Simple adjustment
    }

    storeTrainingData(actual, speed, weather, predicted) {
        this.trainingData.push({ actual, speed, weather, predicted });
        if (this.trainingData.length > 100) this.trainingData.shift(); // Keep last 100
    }

    shouldRetrain() {
        return this.trainingData.length % 10 === 0; // Every 10 new readings
    }

    retrainModel() {
        // Simple linear regression on errors to update foulingRate
        // Use least-squares: Assume foulingRate = sum((actual/predicted) / days) / n
        let sum = 0;
        this.trainingData.forEach(d => sum += (d.actual / d.predicted) / this.daysSinceClean);
        this.foulingRate = sum / this.trainingData.length || 1.0;
    }

    calculateExtraCostPerDay() {
        const base = this.predict(this.physics.vessel.eco_speed, 'calm') / this.correctionFactor; // Clean state
        const current = this.predict(this.physics.vessel.eco_speed, 'calm');
        return (current - base) * 24; // Per day
    }

    recommendCleaning() {
        const currentExtraCost = this.calculateExtraCostPerDay();
        const cleaningCost = 15000;
        const daysToBreakeven = cleaningCost / currentExtraCost;
        return {
            recommended: daysToBreakeven < 60,
            daysToBreakeven,
            estimatedSavings: currentExtraCost * 365,
            currentFRLevel: this.estimateFRLevel(this.daysSinceClean)
        };
    }
}
3.5 Dashboard Components
javascript// public/js/dashboard.js
class FoulingDashboard {
    constructor(vesselId) {
        this.vesselId = vesselId;
        this.charts = {};
        this.initializeCharts();
        this.loadData();
        this.startAutoRefresh();
    }

    initializeCharts() {
        // Fuel trend chart using Chart.js
        this.charts.fuelTrend = new Chart(document.getElementById('fuelTrendChart'), {
            type: 'line',
            data: { datasets: [ /* as in original */ ] },
            options: { scales: { y: { beginAtZero: true } }, responsive: true }
        });

        // Fouling gauge: Pure CSS or Canvas
        this.createFoulingGauge = () => {
            const canvas = document.getElementById('foulingGauge');
            const ctx = canvas.getContext('2d');
            // Draw semi-circle gauge
            // Colors: green (0-1), yellow (2-3), red (4-5)
            // Example: ctx.arc(...) with fill based on level
        };

        // Similar for costImpact and emissions charts
    }

    async loadData() {
        try {
            const response = await fetch(`/api/predictions/${this.vesselId}`, { headers: { Authorization: `Bearer ${localStorage.token}` } });
            if (!response.ok) throw new Error('Fetch failed');
            const data = await response.json();
            this.updateCharts(data);
            this.updateMetrics(data);
            this.updateRecommendations(data);
        } catch (e) {
            console.error(e); // Handle offline or errors
        }
    }

    startAutoRefresh() {
        setInterval(() => this.loadData(), 60000); // Every minute
    }

    updateMetrics(data) {
        // As in original
        // Edge: If data.null, show "N/A"
    }
}
3.6 Offline Support
javascript// public/js/offline.js
class OfflineSync {
    constructor() {
        this.db = this.initLocalDB();
        this.syncQueue = [];
    }

    initLocalDB() {
        const db = new SQL.Database();
        db.run(`CREATE TABLE IF NOT EXISTS offline_readings (
            id INTEGER PRIMARY KEY,
            vessel_id INTEGER,
            fuel_rate REAL,
            speed REAL,
            weather TEXT,
            timestamp TEXT,
            synced INTEGER DEFAULT 0
        )`);
        return db;
    }

    saveReading(data) {
        this.db.run(`INSERT INTO offline_readings (vessel_id, fuel_rate, speed, weather, timestamp) VALUES (?, ?, ?, ?, ?)`,
            [data.vessel_id, data.fuel_rate, data.speed, data.weather, new Date().toISOString()]);
        this.attemptSync();
    }

    async attemptSync() {
        if (!navigator.onLine) return;
        const unsynced = this.db.exec("SELECT * FROM offline_readings WHERE synced = 0")[0]?.values || [];
        for (const reading of unsynced) {
            try {
                await fetch('/api/readings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.token}` },
                    body: JSON.stringify({
                        vessel_id: reading[1],
                        fuel_rate: reading[2],
                        speed: reading[3],
                        weather_condition: reading[4],
                        timestamp: reading[5]
                    })
                });
                this.db.run("UPDATE offline_readings SET synced = 1 WHERE id = ?", [reading[0]]);
            } catch (error) {
                console.error('Sync failed:', error);
            }
        }
        // Handle conflicts: If server timestamp newer, discard local
    }
}

// service-worker.js as in original, add event listeners for fetch caching
3.7 BFMP Integration
javascript// server/routes/bfmp.js
const router = require('express').Router();

router.post('/vessels/:id/bfmp/generate', async (req, res) => {
    const vessel = await db.getVessel(req.params.id);
    const readings = await db.getRecentReadings(req.params.id, 30);
    
    // Calculate profile
    const operatingProfile = {
        speed: readings.reduce((sum, r) => sum + r.speed, 0) / readings.length || vessel.eco_speed,
        inServicePeriod: calculateDaysSinceClean(vessel.last_clean_date),
        tradingRoutes: 'Auto-generated from vessel data',
        operatingArea: readings[0]?.latitude ? await reverseGeocode(readings[0].latitude, readings[0].longitude) : 'Not specified', // Use API if needed
        climateZones: 'Temperate/Tropical',
        afsSuitability: 'Yes'
    };
    
    const model = new AdaptiveFoulingModel(vessel);
    const rec = model.recommendCleaning();
    
    const bfmpData = { /* as in original */ };
    
    const planHtml = generatePlanHtml(bfmpData); // From existing
    
    await db.updateVessel(req.params.id, { bfmp_data: JSON.stringify(bfmpData) });
    
    res.json({ success: true, html: planHtml, data: bfmpData });
});

// Edge Case: No readings -> use defaults
4. API Endpoints
All endpoints (except auth/signup/login) require JWT. Error format: { error: "message", code: XXX }

Authentication

POST /api/auth/signup - Create account. Response: { token, refreshToken, user }
POST /api/auth/login - Login. Response: { token, refreshToken, user }
POST /api/auth/logout - Logout (invalidate refresh)
POST /api/auth/reset-password - Reset password
POST /api/auth/refresh - Refresh token


Vessels

GET /api/vessels - List vessels. Response: [{ id, name, ... }]
POST /api/vessels - Create. Response: { id, ... }
GET /api/vessels/:id - Details incl. fouling state. Response: { vessel: {...}, model: {...} }
PUT /api/vessels/:id - Update
DELETE /api/vessels/:id - Delete
POST /api/vessels/:id/invite - Invite user


Data Collection

GET /api/readings/prompt - Prompt. Response: { ... as above }
POST /api/readings - Submit. Response: { success: true }
GET /api/vessels/:id/readings - Readings. Response: [{ ... }]
POST /api/readings/sms - SMS webhook


Predictions & Analytics

GET /api/vessels/:id/predictions - Predictions. Response: [{ ... }]
GET /api/vessels/:id/trends - Trends. Response: { data: [...] }
GET /api/vessels/:id/recommendations - Recs. Response: { recommended: bool, ... }
GET /api/vessels/:id/emissions - Emissions (calc from fuel * factor). Response: { daily: X }


BFMP

POST /api/vessels/:id/bfmp/generate - Generate. Response: { html, data }
GET /api/vessels/:id/bfmp - Get. Response: { data }
PUT /api/vessels/:id/bfmp - Update


Notifications

GET /api/notifications/preferences - Get
PUT /api/notifications/preferences - Update
POST /api/notifications/test - Test send



5. User Interface Screens
5.1 Login/Signup

Form: Email/phone, password, "Remember me" (localStorage token)
Reset link opens modal
Navigation: Top bar with logo, links to Dashboard/Vessels/Calculator/BFMP (post-login)

5.2 Dashboard (Main Screen)
text┌─────────────────────────────────────┐
│ Vessel: MV Cargo Ship [Switch ▼] │
├─────────────────────────────────────┤
│ Current Status │
│ ┌──────────┐ Days Since: 45 │
│ │ FR2 │ Next Clean: 135 days │
│ │ Gauge │ Confidence: 87% │
│ └──────────┘ Next Check: 4:23 │
├─────────────────────────────────────┤
│ [Enter Fuel Reading] │
├─────────────────────────────────────┤
│ Fuel Trend (Predicted vs Actual) │
│ [────────── Chart ──────────] │
├─────────────────────────────────────┤
│ Cost Impact │ CO2 Emissions │
│ +$420/day │ +165 kg/day │
├─────────────────────────────────────┤
│ Cleaning ROI Calculator │
│ Break-even: 36 days │
│ Annual Savings: $45,000 │
│ [Schedule Cleaning] │
└─────────────────────────────────────┘

HTML: Use <canvas>...</canvas>
Mobile: Stack vertically via @media (max-width: 768px)

5.3 Data Entry Screen
text┌─────────────────────────────────────┐
│ Enter Fuel Reading │
├─────────────────────────────────────┤
│ Current Speed: [___12.5___] knots │
│ │
│ Fuel Rate: [____450____] ○ L/hr │
│ ● $/hr │
│ │
│ Weather: ○ Calm │
│ ● Moderate │
│ ○ Rough │
│ ○ Storm │
│ │
│ [Submit] [Skip This Check] │
└─────────────────────────────────────┘

Form with IDs for elements, submit via fetch

5.4 Vessel Setup

Reuse calculator interface
Add date pickers for clean dates
Button: "Generate BFMP" calls API

5.5 What-If Calculator

Existing, add "Apply to Vessel" to POST /api/vessels

6. Notification Flow

Scheduler: In services/notifications.js, use cron.every(user.interval hours) to check/send
SMS Out: "Fuel check for [vessel]. Reply: FUEL [rate] SPEED [knots] WEATHER [0-3]"
Incoming Parse: Regex, handle errors by resend
No Reply: After 1hr, missed_count++, resend up to 3 times
Push: If WEB, use Notification API

7. Implementation Priority

Phase 1: Core MVP (Weeks 1-4)

Week 1: DB, auth, vessel CRUD (dep: none)
Week 2: Physics extract, adaptive model (dep: Week 1)
Week 3: Data endpoints, SMS (dep: Week 2)
Week 4: Dashboard basics (dep: Week 3)


Phase 2: Enhancement (Weeks 5-8)

Week 5: Offline, PWA (dep: Phase 1)
Week 6: BFMP with data (dep: Week 5)
Week 7: Predictions, recs (dep: Week 6)
Week 8: Weather, location (dep: Week 7)


Phase 3: Polish (Weeks 9-10)

Week 9: UI mobile, CSRF protection
Week 10: Testing, deploy



8. Success Metrics

Engagement: 80% readings completed (track via logs), 5+/week/vessel, 90% retention
Model: Accuracy <15% after 30 days (compare predictions vs actual), confidence >80% after 100
Technical: 95% uptime (monitor), <2s load, 100% sync
Tracking: Use console.log or simple analytics endpoint

9. Security Considerations

Hash: bcrypt
JWT: Expire 7d, refresh 30d
Rate Limit: 100 req/min via express-rate-limit
Validation: All inputs sanitized, parameterized SQL
CSRF: Tokens for forms
HTTPS: Enforce in prod

10. Configuration
bash# .env
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/vessels.db
JWT_SECRET=your-secret-key
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+61xxxxxxxxx
OPENWEATHER_API_KEY=xxx
11. Testing Requirements

Unit: Jest for physics (e.g., test solveAlphaBeta with inputs: ecoCost=100, full=200, speeds=10/20, expect alpha=0.5, beta=0)
Integration: API with supertest (e.g., POST /readings succeeds)
Model: Synthetic data (e.g., 10 readings, check correctionFactor updates)
Offline: Mock navigator.onLine=false, save, then true, sync
SMS: Mock Twilio, test parse failures
Load: 100 users with artillery

12. Deployment

Primary Option: Home Lab with Cloudflare Tunnel

Setup Steps:

Install Node.js (>=20) and dependencies on your home lab server (e.g., Raspberry Pi, old PC, or VM).
Run the app: npm install && npm start (listens on localhost:3000 by default).
Use PM2 for process management: Install globally (npm i -g pm2), then pm2 start server/index.js --name vessel-app and pm2 startup for boot persistence.
Install Cloudflare Tunnel: Download cloudflared from Cloudflare dashboard, authenticate with cloudflared login.
Create tunnel: cloudflared tunnel create vessel-tunnel.
Configure tunnel: Edit ~/.cloudflared/config.yml with:
texttunnel: vessel-tunnel
credentials-file: /home/user/.cloudflared/vessel-tunnel.json
ingress:
  - hostname: yourdomain.com
    service: http://localhost:3000
  - service: http_status:404

Run tunnel: cloudflared tunnel run vessel-tunnel.
Set up DNS: In Cloudflare dashboard, add CNAME record for yourdomain.com pointing to the tunnel UUID.cfargotunnel.com.
SSL: Cloudflare handles HTTPS automatically (enable "Always Use HTTPS" in dashboard).
Firewall: No need to open ports; Tunnel handles ingress securely.


Considerations:

Reliability: Monitor uptime with tools like Uptime Kuma; home internet/power outages may cause downtime.
Scaling: Limited to home hardware; for more users, consider migrating to cloud later.
Database: SQLite file at DATABASE_PATH; back up daily via cron (e.g., cp vessels.db backup/$(date +%Y-%m-%d).db).
External Services: Ensure home lab has outbound internet for Twilio/OpenWeatherMap; no inbound ports needed.
Domain: Register via Cloudflare or use a free subdomain.
Edge Cases: If tunnel fails, app falls back to local access; test with cloudflared access for auth.




Alternative Options: AWS EC2, DigitalOcean, or Railway for cloud hosting if home lab proves unreliable.
General:

Backups: Daily SQLite backups via cron.
Monitoring: Use PM2 logs and Cloudflare analytics.
Credits: Twilio for SMS, OpenWeatherMap subscription.
