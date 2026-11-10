import { test } from "node:test";
import assert from "node:assert/strict";
import { idempotencyKey } from "../src/idempotencyKey.ts";

const UUID_V4 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

test("clé d’idempotence : UUIDv4 via getRandomValues, sans randomUUID", () => {
  const originalRandom = globalThis.crypto.randomUUID;
  const seen = new Set();
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value() {
      throw new TypeError("randomUUID indisponible hors contexte sécurisé");
    },
  });
  try {
    for (let i = 0; i < 32; i++) {
      const key = idempotencyKey();
      assert.match(key, UUID_V4);
      seen.add(key);
    }
    assert.equal(seen.size, 32);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: originalRandom,
    });
  }
});

test("clé d’idempotence : échec d’entropie reste une erreur explicite", () => {
  const original = globalThis.crypto.getRandomValues;
  Object.defineProperty(globalThis.crypto, "getRandomValues", {
    configurable: true,
    value() {
      throw new Error("entropy");
    },
  });
  try {
    assert.throws(() => idempotencyKey(), /clé privée d’envoi/i);
  } finally {
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: original,
    });
  }
});
