/* Service worker: chỉ nhận thông báo đẩy và mở lại phần mềm khi bấm vào thông báo.
   Cố ý KHÔNG lưu đệm (cache) trang nào, để mỗi lần triển khai bản mới người dùng luôn thấy bản mới. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Nhắc việc';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-32.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/?p=my' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/?p=my', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* bỏ qua */ } } return; }
    }
    await self.clients.openWindow(url);
  })());
});
