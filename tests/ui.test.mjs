import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { Home } from "../src/Home.tsx";
import { Booking } from "../src/Booking.tsx";
import { StatusBadge } from "../src/components.tsx";
import { catalog } from "../server/catalog.mjs";
test("accueil identifie la proposition Adama et les six offres non officielles", () => {
  const html = render(React.createElement(Home, { packs: catalog }));
  for (const value of [
    "Adama",
    "non officielle",
    "Découverte",
    "Essentiel",
    "Grand Live",
    "Duo",
    "Visibilité",
    "Rendez-vous",
    "démonstration",
    "ocd-logo.png",
    "Comment ça marche",
  ])
    assert.ok(html.includes(value), value);
});
test("parcours initial explicite les étapes et les deux modes", () => {
  const html = render(
    React.createElement(Booking, { packs: catalog, online: true }),
  );
  for (const value of [
    "Formule",
    "Créneau",
    "Activité",
    "Récapitulatif",
    "Lomé",
    "distance",
  ])
    assert.ok(html.includes(value), value);
  assert.ok(html.includes("aria-current"));
  assert.ok(html.includes('type="button"'));
});
test("statut différencie demande reçue et réservation confirmée sans injection", () => {
  assert.ok(
    render(React.createElement(StatusBadge, { status: "pending" })).includes(
      "En attente",
    ),
  );
  assert.ok(
    render(React.createElement(StatusBadge, { status: "confirmed" })).includes(
      "Confirmée",
    ),
  );
  assert.ok(
    !render(React.createElement(StatusBadge, { status: "<script>" })).includes(
      "<script>",
    ),
  );
});
