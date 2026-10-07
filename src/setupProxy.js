const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    createProxyMiddleware({
      pathFilter: "/api",
      // 127.0.0.1 statt localhost: der API-Server bindet nur auf IPv4-Loopback (server/index.js), und
      // `localhost` kann unter aktuellen Node-Versionen zuerst auf ::1 auflösen.
      target: `http://127.0.0.1:${process.env.AI_SERVER_PORT || 8787}`,
      changeOrigin: true,
    })
  );
};
