var CACHE_NAME = 'clps-nice-calculator-v1';
var urlsToCache = [
    './',
    'style.css',
    'index.html',
    'script.js',
    'emoji.js',
    'help.html',
    'help.css',
    'vue.js',
    'decimal.min.js',
    'hammer.js',
    'vue-hammer.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
        //  return response;
        }
        return fetch(event.request);
      }
    )
  );
});
