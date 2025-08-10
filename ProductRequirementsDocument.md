Final Product Requirements Document
Vessel Fouling & Fuel Prediction Application
Project Overview
A web application that tracks vessel fuel consumption and predicts fouling-related costs by combining physics-based models with machine learning from real-world data. The system reuses existing hull fouling calculator and BFMP generator code, adding data collection and adaptive learning capabilities.
Technology Stack

Backend: Node.js with minimal Express
Frontend: Vanilla JavaScript, HTML, CSS (no frameworks)
Database: SQLite (server and client-side)
Existing Code: Hull fouling calculator (paste.txt) and BFMP generator (paste-2.txt)
External Services: OpenWeatherMap API, Twilio SMS


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
    timestamp DATETIME NOT NULL,
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
    days_since_clean INTEGER,
    
    -- Model confidence and training
    confidence_score REAL DEFAULT 0.0,
    training_data_count INTEGER DEFAULT 0,
    last_updated DATETIME,
    
    FOREIGN KEY (vessel_id) REFERENCES vessels(id)
);

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

2. File Structure
vessel-fouling-app/
├── server/
│   ├── index.js                 # Express server setup
│   ├── config.js                # Environment config
│   ├── database.js              # SQLite connection and queries
│   ├── auth.js                  # Simple JWT authentication
│   │
│   ├── models/
│   │   ├── foulingPhysics.js    # Extract physics functions from calculator
│   │   ├── adaptiveModel.js     # Learning layer on top of physics
│   │   └── bfmpGenerator.js     # Existing BFMP generation logic
│   │
│   ├── routes/
│   │   ├── auth.js              # Login, signup, password reset
│   │   ├── vessels.js           # Vessel CRUD operations
│   │   ├── readings.js          # Fuel data collection endpoints
│   │   ├── predictions.js       # Get predictions and trends
│   │   ├── bfmp.js             # BFMP generation and management
│   │   └── notifications.js     # Notification preferences
│   │
│   └── services/
│       ├── sms.js               # Twilio SMS integration
│       ├── weather.js           # OpenWeatherMap integration
│       ├── notifications.js     # Notification scheduler
│       └── modelTraining.js     # Model update logic
│
├── public/
│   ├── index.html               # Login/signup page
│   ├── dashboard.html           # Main dashboard
│   ├── vessel-setup.html        # Vessel configuration
│   ├── calculator.html          # What-if calculator (existing)
│   ├── bfmp-generator.html      # BFMP creation (existing)
│   │
│   ├── css/
│   │   ├── main.css            # Core styles
│   │   ├── calculator.css      # Existing calculator styles
│   │   └── dashboard.css       # Dashboard specific styles
│   │
│   ├── js/
│   │   ├── app.js              # Main app logic
│   │   ├── auth.js             # Authentication handling
│   │   ├── calculator.js        # Existing calculator (modified)
│   │   ├── bfmpGenerator.js    # Existing BFMP logic (modified)
│   │   ├── dashboard.js        # Dashboard charts and UI
│   │   ├── dataEntry.js        # Fuel reading input
│   │   ├── offline.js          # Offline sync logic
│   │   └── utils.js            # Shared utilities
│   │
│   └── service-worker.js       # PWA offline support
│
└── migrations/
    └── 001_initial.sql          # Database setup

3. Core Features Implementation
3.1 User Authentication
javascript// Simple JWT-based auth with email/phone
// POST /api/auth/signup
{
  "email": "skipper@vessel.com",
  "phone": "+61400000000",
  "name": "John Skipper",
  "password": "securepassword"
}

