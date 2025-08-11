// Service Worker for Vessel Fouling Management System
const CACHE_NAME = 'vessel-fouling-v1.0.0';
const STATIC_CACHE_NAME = 'vessel-fouling-static-v1.0.0';
const API_CACHE_NAME = 'vessel-fouling-api-v1.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/dashboard.js',
    '/js/utils.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints to cache
const API_ENDPOINTS = [
    '/api/auth/me',
    '/api/vessels',
    '/api/notifications/status'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        Promise.all([
            // Cache static files
            caches.open(STATIC_CACHE_NAME)
                .then((cache) => cache.addAll(STATIC_FILES))
                .catch((error) => {
                    console.error('Failed to cache static files:', error);
                }),
            
            // Skip waiting to activate immediately
            self.skipWaiting()
        ])
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE_NAME && 
                            cacheName !== API_CACHE_NAME &&
                            cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // Take control of all pages
            self.clients.claim()
        ])
    );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Handle different types of requests
    if (request.method === 'GET') {
        if (url.pathname.startsWith('/api/')) {
            // API requests - network first, then cache
            event.respondWith(handleApiRequest(request));
        } else {
            // Static files - cache first, then network
            event.respondWith(handleStaticRequest(request));
        }
    } else {
        // Non-GET requests - always try network
        event.respondWith(handleNetworkRequest(request));
    }
});

// Handle API requests - network first strategy
async function handleApiRequest(request) {
    const url = new URL(request.url);
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache successful GET responses
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('Network request failed, trying cache:', url.pathname);
        
        // Try cache if network fails
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline response for specific endpoints
        return getOfflineResponse(url.pathname);
    }
}

// Handle static requests - cache first strategy
async function handleStaticRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Try network if not in cache
        const networkResponse = await fetch(request);
        
        // Cache the response
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('Failed to fetch static resource:', request.url);
        
        // Return offline page for navigation requests
        if (request.destination === 'document') {
            const cache = await caches.open(STATIC_CACHE_NAME);
            return cache.match('/index.html');
        }
        
        throw error;
    }
}

// Handle network requests (POST, PUT, DELETE, etc.)
async function handleNetworkRequest(request) {
    try {
        return await fetch(request);
    } catch (error) {
        console.log('Network request failed:', request.url);
        
        // For offline situations, you could queue requests here
        // and process them when back online
        
        throw error;
    }
}

// Generate offline responses for specific API endpoints
function getOfflineResponse(pathname) {
    const offlineData = {
        '/api/vessels': {
            error: 'Offline',
            message: 'Vessel data not available offline',
            offline: true
        },
        '/api/auth/me': {
            error: 'Offline',
            message: 'Authentication check not available offline',
            offline: true
        }
    };
    
    const data = offlineData[pathname];
    
    if (data) {
        return new Response(JSON.stringify(data), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'application/json',
                'X-Offline': 'true'
            }
        });
    }
    
    // Default offline response
    return new Response(JSON.stringify({
        error: 'Offline',
        message: 'This feature requires an internet connection',
        offline: true
    }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
            'Content-Type': 'application/json',
            'X-Offline': 'true'
        }
    });
}

// Handle background sync (if supported)
self.addEventListener('sync', (event) => {
    console.log('Background sync triggered:', event.tag);
    
    if (event.tag === 'fuel-readings-sync') {
        event.waitUntil(syncFuelReadings());
    }
});

// Sync fuel readings when back online
async function syncFuelReadings() {
    try {
        // This would sync any stored offline readings
        console.log('Syncing fuel readings...');
        
        // Implementation would check IndexedDB for offline readings
        // and POST them to the server
        
    } catch (error) {
        console.error('Failed to sync fuel readings:', error);
    }
}

// Handle push notifications (if implemented)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'Fuel check reminder',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            tag: 'fuel-reminder',
            requireInteraction: true,
            actions: [
                {
                    action: 'open',
                    title: 'Open App'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Vessel Fouling Alert', options)
        );
        
    } catch (error) {
        console.error('Failed to show notification:', error);
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0].postMessage({
                type: 'VERSION',
                version: CACHE_NAME
            });
            break;
            
        case 'CACHE_URLS':
            event.waitUntil(
                caches.open(STATIC_CACHE_NAME)
                    .then(cache => cache.addAll(data.urls))
                    .then(() => event.ports[0].postMessage({ success: true }))
                    .catch(error => event.ports[0].postMessage({ success: false, error }))
            );
            break;
    }
});

console.log('Service Worker loaded successfully');