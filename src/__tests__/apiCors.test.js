/**
 * CORS der API: „Konto löschen“ ruft DELETE /api/account auf. In der iOS-App ist das eine Anfrage von einem
 * fremden Origin (capacitor://localhost → Vercel) mit Preflight — fehlt DELETE in Access-Control-Allow-Methods,
 * blockiert die WebView die Anfrage und das Konto lässt sich auf dem Gerät nicht löschen.
 */
const { applyCors, handleCorsPreflight, CORS_ALLOWED_METHODS } = require("../../api/_lib/cors");
const vercelConfig = require("../../vercel.json");

function fakeRes() {
  const headers = {};
  const res = {
    headers,
    statusCode: null,
    ended: false,
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    end: () => {
      res.ended = true;
    },
  };
  return res;
}

const methodsOf = (value) => String(value).split(",").map((m) => m.trim());

describe("API-CORS", () => {
  it("erlaubt jede Methode, die ein Endpunkt nutzt — auch DELETE (/api/account)", () => {
    const res = fakeRes();
    applyCors({}, res);
    expect(methodsOf(res.headers["access-control-allow-methods"])).toEqual(expect.arrayContaining(["GET", "POST", "DELETE", "OPTIONS"]));
    expect(res.headers["access-control-allow-headers"]).toMatch(/Authorization/);
    expect(methodsOf(CORS_ALLOWED_METHODS)).toContain("DELETE");
  });

  it("Preflight (OPTIONS) wird mit 200 und denselben Methoden beantwortet", () => {
    const res = fakeRes();
    expect(handleCorsPreflight({ method: "OPTIONS" }, res)).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
    expect(methodsOf(res.headers["access-control-allow-methods"])).toContain("DELETE");
  });

  it("kein Preflight: Anfrage läuft weiter, Header sind gesetzt", () => {
    const res = fakeRes();
    expect(handleCorsPreflight({ method: "DELETE" }, res)).toBe(false);
    expect(res.ended).toBe(false);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("vercel.json setzt für /api/* dieselben Methoden wie der Code", () => {
    const rule = vercelConfig.headers.find((h) => h.source === "/api/(.*)");
    const header = rule.headers.find((h) => h.key === "Access-Control-Allow-Methods");
    expect(methodsOf(header.value).sort()).toEqual(methodsOf(CORS_ALLOWED_METHODS).sort());
  });
});