// POST /api/auth/login
{
  "email": "skipper@vessel.com",
  "password": "securepassword"
}
// Returns: { token: "jwt_token", user: {...} }
3.2 Vessel Setup
javascript// POST /api/vessels
{
  "name": "MV Cargo Ship",
  "imo": "9876543",
  "vessel_type": "custom", // or "tug", "cruiseShip"
  
  // Vessel parameters from existing calculator
  "length": 93,
  "beam": 16,
  "draft": 5.2,
  "cb": 0.62,
  "gross_tonnage": 5000,
  
  "eco_speed": 10,
  "full_speed": 13.8,
  "cost_eco": 1600,  // AUD/hr
  "cost_full": 4200, // AUD/hr
  
  "vessel_category": "cargo",
  "last_clean_date": "2024-10-01",
  "next_clean_date": "2025-04-01"
}
3.3 Data Collection Flow
Web Interface
javascript// GET /api/readings/prompt
// Returns current vessel state and prompts for input
{
  "vessel_id": 1,
  "vessel_name": "MV Cargo Ship",
  "last_reading": "2024-12-01T06:00:00Z",
  "suggested_weather": "moderate", // from API if available
  "current_location": {...}
}

// POST /api/readings
{
  "vessel_id": 1,
  "fuel_rate": 450,
  "fuel_unit": "L/hr",
  "speed": 12.5,
  "weather_condition": "moderate"
}
SMS Interface
javascript// Incoming SMS format: "FUEL 450 SPEED 12.5 WEATHER 2"
// Weather codes: 0=calm, 1=moderate, 2=rough, 3=storm

// Response SMS: "Recorded: 450L/hr at 12.5kn. Next check in 6hrs. 
// Fouling: FR2 (35% increase). Consider cleaning in 45 days."
3.4 Adaptive Model Implementation
javascript// server/models/adaptiveModel.js
class AdaptiveFoulingModel {
    constructor(vessel) {
        // Import physics functions from existing calculator
        this.physics = new FoulingPhysics(vessel);
        
        // Initialize with physics-based predictions
        const { alpha, beta } = this.physics.solveAlphaBeta(
            vessel.cost_eco,
            vessel.cost_full,
            vessel.eco_speed,
            vessel.full_speed
        );
        
        this.baseAlpha = alpha;
        this.baseBeta = beta;
        this.correctionFactor = 1.0;
        this.foulingRate = 1.0;
        
        // Track days since clean
        this.daysSinceClean = this.calculateDaysSinceClean(vessel.last_clean_date);
    }
    
    estimateFRLevel(daysSinceClean) {
        // Simple time-based estimation, adjusted by learned fouling rate
        const adjustedDays = daysSinceClean * this.foulingRate;
        
        if (adjustedDays < 30) return 0;  // FR0
        if (adjustedDays < 60) return 1;  // FR1
        if (adjustedDays < 120) return 2; // FR2
        if (adjustedDays < 180) return 3; // FR3
        if (adjustedDays < 270) return 4; // FR4
        return 5; // FR5
    }
    
    predict(speed, weather = 'calm') {
        // Use existing physics model
        const frLevel = this.estimateFRLevel(this.daysSinceClean);
        const baseCost = this.physics.calculateCostAt(speed, frLevel);
        
        // Apply learned corrections
        const weatherMultiplier = {
            'calm': 1.0,
            'moderate': 1.05,
            'rough': 1.15,
            'storm': 1.30
        }[weather];
        
        return baseCost * this.correctionFactor * weatherMultiplier;
    }
    
    updateFromReading(actualFuelRate, speed, weather) {
        const predicted = this.predict(speed, weather);
        const error = (actualFuelRate - predicted) / predicted;
        
        // Simple exponential smoothing for correction factor
        const learningRate = 0.1;
        this.correctionFactor = this.correctionFactor * (1 - learningRate) + 
                                (actualFuelRate / predicted) * learningRate;
        
        // Update confidence based on prediction accuracy
        this.updateConfidence(Math.abs(error));
        
        // Store for batch retraining
        this.storeTrainingData(actualFuelRate, speed, weather, predicted);
        
        // Retrain if enough new data
        if (this.shouldRetrain()) {
            this.retrainModel();
        }
    }
    
    recommendCleaning() {
        // Calculate ROI for cleaning
        const currentExtraCost = this.calculateExtraCostPerDay();
        const cleaningCost = 15000; // Example cost
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
        
        // Reuse chart config from existing calculator
        this.initializeCharts();
        this.loadData();
        this.startAutoRefresh();
    }
    
