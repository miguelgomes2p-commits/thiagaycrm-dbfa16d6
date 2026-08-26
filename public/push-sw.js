/**
 * Handlers de Web Push — importado pelo Service Worker do Workbox (importScripts).
 * Camada 100% aditiva: não interfere em cache, update ou navegação da PWA.
 */
/* eslint-disable no-undef */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Lupus CRM", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Lupus CRM";
  const data = payload.data || {};
  const options = {
    body: (payload.body || "").slice(0, 140),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.conversation_id ? `conv:${data.conversation_id}` : undefined,
    renotify: true,
    data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.conversation_id
    ? `/app/conversations?c=${encodeURIComponent(data.conversation_id)}`
    : "/app";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
            return;
          } catch {
            /* fallback abaixo */
          }
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
