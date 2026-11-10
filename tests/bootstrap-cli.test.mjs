import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDirectBootstrap } from "../scripts/bootstrap.mjs";

const root = path.resolve(import.meta.dirname, "..");

function runBootstrap(dataDir) {
  return spawnSync(process.execPath, ["scripts/bootstrap.mjs"], {
    cwd: root,
    env: { ...process.env, OCD_DATA_DIR: dataDir },
    encoding: "utf8",
  });
}

test("garde d’entrée : un chemin Windows est le script, un autre fichier ne l’est pas", () => {
  const entry = "C:\\Users\\demo\\ocd-live\\scripts\\bootstrap.mjs";
  const moduleUrl = pathToFileURL(entry).href;
  assert.equal(isDirectBootstrap(entry, moduleUrl), true);
  assert.notEqual(entry, new URL(moduleUrl).pathname);
  assert.equal(
    isDirectBootstrap(
      "C:\\Users\\demo\\ocd-live\\server\\index.mjs",
      moduleUrl,
    ),
    false,
  );
  assert.equal(isDirectBootstrap("", moduleUrl), false);
});

test("bootstrap CLI crée le compte sans le régénérer, et échoue si le dossier est inutilisable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ocd-bootstrap-"));
  try {
    const first = runBootstrap(dir);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /admin-login\.txt/);
    assert.equal(first.stdout.includes("Mot de passe"), false);
    const credentials = path.join(dir, "credentials.json");
    const notice = path.join(dir, "admin-login.txt");
    assert.equal(existsSync(credentials), true);
    assert.equal(existsSync(notice), true);
    const original = readFileSync(credentials, "utf8");
    const second = runBootstrap(dir);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(credentials, "utf8"), original);
    const blocker = path.join(dir, "pas-un-dossier");
    writeFileSync(blocker, "x");
    const failed = runBootstrap(path.join(blocker, "enfant"));
    assert.notEqual(failed.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
