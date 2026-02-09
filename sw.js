const CACHE_NAME = 'nexus-flow-v9'; // Incremented to v9 for PDF title fix
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/utils.js',
    './js/services/firebase-config.js',
    './js/services/store.js',
    './js/services/auth.js',
    './js/components/ui.js',
    './js/components/integrations.js',
    './js/components/navbar.js',
    './js/components/landing.js',
    './js/components/login.js',
    './js/components/dashboard.js',
    './js/components/project.js',
    './js/components/shared.js',
    './js/components/help.js',
    './assets/nexus_logo_v3.png', // Changed from logo.jpg to v3 png
    './manifest.json' // Explicitly cache manifest
];

// Install Event: Cache core assets
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force activate new SW immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all: app shell and content');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Immediately control all pages
});

// Fetch Event: Serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
