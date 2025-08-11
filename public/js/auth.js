// Authentication module
class Auth {
    static init() {
        this.bindEvents();
        this.checkAuthState();
    }
    
    static bindEvents() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }
        
        // Signup form
        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', this.handleSignup.bind(this));
        }
        
        // Form switchers
        const showSignup = document.getElementById('show-signup');
        const showLogin = document.getElementById('show-login');
        
        if (showSignup) {
            showSignup.addEventListener('click', this.showSignupForm.bind(this));
        }
        
        if (showLogin) {
            showLogin.addEventListener('click', this.showLoginForm.bind(this));
        }
        
        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }
    }
    
    static checkAuthState() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const user = localStorage.getItem(STORAGE_KEYS.USER);
        
        if (token && user) {
            try {
                const userData = JSON.parse(user);
                this.showDashboard(userData);
            } catch (error) {
                console.error('Invalid stored user data:', error);
                this.logout();
            }
        } else {
            this.showLogin();
        }
    }
    
    static async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            Toast.error('Please fill in all fields');
            return;
        }
        
        if (!Validators.isValidEmail(email)) {
            Toast.error('Please enter a valid email address');
            return;
        }
        
        LoadingManager.show('Signing in...');
        
        try {
            const response = await ApiClient.post('/auth/login', {
                email,
                password
            });
            
            // Store auth data
            localStorage.setItem(STORAGE_KEYS.TOKEN, response.token);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refreshToken);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.user));
            
            Toast.success('Welcome back!');
            this.showDashboard(response.user);
            
        } catch (error) {
            console.error('Login failed:', error);
            Toast.error(error.message || 'Login failed. Please try again.');
        } finally {
            LoadingManager.hide();
        }
    }
    
    static async handleSignup(event) {
        event.preventDefault();
        
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();
        const password = document.getElementById('signup-password').value;
        const notificationPreference = document.getElementById('notification-preference').value;
        
        if (!name || !email || !password) {
            Toast.error('Please fill in all required fields');
            return;
        }
        
        if (!Validators.isValidEmail(email)) {
            Toast.error('Please enter a valid email address');
            return;
        }
        
        if (password.length < 8) {
            Toast.error('Password must be at least 8 characters long');
            return;
        }
        
        if (phone && !Validators.isValidPhone(phone)) {
            Toast.error('Please enter a valid phone number');
            return;
        }
        
        if (notificationPreference === 'SMS' && !phone) {
            Toast.error('Phone number is required for SMS notifications');
            return;
        }
        
        LoadingManager.show('Creating account...');
        
        try {
            const response = await ApiClient.post('/auth/signup', {
                name,
                email,
                phone: phone || null,
                password,
                notification_preference: notificationPreference,
                notification_interval: 6
            });
            
            // Store auth data
            localStorage.setItem(STORAGE_KEYS.TOKEN, response.token);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refreshToken);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.user));
            
            Toast.success('Account created successfully! Welcome aboard!');
            this.showDashboard(response.user);
            
        } catch (error) {
            console.error('Signup failed:', error);
            Toast.error(error.message || 'Account creation failed. Please try again.');
        } finally {
            LoadingManager.hide();
        }
    }
    
    static showLoginForm() {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        
        if (loginForm && signupForm) {
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
        }
    }
    
    static showSignupForm() {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        
        if (loginForm && signupForm) {
            loginForm.classList.remove('active');
            signupForm.classList.add('active');
        }
    }
    
    static showLogin() {
        const loginScreen = document.getElementById('login-screen');
        const dashboardScreen = document.getElementById('dashboard-screen');
        
        if (loginScreen && dashboardScreen) {
            loginScreen.classList.add('active');
            dashboardScreen.classList.remove('active');
        }
        
        // Clear forms
        const forms = document.querySelectorAll('.auth-form');
        forms.forEach(form => {
            const inputs = form.querySelectorAll('input');
            inputs.forEach(input => input.value = '');
        });
    }
    
    static showDashboard(user) {
        const loginScreen = document.getElementById('login-screen');
        const dashboardScreen = document.getElementById('dashboard-screen');
        
        if (loginScreen && dashboardScreen) {
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
        }
        
        // Initialize dashboard with user data
        if (window.Dashboard) {
            window.Dashboard.init(user);
        }
    }
    
    static logout() {
        // Clear stored data
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.SELECTED_VESSEL);
        
        // Show login screen
        this.showLogin();
        
        // Clean up dashboard
        if (window.Dashboard) {
            window.Dashboard.cleanup();
        }
        
        Toast.success('Logged out successfully');
    }
    
    static getCurrentUser() {
        try {
            const userData = localStorage.getItem(STORAGE_KEYS.USER);
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }
    
    static isAuthenticated() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const user = localStorage.getItem(STORAGE_KEYS.USER);
        return !!(token && user);
    }
    
    static async updateUserProfile(data) {
        try {
            const response = await ApiClient.put('/auth/profile', data);
            
            // Update stored user data
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.user));
            
            Toast.success('Profile updated successfully');
            return response.user;
            
        } catch (error) {
            console.error('Profile update failed:', error);
            Toast.error(error.message || 'Failed to update profile');
            throw error;
        }
    }
}

// Export for global use
window.Auth = Auth;