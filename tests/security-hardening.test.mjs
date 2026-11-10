import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStore } from "../server/store.mjs";
const now = () => Date.parse("2026-11-08T08:00:00Z");
const input = (day = 9) => ({
  pack: "decouverte",
  mode: "studio",
  start: `2026-11-${String(day).padStart(2, "0")}T09:00:00Z`,
  name: "Client Démo",
  email: "test@example.test",
  phone: "+22890000000",
  country: "Togo",
  tiktok: "@client.demo",
  instagram: "",
  business: "Atelier Démo",
  category: "Artisanat",
  description: "Description fictive du test.",
  consent: true,
});
test("revue 3 : rejeter les clés humaines et formats hors UUIDv4 avant récupération d’un reçu", () => {
  const s = createStore({ now });
  try {
    for (const key of [
      "human-request-01",
      "key-00000001",
      "a".repeat(64),
      "00000000-0000-1000-8000-000000000000",
      null,
      "",
    ]) {
      assert.throws(
        () => s.create(input(), key),
        (e) => e.status === 400 && e.code === "IDEMPOTENCY",
      );
    }
  } finally {
    s.close();
  }
});
test("revue 3 : UUIDv4 aléatoire rejoue le reçu, jamais un autre dossier", () => {
  const s = createStore({ now }),
    key = randomUUID();
  try {
    const b = s.create(input(), key);
    assert.equal(s.create(input(), key).id, b.id);
    assert.throws(
      () => s.create({ ...input(), business: "Autre atelier" }, key),
      (e) => e.status === 409 && e.code === "IDEMPOTENCY",
    );
  } finally {
    s.close();
  }
});

const quotaError = (e) => e.status === 429 && e.code === "PENDING_QUOTA";
test("revue 4 : trois options actives par propriétaire, répétition du même envoi hors quota", () => {
  const s = createStore({ now }),
    key = randomUUID();
  try {
    s.create(input(9), key, "owner-a");
    s.create(input(10), randomUUID(), "owner-a");
    s.create(input(11), randomUUID(), "owner-a");
    assert.throws(
      () => s.create(input(12), randomUUID(), "owner-a"),
      quotaError,
    );
    assert.equal(s.create(input(9), key, "owner-a").status, "pending");
    assert.equal(
      s.create(input(12), randomUUID(), "owner-b").status,
      "pending",
    );
    assert.ok(!JSON.stringify(s.list()).includes("owner-a"));
  } finally {
    s.close();
  }
});
test("revue 4 : plafond global même entre propriétaires différents", () => {
  const s = createStore({ now, pendingLimits: { perOwner: 3, total: 2 } });
  try {
    s.create(input(9), randomUUID(), "a");
    s.create(input(10), randomUUID(), "b");
    assert.throws(() => s.create(input(11), randomUUID(), "c"), quotaError);
  } finally {
    s.close();
  }
});
test("revue 4 : refus, confirmation et expiration logique libèrent le quota", () => {
  let clock = now();
  const s = createStore({
    now: () => clock,
    pendingLimits: { perOwner: 1, total: 20 },
  });
  try {
    const a = s.create(input(10), randomUUID(), "a");
    assert.throws(() => s.create(input(11), randomUUID(), "a"), quotaError);
    s.action(a.id, { action: "reject", reason: "Refus fictif" });
    const b = s.create(input(11), randomUUID(), "a");
    s.action(b.id, { action: "confirm" });
    const c = s.create(input(12), randomUUID(), "a");
    clock += 86400000;
    const d = s.create(input(13), randomUUID(), "a");
    assert.equal(s.get(c.token).status, "expired");
    assert.equal(d.status, "pending");
  } finally {
    s.close();
  }
});
test("revue 4 : report d’une option pending garde le quota jusqu’à confirmation effective", () => {
  const s = createStore({ now, pendingLimits: { perOwner: 1, total: 20 } });
  try {
    const a = s.create(input(10), randomUUID(), "a");
    s.action(a.id, {
      action: "reschedule",
      reason: "Déplacement fictif",
      start: input(11).start,
    });
    assert.throws(() => s.create(input(12), randomUUID(), "a"), quotaError);
    s.respond(a.token, false);
    assert.throws(() => s.create(input(12), randomUUID(), "a"), quotaError);
    s.action(a.id, {
      action: "reschedule",
      reason: "Déplacement fictif",
      start: input(11).start,
    });
    s.respond(a.token, true);
    assert.equal(s.create(input(12), randomUUID(), "a").status, "pending");
  } finally {
    s.close();
  }
});
