import { mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashPassword } from "../server/security.mjs";
export const privateDir =
  process.env.OCD_DATA_DIR ||
  path.join(os.homedir(), ".local/share/ocd-live-demo");
export function ensurePrivateDir() {
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  chmodSync(privateDir, 0o700);
}
export function bootstrap() {
  ensurePrivateDir();
  const file = path.join(privateDir, "credentials.json");
  if (!existsSync(file)) {
    const password = randomBytes(24).toString("base64url");
    writeFileSync(
      file,
      JSON.stringify({ username: "admin", ...hashPassword(password) }, null, 2),
      { mode: 0o600 },
    );
    writeFileSync(
      path.join(privateDir, "admin-login.txt"),
      `OCD Live, démonstration locale uniquement\nIdentifiant : admin\nMot de passe : ${password}\nConservez ce fichier privé. Aucun compte externe.\n`,
      { mode: 0o600 },
    );
  }
  return file;
}
export function isDirectBootstrap(
  entry = process.argv[1],
  moduleUrl = import.meta.url,
) {
  if (!entry) return false;
  try {
    return pathToFileURL(entry).href === moduleUrl;
  } catch {
    return false;
  }
}
if (isDirectBootstrap()) {
  try {
    bootstrap();
    console.log(
      "Compte local prêt. Fichier privé : " +
        path.join(privateDir, "admin-login.txt"),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Bootstrap impossible.",
    );
    process.exitCode = 1;
  }
}
