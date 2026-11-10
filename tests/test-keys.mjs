import { randomUUID } from "node:crypto";
// Valeurs aléatoires par processus ; l’étiquette permet seulement de répéter un envoi dans le même test.
const keys = new Map();
export function keyFor(label) {
  if (!keys.has(label)) keys.set(label, randomUUID());
  return keys.get(label);
}
