const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: `http://localhost:${process.env.AI_SERVER_PORT || 8787}`,
      changeOrigin: true,
    })
  );
};
