const fetch = require('node-fetch');
const config = require('../config');

class WeatherService {
    constructor() {
        this.apiKey = config.openWeather.apiKey;
        this.baseUrl = 'https://api.openweathermap.org/data/2.5';
        this.enabled = !!this.apiKey;
        
        if (!this.enabled) {
            console.warn('OpenWeatherMap API key not configured, using fallback weather conditions');
        }
    }
    
    async getCurrentWeather(latitude, longitude) {
        if (!this.enabled) {
            return this.getFallbackWeather();
        }
        
        try {
            const url = `${this.baseUrl}/weather?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return this.parseWeatherData(data);
            
        } catch (error) {
            console.error('Error fetching weather data:', error);
            return this.getFallbackWeather();
        }
    }
    
    async getMarineWeather(latitude, longitude) {
        if (!this.enabled) {
            return this.getFallbackMarineWeather();
        }
        
        try {
            // Use current weather as base - in production might use marine weather API
            const weather = await this.getCurrentWeather(latitude, longitude);
            
            // Enhance with marine-specific conditions
            const marineConditions = this.estimateMarineConditions(weather);
            
            return {
                ...weather,
                marine: marineConditions
            };
            
        } catch (error) {
            console.error('Error fetching marine weather:', error);
            return this.getFallbackMarineWeather();
        }
    }
    
    parseWeatherData(data) {
        const weather = {
            location: {
                name: data.name,
                country: data.sys.country,
                coordinates: {
                    lat: data.coord.lat,
                    lon: data.coord.lon
                }
            },
            current: {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                pressure: data.main.pressure,
                windSpeed: Math.round(data.wind?.speed * 3.6 * 10) / 10 || 0, // m/s to km/h
                windDirection: data.wind?.deg || 0,
                visibility: data.visibility ? data.visibility / 1000 : 10, // meters to km
                description: data.weather[0].description,
                icon: data.weather[0].icon
            },
            timestamp: new Date(data.dt * 1000).toISOString()
        };
        
        // Determine sea condition based on wind speed and weather
        weather.seaCondition = this.determineSeaCondition(weather.current);
        
        return weather;
    }
    
    determineSeaCondition(currentWeather) {
        const windSpeed = currentWeather.windSpeed || 0; // km/h
        const description = (currentWeather.description || '').toLowerCase();
        
        // Beaufort scale approximation for sea conditions
        if (windSpeed < 6 || description.includes('calm')) {
            return {
                condition: 'calm',
                code: 0,
                description: 'Calm seas, minimal wave action',
                waveHeight: '0-0.3m'
            };
        } else if (windSpeed < 20 && !description.includes('storm') && !description.includes('thunderstorm')) {
            return {
                condition: 'moderate',
                code: 1,
                description: 'Moderate seas, some wave action',
                waveHeight: '0.5-1.5m'
            };
        } else if (windSpeed < 40 && !description.includes('storm')) {
            return {
                condition: 'rough',
                code: 2,
                description: 'Rough seas, significant wave action',
                waveHeight: '1.5-3m'
            };
        } else {
            return {
                condition: 'storm',
                code: 3,
                description: 'Storm conditions, heavy seas',
                waveHeight: '3m+'
            };
        }
    }
    
    estimateMarineConditions(weather) {
        const windSpeed = weather.current.windSpeed || 0;
        const seaCondition = weather.seaCondition;
        
        return {
            seaState: seaCondition.code,
            seaStateDescription: seaCondition.description,
            estimatedWaveHeight: seaCondition.waveHeight,
            visibility: weather.current.visibility,
            fuelImpactMultiplier: this.calculateFuelImpact(seaCondition.condition),
            recommendedSpeed: this.getRecommendedSpeed(seaCondition.condition),
            safetyLevel: this.getSafetyLevel(seaCondition.condition, windSpeed)
        };
    }
    
    calculateFuelImpact(seaCondition) {
        const impacts = {
            calm: 1.0,
            moderate: 1.05,
            rough: 1.15,
            storm: 1.30
        };
        
        return impacts[seaCondition] || 1.05;
    }
    
    getRecommendedSpeed(seaCondition) {
        const recommendations = {
            calm: 'Normal operating speed',
            moderate: 'Slight speed reduction recommended',
            rough: 'Reduce speed by 10-20%',
            storm: 'Consider harbor or significant speed reduction'
        };
        
        return recommendations[seaCondition] || 'Monitor conditions';
    }
    
    getSafetyLevel(seaCondition, windSpeed) {
        if (seaCondition === 'storm' || windSpeed > 50) {
            return {
                level: 'high_risk',
                color: 'red',
                message: 'High risk conditions, consider shelter'
            };
        } else if (seaCondition === 'rough' || windSpeed > 30) {
            return {
                level: 'moderate_risk',
                color: 'orange',
                message: 'Moderate risk, proceed with caution'
            };
        } else if (seaCondition === 'moderate') {
            return {
                level: 'low_risk',
                color: 'yellow',
                message: 'Normal precautions'
            };
        } else {
            return {
                level: 'minimal_risk',
                color: 'green',
                message: 'Good conditions for operation'
            };
        }
    }
    
    getFallbackWeather() {
        return {
            location: {
                name: 'Unknown',
                country: 'Unknown',
                coordinates: { lat: 0, lon: 0 }
            },
            current: {
                temperature: 20,
                humidity: 60,
                pressure: 1013,
                windSpeed: 10,
                windDirection: 180,
                visibility: 10,
                description: 'moderate conditions',
                icon: '02d'
            },
            seaCondition: {
                condition: 'moderate',
                code: 1,
                description: 'Moderate seas (estimated)',
                waveHeight: '1m'
            },
            timestamp: new Date().toISOString(),
            fallback: true
        };
    }
    
    getFallbackMarineWeather() {
        const baseWeather = this.getFallbackWeather();
        
        return {
            ...baseWeather,
            marine: {
                seaState: 1,
                seaStateDescription: 'Moderate seas (estimated)',
                estimatedWaveHeight: '1m',
                visibility: 10,
                fuelImpactMultiplier: 1.05,
                recommendedSpeed: 'Normal operating speed',
                safetyLevel: {
                    level: 'low_risk',
                    color: 'yellow',
                    message: 'Normal precautions (estimated)'
                }
            }
        };
    }
    
    async getWeatherForReading(latitude, longitude) {
        try {
            if (!latitude || !longitude) {
                return {
                    condition: 'moderate',
                    source: 'default',
                    confidence: 'low'
                };
            }
            
            const weather = await this.getCurrentWeather(latitude, longitude);
            
            return {
                condition: weather.seaCondition.condition,
                source: weather.fallback ? 'fallback' : 'api',
                confidence: weather.fallback ? 'low' : 'high',
                details: weather
            };
            
        } catch (error) {
            console.error('Error getting weather for reading:', error);
            return {
                condition: 'moderate',
                source: 'error_fallback',
                confidence: 'low'
            };
        }
    }
    
    // Get historical weather patterns for a location (simplified version)
    async getWeatherHistory(latitude, longitude, days = 7) {
        // In a real implementation, this would use historical weather API
        // For now, return simulated data
        const history = [];
        const conditions = ['calm', 'moderate', 'rough'];
        
        for (let i = days; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            history.push({
                date: date.toISOString().split('T')[0],
                condition: conditions[Math.floor(Math.random() * conditions.length)],
                windSpeed: Math.random() * 30,
                waveHeight: Math.random() * 2 + 0.5,
                source: 'simulated'
            });
        }
        
        return history;
    }
    
    // Reverse geocoding to get location name from coordinates
    async reverseGeocode(latitude, longitude) {
        if (!this.enabled) {
            return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        }
        
        try {
            const url = `${this.baseUrl.replace('/data/2.5', '/geo/1.0/reverse')}?lat=${latitude}&lon=${longitude}&limit=1&appid=${this.apiKey}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error('Geocoding failed');
            }
            
            const data = await response.json();
            
            if (data.length > 0) {
                const location = data[0];
                return `${location.name}, ${location.country}`;
            }
            
            return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
            
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        }
    }
}

module.exports = new WeatherService();