export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registriert:", registration);
      })
      .catch((error) => {
        console.error("Service Worker Fehler:", error);
      });
  });
}
