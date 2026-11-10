import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const text = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("manifest installable avec vraies icônes et langue française", () => {
  const m = JSON.parse(text("public/manifest.webmanifest"));
  assert.equal(m.display, "standalone");
  assert.equal(m.lang, "fr");
  assert.ok(m.icons.some((i) => i.sizes === "192x192"));
  assert.ok(m.icons.some((i) => i.sizes === "512x512"));
  for (const i of m.icons)
    assert.ok(
      readFileSync(new URL("../public" + i.src, import.meta.url)).length > 100,
    );
});
test("serviceworker allowlist et aucune API ni réservation mise en cache", () => {
  const sw = text("public/sw.js");
  assert.match(sw, /\/api\//);
  assert.match(sw, /ALLOWLIST/);
  assert.match(sw, /offline.html/);
  assert.ok(!sw.includes("cache.put("));
  assert.ok(!sw.includes("localStorage"));
  assert.match(text("public/offline.html"), /Aucune demande/);
  assert.match(text("public/offline.html"), /connexion/);
});
test("auth admin serveur ne contient pas de mot de passe public et logout efface état", () => {
  const code = text("src/Admin.tsx");
  assert.match(code, /admin\/login/);
  assert.match(code, /setBookings\(\[\]\)/);
  assert.ok(!text("public/sw.js").includes("credentials"));
  assert.ok(!text("src/api.ts").includes("localStorage"));
});

test("SW exécuté : API ignorée et navigation hors connexion sur écran sans données", async () => {
  const listeners = {};
  let cached = [];
  const offline = { safe: true };
  const caches = {
    open: async () => ({
      addAll: async (list) => {
        cached = [...list];
      },
    }),
    keys: async () => ["ocd-safe-shell-v1"],
    match: async (key) => (key === "/offline.html" ? offline : undefined),
    delete: async () => true,
  };
  const self = {
    location: { origin: "http://127.0.0.1:4173" },
    clients: { claim: async () => {} },
    skipWaiting() {},
    addEventListener: (name, handler) => {
      listeners[name] = handler;
    },
  };
  vm.runInNewContext(text("public/sw.js"), {
    self,
    caches,
    URL,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  let install;
  listeners.install({
    waitUntil: (p) => {
      install = p;
    },
  });
  await install;
  assert.ok(cached.includes("/offline.html"));
  assert.ok(
    !cached.some(
      (s) =>
        s.startsWith("/api") ||
        s.startsWith("/admin") ||
        s.startsWith("/suivi"),
    ),
  );
  let intercepted = false;
  listeners.fetch({
    request: { url: "http://127.0.0.1:4173/api/admin/bookings", method: "GET" },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
  let response;
  listeners.fetch({
    request: {
      url: "http://127.0.0.1:4173/suivi",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => {
      response = p;
    },
  });
  assert.equal(await response, offline);
});

test("activation SW ne supprime pas les caches étrangers à OCD", async () => {
  const listeners = {},
    deleted = [];
  const self = {
    clients: { claim: async () => {} },
    skipWaiting() {},
    addEventListener: (n, f) => {
      listeners[n] = f;
    },
  };
  const caches = {
    keys: async () => [
      "ocd-safe-shell-v0",
      "other-app-cache",
      "ocd-safe-shell-v1",
    ],
    delete: async (k) => {
      deleted.push(k);
    },
  };
  vm.runInNewContext(text("public/sw.js"), { self, caches, URL });
  let done;
  listeners.activate({
    waitUntil: (p) => {
      done = p;
    },
  });
  await done;
  assert.deepEqual(deleted, ["ocd-safe-shell-v0"]);
});
