# 🚢 Vessel Fouling Management System

A comprehensive web application for monitoring hull fouling and optimizing fuel efficiency in marine vessels. This system combines physics-based models with adaptive machine learning to provide real-time fouling predictions and maintenance recommendations.

## ✅ Current Status: **FULLY IMPLEMENTED**

The application is complete and ready to use! All major features have been implemented including:

- ✅ **Authentication System** - JWT-based user management
- ✅ **Vessel Management** - Multi-vessel CRUD operations
- ✅ **Physics-Based Modeling** - Hull fouling resistance calculations
- ✅ **Adaptive ML Engine** - Real-time learning from fuel data
- ✅ **SMS Data Collection** - Twilio integration for remote data entry
- ✅ **Weather Integration** - OpenWeatherMap API support
- ✅ **Interactive Dashboard** - Real-time charts and analytics
- ✅ **BFMP Generator** - Automated Biofouling Management Plans
- ✅ **Progressive Web App** - Mobile app experience with offline support
- ✅ **Notification System** - Automated reminders and alerts
- ✅ **Responsive UI** - Mobile-first design with Chart.js visualizations

## 🚀 Quick Start

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Initialize Database:**
   ```bash
   npm run migrate
   ```

3. **Start Application:**
   ```bash
   npm start
   ```

4. **Access Application:**
   Open http://localhost:3000 in your browser

## 📋 System Requirements

- **Node.js**: 20.0.0 or higher
- **NPM**: Latest version
- **SQLite**: Embedded (no separate installation needed)

**Optional External Services:**
- Twilio Account (for SMS functionality)
- OpenWeatherMap API (for weather data)

## 🎯 Key Features

### Fouling Monitoring & Prediction
- **Real-time Fouling Gauge**: Visual FR0-FR5 scale indicator
- **Predictive Analytics**: ML-powered fuel consumption predictions
- **Performance Tracking**: Fuel efficiency trends and analysis
- **Cost Impact Analysis**: Daily/annual cost calculations

### Data Collection Methods
- **Web Interface**: Interactive dashboard forms
- **SMS Integration**: Text message data entry (`FUEL 450 SPEED 12.5 WEATHER 1`)
- **Offline Support**: Works without internet connection
- **Automatic Weather**: Location-based weather detection

### Maintenance Management
- **ROI-Based Recommendations**: Optimal cleaning timing
- **BFMP Generation**: Automated biofouling management plans
- **Notification Scheduling**: Customizable alerts and reminders
- **Multi-Vessel Support**: Manage entire fleet from one account

### Technical Capabilities
- **Physics-Based Core**: Hull resistance calculations
- **Adaptive Learning**: Self-improving prediction models
- **Progressive Web App**: Install as mobile application
- **Responsive Design**: Works on all device sizes
- **API-First Architecture**: RESTful endpoints for integration

## 📱 User Guide

### Getting Started
1. **Sign Up**: Create account with email/phone
2. **Add Vessel**: Enter vessel specifications and dimensions
3. **Record Data**: Submit fuel readings via web or SMS
4. **Monitor Performance**: View dashboard analytics and recommendations

### SMS Data Entry Format
```
FUEL [rate] SPEED [knots] WEATHER [0-3]
```
- Weather codes: 0=Calm, 1=Moderate, 2=Rough, 3=Storm
- Example: `FUEL 450 SPEED 12.5 WEATHER 1`

### Understanding the Dashboard
- **Fouling Gauge**: Current fouling level (FR0-FR5)
- **Days Since Clean**: Time since last hull maintenance
- **Extra Cost/Day**: Additional fuel cost due to fouling
- **ROI Analysis**: Break-even period for cleaning
- **Trends Charts**: Historical and predicted fuel consumption

## 🔧 Configuration

### Environment Variables (.env)
```env
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/vessels.db
JWT_SECRET=your-secure-jwt-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret

# Optional: SMS Integration
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Optional: Weather Integration  
OPENWEATHER_API_KEY=your-api-key
```