    async initializeCharts() {
        // 1. Fuel consumption trend (predicted vs actual)
        this.charts.fuelTrend = new Chart(document.getElementById('fuelTrendChart'), {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Physics Model',
                        borderColor: 'rgba(30, 77, 120, 1)',
                        backgroundColor: 'rgba(30, 77, 120, 0.1)',
                    },
                    {
                        label: 'Adaptive Model',
                        borderColor: 'rgba(147, 51, 234, 1)',
                        borderDash: [5, 5]
                    },
                    {
                        label: 'Actual Readings',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        showLine: false,
                        pointRadius: 5
                    }
                ]
            },
            options: {
                // Reuse options from existing calculator
            }
        });
        
        // 2. Fouling accumulation indicator
        this.charts.foulingGauge = this.createFoulingGauge();
        
        // 3. Cost impact chart
        this.charts.costImpact = this.createCostImpactChart();
        
        // 4. CO2 emissions tracker
        this.charts.emissions = this.createEmissionsChart();
    }
    
    createFoulingGauge() {
        // Visual FR level indicator (0-5 scale)
        const canvas = document.getElementById('foulingGauge');
        // Create semi-circular gauge showing current FR level
        // Color coded: green (FR0-1), yellow (FR2-3), red (FR4-5)
    }
    
    async loadData() {
        // Fetch predictions and actual readings
        const response = await fetch(`/api/predictions/${this.vesselId}`);
        const data = await response.json();
        
        this.updateCharts(data);
        this.updateMetrics(data);
        this.updateRecommendations(data);
    }
    
    updateMetrics(data) {
        // Display key metrics
        document.getElementById('currentFR').textContent = `FR${data.currentFRLevel}`;
        document.getElementById('daysSinceClean').textContent = data.daysSinceClean;
        document.getElementById('extraCostPerDay').textContent = `$${data.extraCostPerDay}`;
        document.getElementById('modelConfidence').textContent = `${data.confidence}%`;
        document.getElementById('nextReading').textContent = this.formatTimeUntil(data.nextReading);
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
        // Initialize local SQLite
        const db = new SQL.Database();
        
        // Create local tables
        db.run(`
            CREATE TABLE IF NOT EXISTS offline_readings (
                id INTEGER PRIMARY KEY,
                vessel_id INTEGER,
                fuel_rate REAL,
                speed REAL,
                weather TEXT,
                timestamp TEXT,
                synced INTEGER DEFAULT 0
            )
        `);
        
        return db;
    }
    
    saveReading(data) {
        // Save to local DB
        this.db.run(
            `INSERT INTO offline_readings 
            (vessel_id, fuel_rate, speed, weather, timestamp) 
            VALUES (?, ?, ?, ?, ?)`,
            [data.vessel_id, data.fuel_rate, data.speed, 
             data.weather, new Date().toISOString()]
        );
        
        // Try to sync
        this.attemptSync();
    }
    
    async attemptSync() {
        if (!navigator.onLine) return;
        
        // Get unsynced readings
        const unsynced = this.db.exec(
            "SELECT * FROM offline_readings WHERE synced = 0"
        );
        
        for (const reading of unsynced[0]?.values || []) {
            try {
                await fetch('/api/readings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        vessel_id: reading[1],
                        fuel_rate: reading[2],
                        speed: reading[3],
                        weather_condition: reading[4],
                        timestamp: reading[5]
                    })
                });
                
                // Mark as synced
                this.db.run(
                    "UPDATE offline_readings SET synced = 1 WHERE id = ?",
                    [reading[0]]
                );
            } catch (error) {
                console.error('Sync failed for reading:', reading[0]);
            }
        }
    }
}

