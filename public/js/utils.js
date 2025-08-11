// Utility functions for the application

// API Configuration
const API_BASE = '/api';

// Local storage keys
const STORAGE_KEYS = {
    TOKEN: 'auth_token',
    REFRESH_TOKEN: 'refresh_token',
    USER: 'current_user',
    SELECTED_VESSEL: 'selected_vessel_id'
};

// Utility class for API calls
class ApiClient {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` })
            }
        };
        
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry original request with new token
                    finalOptions.headers.Authorization = `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`;
                    return await fetch(url, finalOptions);
                } else {
                    // Refresh failed, redirect to login
                    Auth.logout();
                    return response;
                }
            }
            
            return response;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }
    
    static async refreshToken() {
        try {
            const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
            if (!refreshToken) return false;
            
            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
                localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
                localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }
    
    static async get(endpoint) {
        const response = await this.request(endpoint);
        return this.handleResponse(response);
    }
    
    static async post(endpoint, data = {}) {
        const response = await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return this.handleResponse(response);
    }
    
    static async put(endpoint, data = {}) {
        const response = await this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return this.handleResponse(response);
    }
    
    static async delete(endpoint) {
        const response = await this.request(endpoint, {
            method: 'DELETE'
        });
        return this.handleResponse(response);
    }
    
    static async handleResponse(response) {
        if (!response.ok) {
            let error = { message: 'An error occurred', status: response.status };
            try {
                const errorData = await response.json();
                error = { ...error, ...errorData };
            } catch (e) {
                error.message = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw error;
        }
        
        try {
            return await response.json();
        } catch (error) {
            return {};
        }
    }
}

// Loading utility
class LoadingManager {
    static show(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const text = overlay.querySelector('p');
        if (text) text.textContent = message;
        overlay.classList.add('active');
    }
    
    static hide() {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.remove('active');
    }
}

// Toast notifications
class Toast {
    static show(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, duration);
        
        // Manual close on click
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }
    
    static success(message, duration) {
        this.show(message, 'success', duration);
    }
    
    static error(message, duration) {
        this.show(message, 'error', duration);
    }
    
    static warning(message, duration) {
        this.show(message, 'warning', duration);
    }
}

// Date formatting utilities
class DateUtils {
    static formatDate(dateString) {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch (error) {
            return '-';
        }
    }
    
    static formatDateTime(dateString) {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleString();
        } catch (error) {
            return '-';
        }
    }
    
    static formatRelativeTime(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);
            
            if (diffHours < 1) {
                return 'Less than 1 hour ago';
            } else if (diffHours < 24) {
                return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            } else if (diffDays < 30) {
                return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            } else {
                return this.formatDate(dateString);
            }
        } catch (error) {
            return '-';
        }
    }
    
    static getDaysUntil(dateString) {
        if (!dateString) return null;
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = date - now;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            return diffDays;
        } catch (error) {
            return null;
        }
    }
}

// Number formatting utilities
class NumberUtils {
    static formatCurrency(amount, currency = 'AUD') {
        if (amount == null) return '-';
        try {
            return new Intl.NumberFormat('en-AU', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        } catch (error) {
            return `$${Math.round(amount)}`;
        }
    }
    
    static formatNumber(value, decimals = 1) {
        if (value == null) return '-';
        return Number(value).toFixed(decimals);
    }
    
    static formatPercentage(value, decimals = 1) {
        if (value == null) return '-';
        return `${Number(value).toFixed(decimals)}%`;
    }
}

// Validation utilities
class Validators {
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    static isValidPhone(phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
        return phoneRegex.test(phone);
    }
    
    static isValidIMO(imo) {
        if (!imo || imo.length !== 7) return false;
        const digits = imo.split('').map(Number);
        if (digits.some(isNaN)) return false;
        
        // IMO check digit algorithm
        const checkSum = digits.slice(0, 6).reduce((sum, digit, index) => {
            return sum + digit * (7 - index);
        }, 0);
        
        return (checkSum % 10) === digits[6];
    }
    
    static validateVesselData(data) {
        const errors = [];
        
        if (!data.name || data.name.trim().length === 0) {
            errors.push('Vessel name is required');
        }
        
        if (!data.length || data.length <= 0) {
            errors.push('Length must be positive');
        }
        
        if (!data.beam || data.beam <= 0) {
            errors.push('Beam must be positive');
        }
        
        if (!data.draft || data.draft <= 0) {
            errors.push('Draft must be positive');
        }
        
        if (!data.cb || data.cb <= 0 || data.cb > 1) {
            errors.push('Block coefficient must be between 0 and 1');
        }
        
        if (!data.eco_speed || data.eco_speed <= 0) {
            errors.push('Economic speed must be positive');
        }
        
        if (!data.full_speed || data.full_speed <= 0) {
            errors.push('Full speed must be positive');
        }
        
        if (data.full_speed <= data.eco_speed) {
            errors.push('Full speed must be greater than economic speed');
        }
        
        if (!data.cost_eco || data.cost_eco <= 0) {
            errors.push('Economic fuel cost must be positive');
        }
        
        if (!data.cost_full || data.cost_full <= 0) {
            errors.push('Full speed fuel cost must be positive');
        }
        
        if (data.cost_full <= data.cost_eco) {
            errors.push('Full speed cost must be greater than economic cost');
        }
        
        if (!data.last_clean_date) {
            errors.push('Last hull cleaning date is required');
        }
        
        if (data.next_clean_date && new Date(data.next_clean_date) <= new Date(data.last_clean_date)) {
            errors.push('Next cleaning date must be after last cleaning date');
        }
        
        return errors;
    }
}

// Form utilities
class FormUtils {
    static getFormData(formElement) {
        const formData = new FormData(formElement);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            // Convert empty strings to null
            data[key] = value.trim() === '' ? null : value.trim();
            
            // Convert numeric inputs
            const input = formElement.querySelector(`[name="${key}"]`);
            if (input && (input.type === 'number' || input.step)) {
                const num = parseFloat(value);
                data[key] = isNaN(num) ? null : num;
            }
        }
        
        return data;
    }
    
    static populateForm(formElement, data) {
        Object.keys(data).forEach(key => {
            const input = formElement.querySelector(`[name="${key}"], #${key}`);
            if (input && data[key] != null) {
                if (input.type === 'checkbox') {
                    input.checked = Boolean(data[key]);
                } else {
                    input.value = data[key];
                }
            }
        });
    }
    
    static clearForm(formElement) {
        const inputs = formElement.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else {
                input.value = '';
            }
        });
    }
}

