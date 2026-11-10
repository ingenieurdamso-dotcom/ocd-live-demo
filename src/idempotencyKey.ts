const UUID_V4 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const KEY_ERROR = "Impossible de préparer la clé privée d’envoi. Réessayez.";

function asUuidV4(bytes: Uint8Array): string {
  const versioned = Uint8Array.from(bytes);
  const sixth = versioned[6] ?? 0;
  const eighth = versioned[8] ?? 0;
  versioned[6] = (sixth & 0x0f) | 0x40;
  versioned[8] = (eighth & 0x3f) | 0x80;
  const hex = Array.from(versioned, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function idempotencyKey(): string {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    throw new Error(KEY_ERROR);
  }
  const key = asUuidV4(bytes);
  if (!UUID_V4.test(key)) throw new Error(KEY_ERROR);
  return key;
}