// Service worker for PWA
// public/service-worker.js
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('v1').then(cache => {
            return cache.addAll([
                '/',
                '/dashboard.html',
                '/css/main.css',
                '/js/app.js',
                '/js/offline.js'
            ]);
        })
    );
});
3.7 BFMP Integration
javascript// server/routes/bfmp.js
router.post('/vessels/:id/bfmp/generate', async (req, res) => {
    const vessel = await db.getVessel(req.params.id);
    const readings = await db.getRecentReadings(req.params.id, 30);
    
    // Calculate operating profile from actual data
    const operatingProfile = {
        speed: calculateAverageSpeed(readings),
        inServicePeriod: calculateDaysSinceClean(vessel.last_clean_date),
        tradingRoutes: 'Auto-generated from vessel data',
        operatingArea: vessel.operating_area || 'Not specified',
        climateZones: 'Temperate/Tropical', // Could derive from locations
        afsSuitability: 'Yes' // Based on fouling rate
    };
    
    // Generate maintenance schedule based on model predictions
    const model = new AdaptiveFoulingModel(vessel);
    const cleaningRecommendation = model.recommendCleaning();
    
    const bfmpData = {
        vessel: {
            name: vessel.name,
            imo: vessel.imo,
            constructionDate: vessel.created_at,
            type: vessel.vessel_category,
            grossTonnage: vessel.gross_tonnage,
            beam: vessel.beam,
            length: vessel.length,
            maxDraft: vessel.draft,
            minDraft: vessel.draft * 0.7,
            flag: 'Australia'
        },
        revision: {
            lastDrydock: vessel.last_clean_date,
            nextDrydock: vessel.next_clean_date,
            number: '1',
            date: new Date().toISOString(),
            responsiblePerson: req.user.name,
            responsiblePosition: 'Vessel Operator'
        },
        operatingProfile,
        maintenance: {
            inspectionSchedule: `Monthly visual inspections. 
                Increased to weekly when FR level exceeds ${cleaningRecommendation.currentFRLevel}.`,
            cleaningSchedule: `Recommended cleaning in ${cleaningRecommendation.daysToBreakeven} days 
                based on current fouling accumulation rate.`
        },
        riskManagement: {
            parameters: 'Speed reduction, extended port stays, seasonal variations',
            deviationLimits: 'Speed < 6 knots for > 7 days, Port stay > 14 days',
            contingencyActions: 'Increase inspection frequency, consider spot cleaning',
            longTermActions: 'Review coating performance, adjust cleaning schedule'
        }
    };
    
    // Use existing generatePlanHtml function
    const planHtml = generatePlanHtml(bfmpData);
    
    // Save to vessel record
    await db.updateVessel(req.params.id, {
        bfmp_data: JSON.stringify(bfmpData)
    });
    
    res.json({ 
        success: true, 
        html: planHtml,
        data: bfmpData 
    });
});

4. API Endpoints
Authentication

POST /api/auth/signup - Create account
POST /api/auth/login - Login
POST /api/auth/logout - Logout
POST /api/auth/reset-password - Reset password

Vessels

GET /api/vessels - List user's vessels
POST /api/vessels - Create vessel
GET /api/vessels/:id - Get vessel details
PUT /api/vessels/:id - Update vessel
DELETE /api/vessels/:id - Delete vessel
POST /api/vessels/:id/invite - Invite user to vessel

Data Collection

GET /api/readings/prompt - Get data entry prompt
POST /api/readings - Submit fuel reading
GET /api/vessels/:id/readings - Get vessel readings
POST /api/readings/sms - SMS webhook for data entry

Predictions & Analytics

GET /api/vessels/:id/predictions - Get predictions
GET /api/vessels/:id/trends - Get trend data
GET /api/vessels/:id/recommendations - Get cleaning recommendations
GET /api/vessels/:id/emissions - Get CO2 emissions data

BFMP

POST /api/vessels/:id/bfmp/generate - Generate BFMP
GET /api/vessels/:id/bfmp - Get existing BFMP
PUT /api/vessels/:id/bfmp - Update BFMP

Notifications

GET /api/notifications/preferences - Get preferences
PUT /api/notifications/preferences - Update preferences
POST /api/notifications/test - Send test notification


5. User Interface Screens
5.1 Login/Signup

Email/phone and password
"Remember me" option
Password reset link

