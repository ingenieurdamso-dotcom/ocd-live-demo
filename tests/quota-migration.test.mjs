import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.mjs";
test("revue 4 : migration ancienne table conserve les options et applique le quota global", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ocd-migration-")),
    filename = path.join(dir, "test.sqlite"),
    now = () => Date.parse("2026-11-08T08:00:00Z"),
    data = {
      pack: "decouverte",
      mode: "studio",
      start: "2026-11-09T09:00:00Z",
      name: "Client Démo",
      email: "test@example.test",
      phone: "+22890000000",
      country: "Togo",
      tiktok: "@client.demo",
      instagram: "",
      business: "Atelier Démo",
      category: "Artisanat",
      description: "Description fictive pour le test.",
      consent: true,
    };
  let s;
  try {
    s = createStore({ filename, now });
    const old = s.create(data, randomUUID());
    s.close();
    s = null;
    const db = new DatabaseSync(filename);
    db.exec("ALTER TABLE bookings DROP COLUMN owner_key");
    db.close();
    s = createStore({
      filename,
      now,
      pendingLimits: { perOwner: 3, total: 1 },
    });
    assert.equal(s.get(old.token).status, "pending");
    assert.throws(
      () =>
        s.create(
          { ...data, start: "2026-11-10T09:00:00Z" },
          randomUUID(),
          "new-owner",
        ),
      (e) => e.status === 429,
    );
    s.action(old.id, { action: "reject", reason: "Test de refus" });
    assert.equal(
      s.create(
        { ...data, start: "2026-11-10T09:00:00Z" },
        randomUUID(),
        "new-owner",
      ).status,
      "pending",
    );
  } finally {
    s?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
