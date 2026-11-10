import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const token = () => randomBytes(32).toString("hex");
export const sha = (value) => createHash("sha256").update(value).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
export function verifyPassword(password, credentials) {
  if (typeof password !== "string" || password.length > 200) return false;
  const actual = scryptSync(password, credentials.salt, 64);
  const expected = Buffer.from(credentials.hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function securityHeaders(req, res, next) {
  res.set({
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  next();
}
