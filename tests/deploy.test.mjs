import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { createApp, isNonPublicHost } from "../server/app.mjs";
import { createStore } from "../server/store.mjs";
import { hashPassword } from "../server/security.mjs";
import { loadConfig, ConfigError } from "../server/config.mjs";
import { Header } from "../src/components.tsx";
import { LegalNotice } from "../src/LegalNotice.tsx";
import { keyFor } from "./test-keys.mjs";

const root = path.resolve(import.meta.dirname, "..");
const password = "test-only-random-enough-password";
const payload = (start) => ({
  pack: "decouverte",
  mode: "studio",
  start,
  name: "Amina Démo",
  email: "amina@example.test",
  phone: "+228 90000000",
  country: "Togo",
  tiktok: "@amina.demo",
  instagram: "",
  business: "Atelier Démo",
  category: "Artisanat",
  description: "Description fictive pour la démonstration.",
  consent: true,
});

async function serve(options) {
  const clock = Date.parse("2026-11-08T08:00:00Z");
  const store = createStore({ filename: ":memory:", now: () => clock });
  const app = createApp({
    store,
    credentials: { username: "admin", ...hashPassword(password) },
    now: () => clock,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    store,
    post: (p, body, headers = {}) =>
      fetch(url + p, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    close() {
      server.closeAllConnections();
      server.close();
      store.close();
    },
  };
}

test("bandeau de démonstration en haut de chaque page (Header)", () => {
  // React 19 peut ajouter un <link rel="preload"> hissé avant le contenu.
  const html = render(React.createElement(Header)).replace(
    /^(<link[^>]*>)+/,
    "",
  );
  assert.ok(html.startsWith('<div class="demo-bar"'), html.slice(0, 60));
  assert.match(html, /Proposition d’Adama ·\s+Démonstration non officielle/);
  assert.ok(html.includes("Aucun paiement ni email réel"));
});

test("index.html contient le bandeau avant même le chargement du script", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8").replace(
    /\s+/g,
    " ",
  );
  assert.ok(html.includes('class="demo-bar"'));
  assert.ok(
    html.includes("Proposition d’Adama · Démonstration non officielle"),
  );
  assert.ok(html.includes("Aucun paiement ni email réel"));
});

test("mentions légales : hébergeur Render, aucun TODO, ni email ni téléphone", () => {
  const html = render(React.createElement(LegalNotice));
  assert.ok(html.includes("Render Services, Inc. — render.com"));
  assert.ok(
    html.includes(
      "Démonstration non officielle préparée par Adama BAMBA, Ouagadougou, Burkina Faso",
    ),
  );
  assert.equal(/TODO/i.test(html), false);
  assert.equal(/@|Téléphone|Courriel/i.test(html), false);
});

test("santé : GET /api/health répond 200", async () => {
  const s = await serve({ origin: "http://127.0.0.1:4173" });
  try {
    const r = await fetch(s.url + "/api/health");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: "ok" });
  } finally {
    s.close();
  }
});

