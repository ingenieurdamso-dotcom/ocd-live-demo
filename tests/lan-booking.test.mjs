import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Booking } from "../src/Booking.tsx";
import { catalog } from "../server/catalog.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const UUID_V4 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const shown = (r) => JSON.stringify(r.toJSON());
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

function replaceCrypto(name, value) {
  const original = globalThis.crypto[name];
  Object.defineProperty(globalThis.crypto, name, {
    configurable: true,
    value,
  });
  return () => {
    Object.defineProperty(globalThis.crypto, name, {
      configurable: true,
      value: original,
    });
  };
}

async function openBooking(posts) {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = date + "T09:00:00.000Z";
  const events = new EventTarget();
  const previousWindow = globalThis.window;
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  globalThis.window = {
    location: {
      hash: "",
      href: "http://192.168.11.105:4173/reserver",
      search: "",
      assign() {},
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/bookings")) {
      posts.push(options.headers["Idempotency-Key"]);
      return response({ token: "a".repeat(64) });
    }
    return response({
      slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
      serverTime: new Date().toISOString(),
    });
  };
  let r;
  await act(async () => {
    r = TestRenderer.create(
      React.createElement(Booking, { packs: catalog, online: true }),
    );
  });
  const submit = async () =>
    act(async () =>
      r.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
  await submit();
  const slot = r.root
    .findAllByType("button")
    .find(
      (b) =>
        b.props["aria-pressed"] === false &&
        b.findAllByType("strong").some((x) => x.children.includes("09:00")),
    );
  assert.ok(slot, "créneau 09:00");
  await act(async () => slot.props.onClick());
  await submit();
  const example = r.root
    .findAllByType("button")
    .find((b) =>
      b.children.some(
        (c) => typeof c === "string" && c.includes("Remplir un exemple"),
      ),
    );
  assert.ok(example);
  await act(async () => example.props.onClick());
  await submit();
  return {
    r,
    submit,
    async close() {
      await act(async () => r.unmount());
      globalThis.fetch = previousFetch;
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
      if (previousNavigator)
        Object.defineProperty(globalThis, "navigator", previousNavigator);
      else delete globalThis.navigator;
    },
  };
}

test("réservation hors contexte sécurisé : UUIDv4 sans randomUUID, échec de clé récupérable", async () => {
  const posts = [];
  const restoreUuid = replaceCrypto("randomUUID", undefined);
  const sent = await openBooking(posts);
  try {
    await sent.submit();
    assert.equal(posts.length, 1);
    assert.match(posts[0], UUID_V4);
    assert.equal(shown(sent.r).includes("Enregistrement"), false);
  } finally {
    await sent.close();
  }
  posts.length = 0;
  const restoreValues = replaceCrypto("getRandomValues", () => {
    throw new Error("entropy");
  });
  const failed = await openBooking(posts);
  try {
    await failed.submit();
    assert.equal(posts.length, 0);
    assert.equal(shown(failed.r).includes("Enregistrement"), false);
    assert.match(shown(failed.r), /clé privée d’envoi/i);
    restoreValues();
    await failed.submit();
    assert.equal(posts.length, 1);
    assert.match(posts[0], UUID_V4);
  } finally {
    restoreValues();
    restoreUuid();
    await failed.close();
  }
});
