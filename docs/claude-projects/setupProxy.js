const { createProxyMiddleware } = require("http-proxy-middleware");

const API_TARGET = `http://localhost:${process.env.AI_SERVER_PORT || 8787}`;
const API_PROXY_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

module.exports = function setupProxy(app) {
  app.use(
    createProxyMiddleware({
      target: API_TARGET,
      changeOrigin: true,
      // Single /api context — all routes (ai, onboarding/preferences-patches,
      // onboarding/generate-plan, account), all HTTP methods.
      pathFilter: (pathname, req) =>
        pathname.startsWith("/api") &&
        API_PROXY_METHODS.has(String(req.method || "GET").toUpperCase()),
      pathRewrite: { "^/api": "" },
    }),
  );
};
