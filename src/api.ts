export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new ApiError(
      "Vous êtes hors connexion. Aucune demande n’a été envoyée.",
      0,
      "OFFLINE",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("/api" + path, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await res.json();
    if (!res.ok)
      throw new ApiError(
        body.message || "Une erreur est survenue.",
        res.status,
        body.code,
      );
    return body;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "Connexion interrompue ou réponse incertaine. Réessayez sans modifier le dossier : les doublons sont empêchés.",
      0,
      "NETWORK",
    );
  } finally {
    clearTimeout(timer);
  }
}
