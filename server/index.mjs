import { readFileSync, chmodSync } from "node:fs";
import path from "node:path";
import {
  bootstrap,
  ensurePrivateDir,
  privateDir,
} from "../scripts/bootstrap.mjs";
import { createStore } from "./store.mjs";
import { createApp } from "./app.mjs";
import { hashPassword } from "./security.mjs";
import { loadConfig, ConfigError } from "./config.mjs";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(
    "Configuration refusée : " +
      (error instanceof ConfigError ? error.message : "erreur inattendue."),
  );
  process.exit(1);
}
const { port, host, origin, production, trustProxy, admin } = config;

// Identifiants : depuis l’environnement (hachés en mémoire, jamais écrits sur
// disque), sinon, hors production uniquement, compte local généré par bootstrap.
let credentials;
if (admin) {
  ensurePrivateDir();
  credentials = { username: admin.username, ...hashPassword(admin.password) };
} else {
  credentials = JSON.parse(readFileSync(bootstrap(), "utf8"));
}
// La base SQLite est créée automatiquement si elle n’existe pas (disque
// éphémère sur Render Free : elle repart vide à chaque redémarrage).
const filename = path.join(privateDir, "bookings.sqlite");
const store = createStore({ filename });
chmodSync(filename, 0o600);
const app = createApp({ store, credentials, origin, production, trustProxy });
const server = app.listen(port, host, () =>
  console.log(
    `OCD Live prêt : écoute ${host}:${port}, origine ${origin}, ` +
      `mode ${production ? "production" : "développement"}, ` +
      `proxys de confiance ${trustProxy}, ` +
      `identifiants ${admin ? "fournis par l’environnement" : "locaux (bootstrap)"}, PID ${process.pid}`,
  ),
);
server.on("error", () => {
  console.error(
    "Impossible de démarrer le serveur : vérifiez le port et les paramètres.",
  );
  store.close();
  process.exitCode = 1;
});
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
