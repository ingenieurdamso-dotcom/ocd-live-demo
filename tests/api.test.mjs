import { keyFor } from "./test-keys.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { createStore } from "../server/store.mjs";
import { hashPassword } from "../server/security.mjs";
const password = "test-only-random-enough-password";
async function setup(extra = {}) {
  let clock = Date.parse("2026-11-08T08:00:00Z");
  const store = createStore({ filename: ":memory:", now: () => clock });
  const origin = "http://127.0.0.1:4173";
  const app = createApp({
    store,
    credentials: { username: "admin", ...hashPassword(password) },
    origin,
    now: () => clock,
    ...extra,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, opt = {}) =>
    fetch(url + path, {
      ...opt,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...opt.headers,
      },
    });
  return {
    store,
    url,
    request,
    close: () => {
      server.closeAllConnections();
      server.close();
      store.close();
    },
    advance: (ms) => (clock += ms),
  };
}
const payload = {
  pack: "decouverte",
  mode: "studio",
  start: "2026-11-09T09:00:00Z",
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
};
async function login(s) {
  const r = await s.request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password }),
  });
  assert.equal(r.status, 200);
  return {
    Cookie: r.headers.get("set-cookie").split(";")[0],
    "X-CSRF-Token": (await r.json()).csrf,
  };
}
test("catalogue public sans dossier personnel et en-têtes défensifs", async () => {
  const s = await setup();
  try {
    const r = await s.request("/api/catalog");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).packs.length, 6);
    assert.match(
      r.headers.get("content-security-policy"),
      /default-src 'self'/,
    );
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await s.request("/api/bookings")).status, 404);
    assert.equal((await s.request("/api/admin/bookings")).status, 401);
  } finally {
    s.close();
  }
});
test("origine hostile et absence origine rejetées, sans effet", async () => {
  const s = await setup();
  try {
    for (const Origin of ["https://evil.test", "null", ""]) {
      const r = await s.request("/api/bookings", {
        method: "POST",
        headers: { Origin, "Idempotency-Key": keyFor("key-00000001") },
        body: JSON.stringify(payload),
      });
      assert.equal(r.status, 403);
    }
    assert.equal(s.store.list().length, 0);
    const local = await s.request("/api/bookings", {
      method: "POST",
      headers: {
        Origin: s.url,
        "Idempotency-Key": keyFor("key-00000002"),
      },
      body: JSON.stringify(payload),
    });
    assert.equal(local.status, 201);
    assert.equal(s.store.list().length, 1);
  } finally {
    s.close();
  }
});
test("soumissions concurrentes et idempotence HTTP : une seule option", async () => {
  const s = await setup();
  try {
    const results = await Promise.all(
      [1, 2].map((i) =>
        s.request("/api/bookings", {
          method: "POST",
          headers: { "Idempotency-Key": keyFor(`key-0000000${i}`) },
          body: JSON.stringify(payload),
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(s.store.list().length, 1);
    const replay = await s.request("/api/bookings", {
      method: "POST",
      headers: {
        "Idempotency-Key": keyFor(
          `key-0000000${results.findIndex((r) => r.status === 201) + 1}`,
        ),
      },
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 201);
    assert.equal(s.store.list().length, 1);
    const body = await replay.json();
    assert.equal((await s.request("/api/booking/" + body.token)).status, 200);
    assert.equal((await s.request("/api/booking/" + body.id)).status, 404);
  } finally {
    s.close();
  }
});
test("session serveur, CSRF, refus, déconnexion et expiration", async () => {
  const s = await setup();
  try {
    assert.equal(
      (
        await s.request("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ username: "admin", password: "wrong" }),
        })
      ).status,
      401,
    );
    const headers = await login(s);
    const b = s.store.create(payload, keyFor("key-00000001"));
    assert.equal(
      (await s.request("/api/admin/bookings", { headers })).status,
      200,
    );
    assert.equal(
      (
        await s.request(`/api/admin/bookings/${b.id}/action`, {
          method: "POST",
          headers: { Cookie: headers.Cookie },
          body: JSON.stringify({ action: "confirm" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await s.request(`/api/admin/bookings/${b.id}/action`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "confirm" }),
        })
      ).status,
      200,
    );
    await s.request("/api/admin/logout", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(
      (await s.request("/api/admin/bookings", { headers })).status,
      401,
    );
    const h2 = await login(s);
    s.advance(8 * 3600000 + 1);
    assert.equal(
      (await s.request("/api/admin/bookings", { headers: h2 })).status,
      401,
    );
  } finally {
    s.close();
  }
});
test("cookie HttpOnly SameSite et validation JSON sans stack", async () => {
  const s = await setup();
  try {
    const r = await s.request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password }),
    });
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    assert.match(r.headers.get("set-cookie"), /SameSite=Strict/);
    for (const body of ["{", "null", "{}"]) {
      const x = await s.request("/api/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": keyFor("key-00000001") },
        body,
      });
      assert.equal(x.status, 400);
      assert.ok(!(await x.text()).includes("stack"));
    }
    const x = await s.request("/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": keyFor("key-00000001") },
      body: JSON.stringify({ ...payload, description: "x".repeat(20000) }),
    });
    assert.equal(x.status, 413);
  } finally {
    s.close();
  }
});
test("limite tentatives de connexion et données jamais publiques", async () => {
  const s = await setup();
  try {
    for (let i = 0; i < 8; i++)
      await s.request("/api/admin/login", { method: "POST", body: "{}" });
    assert.equal(
      (await s.request("/api/admin/login", { method: "POST", body: "{}" }))
        .status,
      429,
    );
    assert.equal((await s.request("/api/admin/session")).status, 401);
  } finally {
    s.close();
  }
});

test("revue 4 : quota IP ignore X-Forwarded-For forgé et ne divulgue aucune donnée réseau", async () => {
  const s = await setup();
  try {
    for (let i = 0; i < 3; i++) {
      const r = await s.request("/api/bookings", {
        method: "POST",
        headers: {
          "Idempotency-Key": keyFor(`quota-${i}`),
          "X-Forwarded-For": `192.0.2.${i + 1}`,
        },
        body: JSON.stringify({
          ...payload,
          start: `2026-11-${10 + i}T09:00:00Z`,
        }),
      });
      assert.equal(r.status, 201);
      const b = await r.json();
      assert.ok(
        !Object.keys(b).some((k) =>
          /^(owner_key|owner|ip|fingerprint|idem)$/i.test(k),
        ),
      );
    }
    const blocked = await s.request("/api/bookings", {
      method: "POST",
      headers: {
        "Idempotency-Key": keyFor("quota-4"),
        "X-Forwarded-For": "198.51.100.7",
      },
      body: JSON.stringify({ ...payload, start: "2026-11-15T09:00:00Z" }),
    });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, "PENDING_QUOTA");
  } finally {
    s.close();
  }
});
