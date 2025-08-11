// Main application entry point
class App {
    static init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', this.onReady.bind(this));
        } else {
            this.onReady();
        }
    }
    
    static onReady() {
        console.log('🚢 Vessel Fouling Management System - Starting...');
        
        // Initialize modules
        this.initializeModules();
        
        // Set up global error handling
        this.setupErrorHandling();
        
        // Register service worker for PWA
        this.registerServiceWorker();
        
        console.log('✅ Application initialized successfully');
    }
    
    static initializeModules() {
        // Initialize authentication
        if (window.Auth) {
            Auth.init();
        } else {
            console.error('Auth module not loaded');
        }
        
        // Other modules will be initialized by Auth when needed
    }
    
    static setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            
            // Don't show toast for every error, just log them
            if (event.error && event.error.message) {
                // Only show user-friendly errors
                if (event.error.message.includes('fetch') || 
                    event.error.message.includes('network')) {
                    Toast.error('Network error. Please check your connection.');
                }
            }
        });
        
        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            
            // Prevent default browser behavior
            event.preventDefault();
            
            // Show user-friendly error for API failures
            if (event.reason && typeof event.reason === 'object') {
                if (event.reason.message && !event.reason.message.includes('AbortError')) {
                    Toast.error('An error occurred. Please try again.');
                }
            }
        });
        
        // Handle offline/online status
        window.addEventListener('online', () => {
            Toast.success('Connection restored');
            // Trigger sync if offline functionality is implemented
        });
        
        window.addEventListener('offline', () => {
            Toast.warning('Connection lost. Working offline...');
        });
    }
    
    static async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('Service Worker registered successfully:', registration);
                
                // Handle updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content available, show update notification
                            this.showUpdateNotification();
                        }
                    });
                });
                
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
    
    static showUpdateNotification() {
        // Create a custom update notification
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <span>A new version is available!</span>
                <button id="update-btn" class="btn-secondary">Update</button>
                <button id="dismiss-btn" class="btn-text">Later</button>
            </div>
        `;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            backgroundColor: '#2c3e50',
            color: 'white',
            padding: '1rem',
            zIndex: '4000',
            textAlign: 'center',
            transform: 'translateY(-100%)',
            transition: 'transform 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateY(0)';
        }, 100);
        
        // Handle buttons
        const updateBtn = notification.querySelector('#update-btn');
        const dismissBtn = notification.querySelector('#dismiss-btn');
        
        updateBtn?.addEventListener('click', () => {
            window.location.reload();
        });
        
        dismissBtn?.addEventListener('click', () => {
            notification.style.transform = 'translateY(-100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }
    
    // Utility method to check if app is running as PWA
    static isPWA() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }
    
    // Method to prompt PWA installation
    static async promptPWAInstall() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            
            const choiceResult = await this.deferredPrompt.userChoice;
            
            if (choiceResult.outcome === 'accepted') {
                Toast.success('App installed successfully!');
            }
            
            this.deferredPrompt = null;
        }
    }
    
    // Handle PWA install prompt
    static setupPWAInstall() {
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing
            e.preventDefault();
            
            // Store the event for later use
            this.deferredPrompt = e;
            
            // Show install button or banner
            this.showInstallPrompt();
        });
        
        // Track successful installs
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed successfully');
            Toast.success('App installed successfully!');
            this.deferredPrompt = null;
        });
    }
    
    static showInstallPrompt() {
        // Only show if not already installed
        if (!this.isPWA()) {
            // Could show a custom install banner
            console.log('PWA can be installed');
        }
    }
}

// Initialize the application
App.init();

// Setup PWA install handling
App.setupPWAInstall();

// Export for debugging
window.App = App;