5.2 Dashboard (Main Screen)
┌─────────────────────────────────────┐
│ Vessel: MV Cargo Ship    [Switch ▼] │
├─────────────────────────────────────┤
│ Current Status                      │
│ ┌──────────┐  Days Since: 45        │
│ │   FR2    │  Next Clean: 135 days  │
│ │  Gauge   │  Confidence: 87%       │
│ └──────────┘  Next Check: 4:23      │
├─────────────────────────────────────┤
│ [Enter Fuel Reading]                │
├─────────────────────────────────────┤
│ Fuel Trend (Predicted vs Actual)    │
│ [────────── Chart ──────────]       │
├─────────────────────────────────────┤
│ Cost Impact    │ CO2 Emissions      │
│ +$420/day      │ +165 kg/day        │
├─────────────────────────────────────┤
│ Cleaning ROI Calculator              │
│ Break-even: 36 days                 │
│ Annual Savings: $45,000             │
│ [Schedule Cleaning]                 │
└─────────────────────────────────────┘
5.3 Data Entry Screen
┌─────────────────────────────────────┐
│ Enter Fuel Reading                  │
├─────────────────────────────────────┤
│ Current Speed: [___12.5___] knots   │
│                                     │
│ Fuel Rate: [____450____] ○ L/hr     │
│                          ● $/hr     │
│                                     │
│ Weather:   ○ Calm                   │
│           ● Moderate                │
│           ○ Rough                   │
│           ○ Storm                   │
│                                     │
│ [Submit]        [Skip This Check]   │
└─────────────────────────────────────┘
5.4 Vessel Setup

Reuse existing calculator interface for vessel parameters
Add fields for last/next cleaning dates
Option to upload or generate BFMP

5.5 What-If Calculator

Keep existing calculator as standalone tool
Add "Apply to Vessel" button to save scenarios


6. Notification Flow
SMS Format
Outgoing: "Fuel check for MV Cargo Ship. Reply with: 
FUEL [rate] SPEED [knots] WEATHER [0-3]
Example: FUEL 450 SPEED 12.5 WEATHER 1"

Incoming: "FUEL 450 SPEED 12.5 WEATHER 1"

Response: "✓ Recorded. FR2 (35% increase). 
Next check: 18:00. Consider cleaning in 45 days."
Push Notification
Title: "Fuel Check - MV Cargo Ship"
Body: "Time to record fuel consumption"
Action: Opens data entry screen

7. Implementation Priority
Phase 1: Core MVP (Weeks 1-4)

Week 1: Database setup, basic auth, vessel CRUD
Week 2: Extract physics functions, create adaptive model
Week 3: Data collection endpoints, SMS integration
Week 4: Basic dashboard with charts

Phase 2: Enhancement (Weeks 5-8)

Week 5: Offline support, PWA setup
Week 6: BFMP generation with live data
Week 7: Advanced predictions, cleaning recommendations
Week 8: Weather API, location tracking

Phase 3: Polish (Weeks 9-10)

Week 9: UI improvements, mobile optimization
Week 10: Testing, deployment, monitoring


8. Success Metrics
User Engagement

80% of scheduled readings completed
Average 5+ readings per week per vessel
90% user retention after 30 days

Model Performance

Prediction accuracy within 15% after 30 days
Successful cleaning recommendation (user confirms savings)
Model confidence > 80% after 100 readings

Technical

95% uptime
< 2 second page load
100% offline data successfully synced


9. Security Considerations

Passwords hashed with bcrypt
JWT tokens expire after 7 days
Rate limiting on API endpoints
Input validation on all forms
SQL injection prevention with parameterized queries
HTTPS only in production


10. Configuration
Environment Variables
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

Unit tests for physics model functions
Integration tests for API endpoints
Model accuracy tests with synthetic data
Offline sync testing
SMS integration testing
Load testing for 100+ concurrent users


12. Deployment

Node.js hosting (AWS EC2, DigitalOcean, or Railway)
SQLite database with daily backups
SSL certificate
Domain name
SMS credits for Twilio
Weather API subscription
