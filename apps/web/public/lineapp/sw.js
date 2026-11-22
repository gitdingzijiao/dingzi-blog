/* 线路台账 Service Worker
 * 目标：断网时也能打开页面本身 ✓
 * 策略：
 *   导航请求 → 网络优先，失败回退缓存（保证拿到最新版）
 *   静态资源（图标/manifest）→ 缓存优先
 *   高德/Leaflet 的 CDN → 缓存优先（离线时地图脚本也能用）
 */
const VERSION = 'lineapp-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 页面导航：网络优先 ✓ 拿到最新版
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 同源静态资源 + CDN 脚本：缓存优先 ✓
  if (url.origin === location.origin ||
      url.hostname.includes('jsdelivr') ||
      url.hostname.includes('amap') ||
      url.hostname.includes('webrd') ||
      url.hostname.includes('webst')) {
    e.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
      })
    );
  }
});
