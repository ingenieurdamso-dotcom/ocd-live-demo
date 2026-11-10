import express from "express";
import path from "node:path";
import { AppError } from "./store.mjs";
import { token, sha, verifyPassword, securityHeaders } from "./security.mjs";
// Hôtes considérés comme non publics : loopback, localhost, *.local, réseaux
// privés IPv4 (RFC 1918), lien local, et IPv6 loopback / ULA / lien local.
export function isNonPublicHost(hostname) {
  const h = String(hostname)
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local"))
    return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1, 3).map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (h.includes(":"))
    return (
      h === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(h) ||
      /^fe[89ab][0-9a-f]:/.test(h)
    );
  return false;
}
export function createApp({
  store,
  credentials,
  origin,
  now = () => Date.now(),
  dist = path.resolve("dist"),
  production = false,
  trustProxy = 0,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Derrière un proxy TLS (Render), req.ip doit être l’adresse du client et
  // non celle du proxy, sinon tous les visiteurs partagent les mêmes quotas.
  // On ne fait confiance qu’au nombre de sauts explicitement configuré
  // (TRUST_PROXY) ; par défaut X-Forwarded-For est ignoré.
  app.set(
    "trust proxy",
    Number.isInteger(trustProxy) && trustProxy > 0 ? trustProxy : false,
  );
  app.use(securityHeaders);
  const trusted = new URL(origin).origin;
  const secure = trusted.startsWith("https:");
  // Mutations : Origin doit être exactement APP_ORIGIN. Hors production
  // seulement, une page servie par ce même serveur via une adresse NON
  // publique (loopback, réseau local privé, .local) est aussi acceptée, pour
  // tester depuis un téléphone sur le Wi-Fi. Ce relâchement ne s’applique
  // jamais en production ni à un nom d’hôte public : il ne peut donc pas
  // servir de contournement CSRF sur la démo en ligne.
  const browserOnThisHost = (req) => {
    const sent = req.headers.origin;
    if (sent === trusted) return true;
    if (production) return false;
    if (typeof sent !== "string" || sent.length === 0) return false;
    let url;
    try {
      url = new URL(sent);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!isNonPublicHost(url.hostname)) return false;
    const hostHeader = req.headers.host;
    return typeof hostHeader === "string" && url.host === hostHeader;
  };
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const sessions = new Map(),
    limits = new Map();
  function rate(scope, max, window) {
    return (req, res, next) => {
      const at = now();
      for (const [k, v] of limits) if (v.until <= at) limits.delete(k);
      const key = scope + ":" + req.ip;
      let b = limits.get(key);
      if (!b) {
        if (limits.size > 10000)
          return res
            .status(503)
            .json({ code: "BUSY", message: "Service temporairement occupé." });
        b = { count: 0, until: at + window };
        limits.set(key, b);
      }
      if (++b.count > max) {
        res.set("Retry-After", String(Math.ceil((b.until - at) / 1000)));
        return res.status(429).json({
          code: "RATE_LIMIT",
          message: "Trop de tentatives. Réessayez dans quelques minutes.",
        });
      }
      next();
    };
  }
  app.use("/api", rate("api", 600, 60000));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!browserOnThisHost(req))
        return res.status(403).json({
          code: "ORIGIN",
          message: "Origine de la requête non autorisée. Rechargez cette page.",
        });
      if (!req.is("application/json"))
        return res.status(415).json({
          code: "CONTENT_TYPE",
          message: "Une requête JSON est requise.",
        });
    }
    next();
  });
  app.use("/api", express.json({ limit: "16kb", strict: true }));
  function session(req, res, next) {
    for (const [k, s] of sessions) if (s.expires <= now()) sessions.delete(k);
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("ocd_session="))
      ?.slice(12);
    const s = cookie ? sessions.get(sha(cookie)) : null;
    if (!s)
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Connectez-vous à l’espace équipe.",
      });
    req.adminSession = s;
    req.sessionKey = sha(cookie);
    if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.csrf)
      return res.status(403).json({
        code: "CSRF",
        message: "Session de formulaire invalide. Rechargez et réessayez.",
      });
    next();
  }
  app.get("/api/catalog", (_req, res) =>
    res.json({
      packs: store.catalog,
      demo: true,
      timezone: "Africa/Lome",
      hours: "09:00–21:00",
      holdHours: 24,
    }),
  );
  app.get("/api/availability", (req, res) =>
    res.json(store.availability(req.query.date, req.query.pack)),
  );
  app.post("/api/bookings", rate("booking", 30, 3600000), (req, res) =>
    res
      .status(201)
      .json(
        store.create(
          req.body,
          req.headers["idempotency-key"],
          sha(credentials.hash + ":" + (req.ip || "unknown")),
        ),
      ),
  );
  app.get("/api/booking/:token", (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token))
      throw new AppError(404, "NOT_FOUND", "Demande introuvable.");
    res.json(store.get(req.params.token));
  });
  app.post(
    "/api/booking/:token/respond",
    rate("respond", 40, 3600000),
    (req, res) => res.json(store.respond(req.params.token, req.body?.accept)),
  );
  app.post("/api/admin/login", rate("login", 8, 900000), (req, res) => {
    const body = req.body || {};
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password =
      typeof body.password === "string" ? body.password.trim() : "";
    const valid = verifyPassword(password, credentials);
    if (username.toLowerCase() !== credentials.username || !valid)
      return res.status(401).json({
        code: "LOGIN",
        message: "Identifiant ou mot de passe incorrect.",
      });
    for (const [k, s] of sessions) if (s.expires <= now()) sessions.delete(k);
    if (sessions.size >= 100)
      throw new AppError(503, "BUSY", "Trop de sessions actives.");
    const raw = token(),
      csrf = token();
    sessions.set(sha(raw), { csrf, expires: now() + 8 * 3600000 });
    res.cookie("ocd_session", raw, {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/api/admin",
      maxAge: 8 * 3600000,
    });
    res.json({ csrf, username: credentials.username });
  });
  app.get("/api/admin/session", session, (req, res) =>
    res.json({ csrf: req.adminSession.csrf, username: credentials.username }),
  );
  app.post("/api/admin/logout", session, (req, res) => {
    sessions.delete(req.sessionKey);
    res.clearCookie("ocd_session", {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/api/admin",
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/bookings", session, (_req, res) =>
    res.json({ bookings: store.list() }),
  );
  app.post("/api/admin/bookings/:id/action", session, (req, res) =>
    res.json(store.action(req.params.id, req.body || {})),
  );
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ code: "NOT_FOUND", message: "Ressource introuvable." }),
  );
  app.use(
    express.static(dist, {
      index: false,
      dotfiles: "deny",
      etag: true,
      setHeaders(res) {
        res.set("Cache-Control", "no-store");
      },
    }),
  );
  app.get("/{*splat}", (req, res) => {
    if (path.extname(req.path))
      return res.status(404).type("text").send("Fichier introuvable");
    res.sendFile(path.join(dist, "index.html"));
  });
  app.use((err, req, res, _next) => {
    const status =
      err instanceof AppError
        ? err.status
        : err.type === "entity.too.large"
          ? 413
          : err.type === "entity.parse.failed"
            ? 400
            : 500;
    res.status(status).json({
      code:
        err.code && err instanceof AppError
          ? err.code
          : status === 413
            ? "TOO_LARGE"
            : status === 400
              ? "INVALID_JSON"
              : "INTERNAL",
      message:
        err instanceof AppError
          ? err.message
          : status === 413
            ? "Dossier trop volumineux."
            : status === 400
              ? "Corps JSON invalide."
              : "Une erreur interne est survenue. Réessayez sans modifier le dossier.",
    });
  });
  return app;
}
