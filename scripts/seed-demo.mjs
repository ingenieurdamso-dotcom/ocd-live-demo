import { randomUUID } from "node:crypto";
// Jeux de données fictives via l’API réelle, exclusivement sur localhost.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { privateDir } from "./bootstrap.mjs";
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:4173";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("Ce scénario de test est limité à localhost.");
const password = readFileSync(
  path.join(privateDir, "admin-login.txt"),
  "utf8",
).match(/Mot de passe : (.+)/)?.[1];
async function call(endpoint, body, headers = {}) {
  const res = await fetch(origin + "/api" + endpoint, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  assert.ok(
    res.ok,
    `Test API ${endpoint}: statut ${res.status}, ${data.code || "inconnu"}`,
  );
  return { data, res };
}
const login = await call("/admin/login", { username: "admin", password });
const headers = {
  Cookie: login.res.headers.get("set-cookie").split(";")[0],
  "X-CSRF-Token": login.data.csrf,
};
const day = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fixtures = [
  {
    name: "Amina Démo",
    business: "Atelier Amina Démo",
    pack: "decouverte",
    mode: "studio",
    date: 1,
    time: "09:00",
    status: "pending",
  },
  {
    name: "Koffi Démo",
    business: "Maison Naya Démo",
    pack: "session",
    mode: "studio",
    date: 1,
    time: "11:00",
    status: "confirmed",
  },
  {
    name: "Afi Démo",
    business: "Karité & Racines Démo",
    pack: "visibilite",
    mode: "remote",
    date: 2,
    time: "09:00",
    status: "reschedule_proposed",
  },
  {
    name: "Moussa Démo",
    business: "Le Comptoir Créatif Démo",
    pack: "mensuel",
    mode: "remote",
    date: 3,
    time: "10:00",
    status: "pending",
  },
  {
    name: "Éva Démo",
    business: "Studio Éva Démo",
    pack: "essentiel",
    mode: "studio",
    date: 4,
    time: "15:00",
    status: "rejected",
  },
];
const results = [];
for (let i = 0; i < fixtures.length; i++) {
  const x = fixtures[i];
  let b = (
    await call(
      "/bookings",
      {
        pack: x.pack,
        mode: x.mode,
        start: `${day(x.date)}T${x.time}:00Z`,
        name: x.name,
        business: x.business,
        email: `demo-${i}@example.test`,
        phone: "+228 90000000",
        country: "Togo",
        tiktok: `@demo${i}`,
        instagram: "",
        category: "Artisanat",
        description:
          "Données fictives pour présenter le fonctionnement de la PWA OCD Live.",
        consent: true,
      },
      { "Idempotency-Key": randomUUID() },
    )
  ).data;
  if (x.status === "confirmed" || x.status === "reschedule_proposed")
    b = (
      await call(
        `/admin/bookings/${b.id}/action`,
        { action: "confirm" },
        headers,
      )
    ).data;
  if (x.status === "rejected")
    b = (
      await call(
        `/admin/bookings/${b.id}/action`,
        {
          action: "reject",
          reason:
            "Exemple fictif : dossier à compléter avant une nouvelle session.",
        },
        headers,
      )
    ).data;
  if (x.status === "reschedule_proposed")
    b = (
      await call(
        `/admin/bookings/${b.id}/action`,
        {
          action: "reschedule",
          start: day(5) + "T09:00:00Z",
          reason:
            "Exemple fictif : changement du planning proposé à l’entrepreneur.",
        },
        headers,
      )
    ).data;
  assert.equal(b.status, x.status);
  results.push({
    name: x.business,
    status: b.status,
    url: origin + "/suivi#" + b.token,
    id: b.id,
  });
}
const file = path.join(privateDir, "demo-receipts.json");
writeFileSync(file, JSON.stringify(results, null, 2), { mode: 0o600 });
await call("/admin/logout", {}, headers);
console.log(
  JSON.stringify(
    {
      created: results.length,
      statuses: results.map((x) => x.status),
      privateReceiptFile: file,
    },
    null,
    2,
  ),
);
