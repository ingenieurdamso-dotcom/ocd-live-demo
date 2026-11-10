import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Booking } from "../src/Booking.tsx";
import { catalog } from "../server/catalog.mjs";
import { Tracking } from "../src/Tracking.tsx";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis.navigator, "onLine", {
  value: true,
  configurable: true,
});
test("collision serveur reste visible après rechargement des créneaux et conserve activité", async () => {
  const previousFetch = globalThis.fetch;
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = date + "T09:00:00.000Z";
  globalThis.fetch = async (url) => ({
    ok: !String(url).endsWith("/bookings"),
    status: String(url).endsWith("/bookings") ? 409 : 200,
    json: async () =>
      String(url).endsWith("/bookings")
        ? { code: "SLOT_CONFLICT", message: "Ce créneau vient d’être pris." }
        : {
            slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
            serverTime: new Date().toISOString(),
          },
  });
  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Booking, { packs: catalog, online: true }),
      );
    });
    const root = () => renderer.root;
    const form = () => root().findByType("form");
    await act(async () => {
      form().props.onSubmit({ preventDefault() {} });
    });
    const slot = root()
      .findAllByType("button")
      .find(
        (b) =>
          b.props["aria-pressed"] === false &&
          b.findAllByType("strong").some((s) => s.children.includes("09:00")),
      );
    assert.ok(slot, "available 09:00 slot");
    await act(async () => {
      slot.props.onClick();
    });
    await act(async () => {
      form().props.onSubmit({ preventDefault() {} });
    });
    const example = root()
      .findAllByType("button")
      .find((b) =>
        b.children.some(
          (x) => typeof x === "string" && x.includes("Remplir un exemple"),
        ),
      );
    assert.ok(example);
    await act(async () => example.props.onClick());
    await act(async () => form().props.onSubmit({ preventDefault() {} }));
    await act(async () => {
      form().props.onSubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 10));
    });
    assert.ok(
      JSON.stringify(renderer.toJSON()).includes(
        "Ce créneau vient d’être pris.",
      ),
      "conflict feedback must survive availability refresh",
    );
    await act(async () => {
      root()
        .findAllByType("button")
        .find((b) =>
          b.children.some(
            (x) => typeof x === "string" && x.trim() === "Retour",
          ),
        )
        .props.onClick();
    });
    await act(async () => form().props.onSubmit({ preventDefault() {} }));
    assert.ok(
      JSON.stringify(renderer.toJSON()).includes(
        "Ce créneau vient d’être pris.",
      ) === false,
    );
    const newSlot = root()
      .findAllByType("button")
      .find(
        (b) =>
          b.props["aria-pressed"] === false &&
          b.findAllByType("strong").some((s) => s.children.includes("09:00")),
      );
    await act(async () => newSlot.props.onClick());
    await act(async () => form().props.onSubmit({ preventDefault() {} }));
    assert.equal(
      root().findByProps({ id: "business" }).props.value,
      "Atelier Amina Démo",
    );
    await act(async () => renderer.unmount());
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ouvrir un autre lien privé dans le même onglet actualise le bon dossier", async () => {
  const oldFetch = globalThis.fetch,
    oldWindow = globalThis.window;
  const events = new EventTarget();
  const a = "a".repeat(64),
    b = "b".repeat(64);
  globalThis.window = {
    location: { hash: "#" + a },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "demo",
      token: String(url).endsWith(a) ? a : b,
      business: String(url).endsWith(a) ? "Dossier A" : "Dossier B",
      pack: "decouverte",
      mode: "studio",
      start: "2026-11-09T09:00:00Z",
      end: "2026-11-09T10:30:00Z",
      name: "Client Démo",
      category: "Artisanat",
      description: "Description fictive",
      email: "test@example.test",
      phone: "+22890000000",
      status: "confirmed",
      events: [],
    }),
  });
  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Tracking, { packs: catalog, online: true }),
      );
    });
    assert.ok(JSON.stringify(renderer.toJSON()).includes("Dossier A"));
    await act(async () => {
      globalThis.window.location.hash = "#" + b;
      events.dispatchEvent(new Event("hashchange"));
    });
    assert.ok(JSON.stringify(renderer.toJSON()).includes("Dossier B"));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.fetch = oldFetch;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
