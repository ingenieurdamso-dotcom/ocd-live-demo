import { test } from "node:test";
import assert from "node:assert/strict";
import { createAsyncScope } from "../src/asyncScope.ts";
test("séquence : seule la dernière lecture peut publier", () => {
  const s = createAsyncScope(),
    a = s.read(),
    b = s.read();
  assert.equal(s.current(a), false);
  assert.equal(s.current(b), true);
});
test("mutation invalide les GET antérieurs et empêche de nouveaux GET pendant écriture", () => {
  const s = createAsyncScope(),
    read = s.read(),
    write = s.mutate();
  assert.equal(s.current(read), false);
  assert.equal(s.read(), null);
  assert.equal(s.mutate(), null);
  assert.equal(s.current(write), true);
  s.finish(write);
  assert.equal(s.current(write), false);
  assert.ok(s.read());
});
test("invalidation de session/dossier neutralise résultat et finally antérieurs", () => {
  const s = createAsyncScope(),
    write = s.mutate();
  s.invalidate();
  const current = s.mutate();
  assert.equal(s.current(write), false);
  s.finish(write);
  assert.equal(s.mutating, true);
  assert.equal(s.current(current), true);
  s.finish(current);
  assert.equal(s.mutating, false);
});