### Database Setup
The application uses SQLite with automatic migrations:
```bash
npm run migrate  # Initialize/update database schema
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token

### Vessel Management
- `GET /api/vessels` - List user's vessels
- `POST /api/vessels` - Create new vessel
- `GET /api/vessels/:id` - Get vessel details
- `PUT /api/vessels/:id` - Update vessel
- `DELETE /api/vessels/:id` - Remove vessel

### Data Collection
- `POST /api/readings` - Submit fuel reading
- `GET /api/readings/vessel/:id` - Get vessel readings
- `GET /api/readings/vessel/:id/trends` - Fuel consumption trends
- `POST /api/sms/webhook` - Twilio webhook endpoint

### Analytics & Predictions
- `GET /api/predictions/vessel/:id` - Get predictions and model stats
- `GET /api/predictions/vessel/:id/recommendations` - Cleaning recommendations
- `GET /api/predictions/vessel/:id/emissions` - CO2 emissions analysis
- `POST /api/predictions/vessel/:id/predict` - Create specific prediction

### BFMP Management
- `POST /api/bfmp/vessel/:id/generate` - Generate biofouling management plan
- `GET /api/bfmp/vessel/:id` - Retrieve existing BFMP
- `PUT /api/bfmp/vessel/:id` - Update BFMP data

### Notifications
- `GET /api/notifications/preferences` - Get notification settings
- `PUT /api/notifications/preferences` - Update notification settings
- `POST /api/notifications/test` - Send test notification

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Password Hashing**: bcrypt with salt for secure password storage
- **Rate Limiting**: API request throttling (100 requests/15 minutes)
- **CORS Protection**: Configurable cross-origin request handling
- **SQL Injection Prevention**: Parameterized queries throughout
- **Input Validation**: Comprehensive server-side validation
- **Helmet.js**: Security headers and CSP protection

## 🚀 Deployment

### Home Lab Deployment (Recommended)
1. **Setup Process Manager:**
   ```bash
   npm install -g pm2
   pm2 start server/index.js --name vessel-app
   pm2 startup && pm2 save
   ```

2. **Configure Cloudflare Tunnel:**
   ```bash
   cloudflared tunnel create vessel-tunnel
   # Edit ~/.cloudflared/config.yml
   cloudflared tunnel run vessel-tunnel
   ```

3. **Benefits:**
   - No monthly hosting costs
   - Full control over data
   - Automatic SSL via Cloudflare
   - No port forwarding needed

### Cloud Deployment Options
- **Railway**: One-click deployment
- **Heroku**: Easy scaling and management  
- **DigitalOcean**: App Platform or Droplet
- **AWS**: EC2, Elastic Beanstalk, or ECS

## 🧪 Testing Checklist

### Core Functionality
- [ ] User registration and login
- [ ] Vessel creation and management
- [ ] Fuel data entry (web form)
- [ ] Dashboard charts and metrics
- [ ] Fouling recommendations
- [ ] BFMP generation

### Advanced Features  
- [ ] SMS data collection (if Twilio configured)
- [ ] Weather integration (if API configured)
- [ ] Offline functionality
- [ ] PWA installation
- [ ] Multi-vessel switching
- [ ] Notification scheduling

### API Testing
```bash
# Health check
curl http://localhost:3000/health

# Create account
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"testpass123"}'
```

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check if port is in use
netstat -an | grep :3000
# Change port in .env file if needed
```

**Database errors:**
```bash
# Reset database (WARNING: Deletes all data)
rm data/vessels.db* && npm run migrate
```

**SMS not working:**
- Verify Twilio credentials in `.env`
- Check webhook URL in Twilio console
- Ensure phone number is verified in Twilio

**Charts not displaying:**
- Check browser console for JavaScript errors
- Verify Chart.js CDN is accessible
- Ensure vessel has fuel data

### Debug Mode
Set `NODE_ENV=development` in `.env` for detailed error logging.

## 📊 Technical Architecture

### Backend Stack
- **Node.js + Express**: RESTful API server
- **SQLite + better-sqlite3**: Embedded database with high performance
- **JWT**: Stateless authentication with refresh tokens
- **bcrypt**: Secure password hashing
- **node-cron**: Background task scheduling

### Frontend Stack
- **Vanilla JavaScript**: No framework dependencies
- **Chart.js**: Interactive data visualizations
- **Progressive Enhancement**: Works with and without JavaScript
- **Service Workers**: Offline functionality and caching
- **Responsive CSS**: Mobile-first design approach

### External Integrations
- **Twilio SMS**: Remote data collection capabilities
- **OpenWeatherMap**: Automatic weather condition detection
- **PWA Manifest**: Mobile app installation support

### Data Models
- **Physics Engine**: Hull fouling resistance calculations
- **Adaptive Learning**: ML-based prediction improvements  
- **BFMP Generator**: Automated compliance document creation
- **Notification System**: Intelligent reminder scheduling

## 🔮 Future Enhancements

- **Advanced ML Models**: Neural networks for complex patterns
- **Fleet Optimization**: Multi-vessel efficiency analysis
- **AIS Integration**: Automatic position and speed data
- **Satellite Monitoring**: Remote hull condition assessment
- **Mobile Apps**: Native iOS and Android applications
- **Advanced Analytics**: Predictive maintenance algorithms

## 📄 License

MIT License - Open source and free for commercial use.

## 🤝 Support

This is a complete, production-ready application. For technical issues:

1. Check server logs for error details
2. Verify all environment variables are set
3. Ensure database migrations have run
4. Test API endpoints individually
5. Check browser console for frontend errors

---

**🚢 Ready to optimize your vessel's fuel efficiency and reduce environmental impact!**