test("production : seule l’origine APP_ORIGIN exacte est acceptée", async () => {
  const origin = "https://ocd-live.onrender.com";
  const s = await serve({ origin, production: true });
  try {
    for (const Origin of [
      s.url,
      "https://evil.test",
      "null",
      "http://ocd-live.onrender.com",
    ]) {
      const r = await s.post("/api/bookings", payload("2026-11-09T09:00:00Z"), {
        Origin,
        "Idempotency-Key": keyFor("key-00000001"),
      });
      assert.equal(r.status, 403, Origin);
    }
    // Origine et Host identiques mais publics (rebinding DNS) : refusé.
    const rebinding = await s.post(
      "/api/bookings",
      payload("2026-11-09T09:00:00Z"),
      {
        Origin: "http://evil.test",
        Host: "evil.test",
        "Idempotency-Key": keyFor("key-00000001"),
      },
    );
    assert.equal(rebinding.status, 403);
    assert.equal(s.store.list().length, 0);
    const ok = await s.post("/api/bookings", payload("2026-11-09T09:00:00Z"), {
      Origin: origin,
      "Idempotency-Key": keyFor("key-00000002"),
    });
    assert.equal(ok.status, 201);
    const login = await s.post(
      "/api/admin/login",
      { username: "admin", password },
      { Origin: origin },
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  } finally {
    s.close();
  }
});

test("hors production : relâchement même-hôte limité aux hôtes non publics", async () => {
  const s = await serve({ origin: "http://127.0.0.1:4173" });
  try {
    const pub = await s.post("/api/bookings", payload("2026-11-09T09:00:00Z"), {
      Origin: "http://evil.test",
      Host: "evil.test",
      "Idempotency-Key": keyFor("key-00000001"),
    });
    assert.equal(pub.status, 403);
    const lan = await s.post("/api/bookings", payload("2026-11-09T09:00:00Z"), {
      Origin: s.url,
      "Idempotency-Key": keyFor("key-00000002"),
    });
    assert.equal(lan.status, 201);
  } finally {
    s.close();
  }
  for (const h of [
    "127.0.0.1",
    "localhost",
    "192.168.11.105",
    "10.0.0.2",
    "172.20.1.1",
    "[::1]",
    "pc.local",
  ])
    assert.equal(isNonPublicHost(h), true, h);
  for (const h of [
    "evil.test",
    "8.8.8.8",
    "172.32.0.1",
    "ocd-live.onrender.com",
    "localhost.evil.test",
  ])
    assert.equal(isNonPublicHost(h), false, h);
});

test("proxy : sans TRUST_PROXY, X-Forwarded-For est ignoré ; avec 1 saut, quotas par client", async () => {
  const origin = "https://ocd-live.onrender.com";
  const attempt = (s, xff) =>
    s.post(
      "/api/admin/login",
      { username: "admin", password: "mauvais-mot-de-passe" },
      { Origin: origin, "X-Forwarded-For": xff },
    );
  const direct = await serve({ origin, production: true });
  try {
    for (let i = 0; i < 8; i++)
      assert.equal((await attempt(direct, `203.0.113.${i}`)).status, 401);
    // Un client ne peut pas contourner la limite en changeant X-Forwarded-For.
    assert.equal((await attempt(direct, "198.51.100.1")).status, 429);
  } finally {
    direct.close();
  }
  const proxied = await serve({ origin, production: true, trustProxy: 1 });
  try {
    for (let i = 0; i < 8; i++)
      assert.equal((await attempt(proxied, "203.0.113.7")).status, 401);
    assert.equal((await attempt(proxied, "203.0.113.7")).status, 429);
    // Un autre visiteur (adresse ajoutée par le proxy) garde son propre quota,
    // même si son navigateur envoie un X-Forwarded-For forgé à gauche.
    assert.equal(
      (await attempt(proxied, "203.0.113.7, 198.51.100.9")).status,
      401,
    );
  } finally {
    proxied.close();
  }
});

test("configuration : production exige identifiants forts, origine et rien par défaut", () => {
  const base = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://ocd-live.onrender.com",
    ADMIN_USERNAME: "Adama",
    ADMIN_PASSWORD: "x".repeat(16),
  };
  const ok = loadConfig({
    ...base,
    PORT: "10000",
    HOST: "0.0.0.0",
    TRUST_PROXY: "1",
  });
  assert.equal(ok.port, 10000);
  assert.equal(ok.host, "0.0.0.0");
  assert.equal(ok.trustProxy, 1);
  assert.equal(ok.admin.username, "adama");
  assert.equal(loadConfig({ ...base, TRUST_PROXY: undefined }).trustProxy, 0);
  assert.equal(
    loadConfig({
      ...base,
      APP_ORIGIN: undefined,
      RENDER_EXTERNAL_URL: "https://x.onrender.com",
    }).origin,
    "https://x.onrender.com",
  );
  for (const bad of [
    { ADMIN_PASSWORD: undefined },
    { ADMIN_USERNAME: undefined },
    { ADMIN_USERNAME: undefined, ADMIN_PASSWORD: undefined },
    { ADMIN_PASSWORD: "x".repeat(15) },
    { APP_ORIGIN: undefined },
    { APP_ORIGIN: "https://x.onrender.com/chemin" },
    { TRUST_PROXY: "true" },
    { PORT: "abc" },
  ])
    assert.throws(
      () => loadConfig({ ...base, ...bad }),
      ConfigError,
      JSON.stringify(bad),
    );
  // Hors production : pas d’identifiants requis (bootstrap local).
  assert.equal(loadConfig({}).admin, null);
  assert.equal(loadConfig({}).origin, "http://127.0.0.1:4173");
});

test("démarrage production refusé sans identifiants, sans divulguer le mot de passe", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ocd-prod-"));
  try {
    const secret = "court-secret";
    const run = spawnSync(process.execPath, ["server/index.mjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        APP_ORIGIN: "http://127.0.0.1:4999",
        PORT: "4999",
        OCD_DATA_DIR: dir,
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD: secret,
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /ADMIN_PASSWORD trop court/);
    assert.equal((run.stdout + run.stderr).includes(secret), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render.yaml : service web Node gratuit à Francfort, secrets non synchronisés", () => {
  const yaml = readFileSync(path.join(root, "render.yaml"), "utf8");
  for (const line of [
    "type: web",
    "runtime: node",
    "plan: free",
    "region: frankfurt",
    "healthCheckPath: /api/health",
    "npm ci --include=dev && npm run build",
  ])
    assert.ok(yaml.includes(line), line);
  for (const key of ["ADMIN_USERNAME", "ADMIN_PASSWORD", "APP_ORIGIN"])
    assert.match(yaml, new RegExp(`key: ${key}\\n\\s+sync: false`), key);
  assert.equal(/value:.*(password|secret)/i.test(yaml), false);
});
