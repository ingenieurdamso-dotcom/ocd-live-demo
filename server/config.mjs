// Configuration du serveur, lue depuis l’environnement. Aucune valeur secrète
// par défaut : les identifiants administrateur viennent de ADMIN_USERNAME et
// ADMIN_PASSWORD (obligatoires en production). Le mot de passe n’est jamais
// journalisé ni renvoyé dans un message d’erreur.
export class ConfigError extends Error {}

export const MIN_ADMIN_PASSWORD_LENGTH = 16;
const MAX_ADMIN_PASSWORD_LENGTH = 200;

function parsePort(value) {
  if (value === undefined || value === "") return 4173;
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new ConfigError("PORT invalide : entier attendu entre 1 et 65535.");
  return Number(value);
}

function parseTrustProxy(value) {
  if (value === undefined || value === "" || value === "0") return 0;
  if (!/^[1-9]$/.test(value))
    throw new ConfigError(
      "TRUST_PROXY invalide : 0 (aucun proxy) ou un nombre de proxys de 1 à 9.",
    );
  return Number(value);
}

function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("APP_ORIGIN invalide : URL absolue attendue.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ConfigError("APP_ORIGIN invalide : http ou https attendu.");
  if (url.origin !== value.replace(/\/$/, ""))
    throw new ConfigError(
      "APP_ORIGIN invalide : origine seule attendue (schéma, hôte, port), sans chemin.",
    );
  return url.origin;
}

function parseAdmin(env, production) {
  const rawUser = env.ADMIN_USERNAME;
  const rawPassword = env.ADMIN_PASSWORD;
  const hasUser = typeof rawUser === "string" && rawUser.trim() !== "";
  const hasPassword = typeof rawPassword === "string" && rawPassword !== "";
  if (!hasUser && !hasPassword) {
    if (production)
      throw new ConfigError(
        "ADMIN_USERNAME et ADMIN_PASSWORD sont obligatoires en production.",
      );
    return null;
  }
  if (!hasUser || !hasPassword)
    throw new ConfigError(
      "ADMIN_USERNAME et ADMIN_PASSWORD doivent être définis ensemble.",
    );
  const username = rawUser.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username))
    throw new ConfigError(
      "ADMIN_USERNAME invalide : 3 à 64 caractères parmi a-z, 0-9, point, tiret, souligné.",
    );
  // Le formulaire de connexion retire les espaces de début et de fin : on
  // applique la même normalisation pour que le mot de passe reste utilisable.
  const password = rawPassword.trim();
  if (production && password.length < MIN_ADMIN_PASSWORD_LENGTH)
    throw new ConfigError(
      `ADMIN_PASSWORD trop court : au moins ${MIN_ADMIN_PASSWORD_LENGTH} caractères en production.`,
    );
  if (password.length === 0 || password.length > MAX_ADMIN_PASSWORD_LENGTH)
    throw new ConfigError(
      `ADMIN_PASSWORD invalide : 1 à ${MAX_ADMIN_PASSWORD_LENGTH} caractères.`,
    );
  return { username, password };
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const port = parsePort(env.PORT);
  const host = env.HOST || "127.0.0.1";
  // Render fournit RENDER_EXTERNAL_URL ; APP_ORIGIN reste prioritaire.
  const rawOrigin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
  if (!rawOrigin && production)
    throw new ConfigError("APP_ORIGIN est obligatoire en production.");
  const origin = parseOrigin(rawOrigin || `http://127.0.0.1:${port}`);
  return {
    production,
    port,
    host,
    origin,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    admin: parseAdmin(env, production),
  };
}
