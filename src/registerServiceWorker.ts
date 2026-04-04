export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .then(() => {
        if ("caches" in window) {
          return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
        }
        return undefined;
      })
      .then(() => {
        console.log("Service Worker deaktiviert und Cache bereinigt.");
      })
      .catch((error) => {
        console.error("Service Worker Fehler:", error);
      });
  });
}
