// 工作生活助手 · 移动版 Service Worker
// 仅在 http(s)/localhost 下由 main.js 注册；file:// 自动跳过。
// 策略：首屏静态资源预缓存；其余同源 GET 采用缓存优先（cache-first），离线可打开，网络更新后回写缓存。
const CACHE = 'worklife-mobile-v3';
const PRECACHE = [
  './',
  './index.html',
  './css/mobile.css',
  './js/main.js',
  './js/views/home.js',
  './js/views/today.js',
  './js/views/ledger.js',
  './js/views/quiz.js',
  './js/views/devwork.js',
  './js/views/group.js',
  './js/views/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // IndexedDB / 备份下载等动态请求不拦截缓存
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
