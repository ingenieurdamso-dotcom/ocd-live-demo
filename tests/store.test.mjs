import { keyFor } from "./test-keys.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.mjs";
let clock = Date.parse("2026-11-08T08:00:00Z");
const fresh = () => {
  clock = Date.parse("2026-11-08T08:00:00Z");
  return createStore({ filename: ":memory:", now: () => clock });
};
const input = (more = {}) => ({
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
  category: "Mode & accessoires",
  description: "Des sacs fictifs pour cette démonstration.",
  consent: true,
  ...more,
});
test("six offres dont 90min, 4h, mensuel honnête et promotion", () => {
  const s = fresh();
  assert.equal(s.catalog.length, 6);
  assert.equal(s.catalog.find((p) => p.id === "decouverte").duration, 90);
  assert.equal(s.catalog.find((p) => p.id === "session").duration, 240);
  assert.equal(s.catalog.find((p) => p.id === "mensuel").credits, 4);
  s.close();
});
test("enregistre et bloque une ressource commune aux deux modes", () => {
  const s = fresh();
  const b = s.create(input(), keyFor("key-00000001"));
  assert.equal(b.status, "pending");
  assert.equal(b.token.length, 64);
  assert.throws(
    () => s.create(input({ mode: "remote" }), keyFor("key-00000002")),
    (e) => e.status === 409,
  );
  assert.equal(
    s
      .availability("2026-11-09", "decouverte")
      .slots.find((x) => x.start === "2026-11-09T09:00:00.000Z").available,
    false,
  );
  s.close();
});
test("adjacence semi-ouverte et idempotence liée au contenu", () => {
  const s = fresh();
  const a = s.create(input(), keyFor("key-00000001"));
  assert.equal(s.create(input(), keyFor("key-00000001")).token, a.token);
  assert.throws(
    () => s.create(input({ name: "Autre" }), keyFor("key-00000001")),
    (e) => e.status === 409,
  );
  s.create(input({ start: "2026-11-09T10:30:00Z" }), keyFor("key-00000002"));
  assert.equal(s.list().length, 2);
  s.close();
});
test("exige un pays et un compte TikTok fictif, et normalise les pseudos", () => {
  const s = fresh();
  const {
    country: _country,
    tiktok: _tiktok,
    ...withoutPresence
  } = {
    ...input(),
    country: "Togo",
    tiktok: "@amina.demo",
  };
  assert.throws(
    () => s.create(withoutPresence, keyFor("key-00000001")),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      s.create(
        input({ country: "Togo", tiktok: "https://www.tiktok.com/@amina" }),
        keyFor("key-00000001"),
      ),
    (e) => e.status === 400,
  );
  const saved = s.create(
    input({
      country: "Togo",
      tiktok: "amina.demo",
      instagram: "@atelier.amina",
    }),
    keyFor("key-00000001"),
  );
  assert.equal(saved.country, "Togo");
  assert.equal(saved.tiktok, "@amina.demo");
  assert.equal(saved.instagram, "@atelier.amina");
  s.close();
});
test("rejette passé, hors heures, mauvaise date, contacts et consentement", () => {
  const s = fresh();
  for (const d of [
    { start: "2026-11-07T09:00:00Z" },
    { start: "2026-11-09T20:00:00Z" },
    { start: "bad" },
    { email: "x" },
    { name: "" },
    { consent: false },
    { pack: "inconnu" },
    { mode: "xx" },
    { start: "2026-11-09T09:10:00Z" },
  ])
    assert.throws(
      () => s.create(input(d), keyFor("key-00000001")),
      (e) => e.status === 400,
    );
  assert.throws(
    () => s.availability("2026-02-31", "decouverte"),
    (e) => e.status === 400,
  );
  s.close();
});
test("option expire logiquement après 24h et ne peut être confirmée", () => {
  const s = fresh();
  const a = s.create(input(), keyFor("key-00000001"));
  clock += 86400001;
  assert.equal(s.get(a.token).status, "expired");
  assert.throws(
    () => s.action(a.id, { action: "confirm" }),
    (e) => e.status === 409,
  );
  s.create(input(), keyFor("key-00000002"));
  s.close();
});
test("refus motivé libère le créneau et journal interne simulé", () => {
  const s = fresh();
  const a = s.create(input(), keyFor("key-00000001"));
  assert.throws(
    () => s.action(a.id, { action: "reject", reason: "" }),
    (e) => e.status === 400,
  );
  s.action(a.id, { action: "reject", reason: "Démonstration de refus" });
  assert.equal(s.get(a.token).status, "rejected");
  s.create(input(), keyFor("key-00000002"));
  assert.ok(s.get(a.token).events.every((e) => e.simulated));
  s.close();
});
test("report réserve ancien et nouveau puis accord atomique", () => {
  const s = fresh();
  const a = s.create(input(), keyFor("key-00000001"));
  s.action(a.id, { action: "confirm" });
  s.action(a.id, {
    action: "reschedule",
    start: "2026-11-09T12:00:00Z",
    reason: "Studio indisponible",
  });
  assert.equal(s.get(a.token).status, "reschedule_proposed");
  assert.throws(
    () =>
      s.create(
        input({ start: "2026-11-09T12:00:00Z" }),
        keyFor("key-00000002"),
      ),
    (e) => e.status === 409,
  );
  assert.throws(
    () => s.create(input(), keyFor("key-00000003")),
    (e) => e.status === 409,
  );
  s.respond(a.token, true);
  assert.equal(s.get(a.token).start, "2026-11-09T12:00:00.000Z");
  assert.equal(s.get(a.token).status, "confirmed");
  s.create(input(), keyFor("key-00000004"));
  s.close();
});
test("refus et expiration report conservent réservation antérieure", () => {
  for (const accept of [false, "expire"]) {
    const s = fresh();
    const a = s.create(input(), keyFor("key-00000001"));
    s.action(a.id, { action: "confirm" });
    s.action(a.id, {
      action: "reschedule",
      start: "2026-11-10T12:00:00Z",
      reason: "Report démo",
    });
    if (accept === false) s.respond(a.token, false);
    else clock += 86400001;
    const b = s.get(a.token);
    assert.equal(b.status, "confirmed");
    assert.equal(b.start, "2026-11-09T09:00:00.000Z");
    s.close();
  }
});
test("report en collision refusé sans modifier demande", () => {
  const s = fresh();
  const a = s.create(input(), keyFor("key-00000001"));
  s.create(input({ start: "2026-11-09T12:00:00Z" }), keyFor("key-00000002"));
  assert.throws(
    () =>
      s.action(a.id, {
        action: "reschedule",
        start: "2026-11-09T12:00:00Z",
        reason: "Report démo",
      }),
    (e) => e.status === 409,
  );
  assert.equal(s.get(a.token).status, "pending");
  s.close();
});
test("token inconnu et identifiant admin inconnu ne révèlent rien", () => {
  const s = fresh();
  assert.throws(
    () => s.get("0".repeat(64)),
    (e) => e.status === 404,
  );
  assert.throws(
    () => s.action("abc", { action: "confirm" }),
    (e) => e.status === 404,
  );
  s.close();
});