// Chart utilities
class ChartUtils {
    static getDefaultColors() {
        return [
            '#667eea', '#764ba2', '#f093fb', '#f5576c',
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7'
        ];
    }
    
    static createGradient(ctx, color1, color2) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }
    
    static getChartOptions(title = '') {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: !!title,
                    text: title,
                    font: {
                        size: 14,
                        weight: 'normal'
                    }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    beginAtZero: true
                }
            }
        };
    }
}

// Fouling gauge utility
class FoulingGauge {
    static draw(canvas, frLevel, confidence = 0) {
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height * 0.8;
        const radius = Math.min(width, height) * 0.35;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw gauge background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI, 0);
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 20;
        ctx.stroke();
        
        // Draw gauge sections (FR levels)
        const sectionAngle = Math.PI / 6; // 30 degrees per section
        const colors = ['#27ae60', '#2ecc71', '#f39c12', '#e67e22', '#e74c3c', '#c0392b'];
        
        for (let i = 0; i < 6; i++) {
            const startAngle = Math.PI + (i * sectionAngle);
            const endAngle = startAngle + sectionAngle;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.strokeStyle = i <= frLevel ? colors[i] : '#e9ecef';
            ctx.lineWidth = 20;
            ctx.stroke();
        }
        
        // Draw needle
        const needleAngle = Math.PI + (frLevel * sectionAngle) + (sectionAngle / 2);
        const needleLength = radius * 0.8;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + Math.cos(needleAngle) * needleLength,
            centerY + Math.sin(needleAngle) * needleLength
        );
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Draw center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c3e50';
        ctx.fill();
        
        // Draw confidence indicator if provided
        if (confidence > 0) {
            const confidenceRadius = radius + 25;
            const confidenceAngle = (confidence / 100) * Math.PI;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, confidenceRadius, Math.PI, Math.PI + confidenceAngle);
            ctx.strokeStyle = confidence > 70 ? '#27ae60' : confidence > 40 ? '#f39c12' : '#e74c3c';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    }
}

// Export for use in other files
window.ApiClient = ApiClient;
window.LoadingManager = LoadingManager;
window.Toast = Toast;
window.DateUtils = DateUtils;
window.NumberUtils = NumberUtils;
window.Validators = Validators;
window.FormUtils = FormUtils;
window.ChartUtils = ChartUtils;
window.FoulingGauge = FoulingGauge;