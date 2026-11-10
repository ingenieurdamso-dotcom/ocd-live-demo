import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { catalog } from "./catalog.mjs";
const DAY = 86400000;
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const digest = (x) => createHash("sha256").update(x).digest("hex");
const text = (v, label, min, max) => {
  if (
    typeof v !== "string" ||
    v.trim().length < min ||
    v.trim().length > max ||
    // eslint-disable-next-line no-control-regex -- Filtre volontaire des contrôles ASCII non autorisés.
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)
  )
    fail(400, "VALIDATION", `${label} : ${min} à ${max} caractères requis.`);
  return v.trim();
};
const countryName = (value) => {
  const name = text(value, "Pays", 2, 56);
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(name))
    fail(400, "VALIDATION", "Pays : lettres uniquement, sans chiffre ni lien.");
  return name;
};
const socialHandle = (value, label, required) => {
  if (value == null || value === "") {
    if (required)
      fail(400, "VALIDATION", `${label} : indiquez un pseudo public fictif.`);
    return "";
  }
  if (typeof value !== "string")
    fail(400, "VALIDATION", `${label} : pseudo invalide.`);
  const bare = value.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._]{2,30}$/.test(bare))
    fail(
      400,
      "VALIDATION",
      `${label} : 2 à 30 caractères, lettres, chiffres, points ou tirets bas. Pas de lien.`,
    );
  return `@${bare}`;
};
export function createStore({
  filename = ":memory:",
  now = () => Date.now(),
  pendingLimits = { perOwner: 3, total: 100 },
} = {}) {
  if (
    ![pendingLimits.perOwner, pendingLimits.total].every(
      (x) => Number.isSafeInteger(x) && x > 0,
    )
  )
    throw new Error("Quota de démonstration invalide");
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL,owner_key TEXT);
 CREATE INDEX IF NOT EXISTS booking_token ON bookings(token);`);
  // Migration additive privée, protégée aussi contre deux démarrages simultanés.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare("PRAGMA table_info(bookings)")
        .all()
        .some((c) => c.name === "owner_key")
    )
      db.exec("ALTER TABLE bookings ADD COLUMN owner_key TEXT");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  const read = () =>
    db
      .prepare("SELECT data FROM bookings")
      .all()
      .map((r) => JSON.parse(r.data));
  const save = (b) =>
    db
      .prepare("UPDATE bookings SET data=? WHERE id=?")
      .run(JSON.stringify(b), b.id);
  const event = (b, message) =>
    b.events.push({
      at: new Date(now()).toISOString(),
      message,
      simulated: true,
    });
  function expire() {
    for (const b of read()) {
      if (b.status === "reschedule_proposed" && b.proposal.expiresAt <= now()) {
        b.status = b.previousStatus;
        b.proposal = null;
        b.previousStatus = null;
        event(b, "Proposition de report expirée : ancien créneau conservé.");
        if (b.status === "pending" && b.holdUntil <= now()) {
          b.status = "expired";
          event(b, "Option de 24 heures expirée.");
        }
        save(b);
      } else if (b.status === "pending" && b.holdUntil <= now()) {
        b.status = "expired";
        event(b, "Option de 24 heures expirée.");
        save(b);
      }
    }
  }
  function tx(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      expire();
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function packFor(id) {
    return (
      catalog.find((p) => p.id === id) ||
      fail(400, "VALIDATION", "Choisissez une formule valide.")
    );
  }
  function checkStart(value, pack) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?Z$/.test(value)
    )
      fail(400, "VALIDATION", "Date et heure UTC invalides.");
    const start = Date.parse(value);
    if (
      !Number.isFinite(start) ||
      new Date(start).toISOString().slice(0, 16) !== value.slice(0, 16)
    )
      fail(400, "VALIDATION", "Date inexistante.");
    const end = start + pack.duration * 60000;
    const d = new Date(start);
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (start <= now())
      fail(
        400,
        "PAST",
        "Ce créneau est déjà passé. Choisissez une autre heure.",
      );
    if (start > now() + 90 * DAY)
      fail(400, "HORIZON", "Le planning est ouvert sur 90 jours.");
    if (mins < 540 || mins + pack.duration > 1260 || mins % 30 !== 0)
      fail(
        400,
        "HOURS",
        "Départs toutes les 30 min, entre 09 h et 21 h (Lomé UTC+0), fin incluse.",
      );
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    };
  }
  function available(start, end, except) {
    const a = Date.parse(start),
      z = Date.parse(end);
    return !read().some((b) => {
      if (
        b.id === except ||
        !["pending", "confirmed", "reschedule_proposed"].includes(b.status)
      )
        return false;
      const overlap = (s, e) => a < Date.parse(e) && z > Date.parse(s);
      return (
        overlap(b.start, b.end) ||
        (b.status === "reschedule_proposed" &&
          overlap(b.proposal.start, b.proposal.end))
      );
    });
  }
  function ensureSlot(start, end, except) {
    if (!available(start, end, except))
      fail(
        409,
        "SLOT_CONFLICT",
        "Ce créneau vient d’être pris. Vos informations sont conservées : choisissez-en un autre.",
      );
  }
  function byToken(token) {
    return (
      read().find((b) => b.token === token) ||
      fail(404, "NOT_FOUND", "Demande introuvable. Vérifiez votre lien privé.")
    );
  }
  function byId(id) {
    return (
      read().find((b) => b.id === id) ||
      fail(404, "NOT_FOUND", "Demande introuvable.")
    );
  }
  function validate(input) {
    if (!input || typeof input !== "object")
      fail(400, "VALIDATION", "Dossier invalide.");
    const pack = packFor(input.pack);
    if (!["studio", "remote"].includes(input.mode))
      fail(400, "VALIDATION", "Choisissez studio ou distance.");
    const name = text(input.name, "Nom", 2, 80),
      email = text(input.email, "Email", 5, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "VALIDATION", "Saisissez un email de démonstration valide.");
    const phone = text(input.phone, "Téléphone", 7, 30);
    if (!/^\+?[0-9 ()-]{7,30}$/.test(phone))
      fail(
        400,
        "VALIDATION",
        "Téléphone invalide (chiffres, +, espaces et tirets).",
      );
    const country = countryName(input.country),
      tiktok = socialHandle(input.tiktok, "TikTok", true),
      instagram = socialHandle(input.instagram, "Instagram", false),
      business = text(input.business, "Activité", 2, 100),
      category = text(input.category, "Catégorie", 2, 60),
      description = text(input.description, "Description", 10, 1000);
    if (input.consent !== true)
      fail(
        400,
        "CONSENT",
        "Confirmez que vous utilisez uniquement des données fictives.",
      );
    return {
      pack: pack.id,
      mode: input.mode,
      start: input.start,
      name,
      email,
      phone,
      country,
      tiktok,
      instagram,
      business,
      category,
      description,
      consent: true,
    };
  }
  return {
    catalog,
    availability(date, packId) {
      return tx(() => {
        if (
          typeof date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date
        )
          fail(400, "VALIDATION", "Choisissez une date valide.");
        const pack = packFor(packId);
        const slots = [];
        for (let min = 540; min + pack.duration <= 1260; min += 30) {
          const value = `${date}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00Z`;
          try {
            const t = checkStart(value, pack);
            slots.push({ ...t, available: available(t.start, t.end) });
          } catch (e) {
            if (!["PAST", "HORIZON"].includes(e.code)) throw e;
          }
        }
        return {
          date,
          timezone: "Africa/Lome",
          serverTime: new Date(now()).toISOString(),
          slots,
        };
      });
    },
    create(input, key, ownerKey = "local") {
      return tx(() => {
        if (
          typeof key !== "string" ||
          !/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
            key,
          )
        )
          fail(
            400,
            "IDEMPOTENCY",
            "Clé privée de soumission invalide : un UUIDv4 aléatoire est requis.",
          );
        const data = validate(input);
        const fingerprint = digest(JSON.stringify(data));
        const previous = db
          .prepare("SELECT data,fingerprint FROM bookings WHERE idem=?")
          .get(key);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            fail(
              409,
              "IDEMPOTENCY",
              "Ce dossier a déjà été envoyé avec un autre contenu. Recommencez avec une nouvelle demande.",
            );
          return JSON.parse(previous.data);
        }
        // Le replay est traité avant les quotas. Expiration et comptage partagent BEGIN IMMEDIATE.
        const counts = db
          .prepare(
            `SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN owner_key=? THEN 1 ELSE 0 END),0) AS owned FROM bookings WHERE json_extract(data,'$.status')='pending' OR (json_extract(data,'$.status')='reschedule_proposed' AND json_extract(data,'$.previousStatus')='pending')`,
          )
          .get(ownerKey);
        if (counts.owned >= pendingLimits.perOwner)
          fail(
            429,
            "PENDING_QUOTA",
            `Cette connexion possède déjà ${pendingLimits.perOwner} demandes en attente. Attendez une confirmation, un refus ou leur expiration avant une nouvelle demande.`,
          );
        if (counts.total >= pendingLimits.total)
          fail(
            429,
            "PENDING_QUOTA",
            "Le plafond d’options temporaires de cette démonstration est atteint. Réessayez après leur traitement ou leur expiration.",
          );
        const times = checkStart(data.start, packFor(data.pack));
        ensureSlot(times.start, times.end);
        const b = {
          ...data,
          ...times,
          id: randomBytes(8).toString("hex"),
          token: randomBytes(32).toString("hex"),
          status: "pending",
          createdAt: now(),
          holdUntil: now() + DAY,
          proposal: null,
          previousStatus: null,
          reason: "",
          events: [],
        };
        event(
          b,
          "Dossier reçu : notification interne simulée à l’équipe Bovann Group. Aucun email envoyé.",
        );
        db.prepare(
          "INSERT INTO bookings(id,token,idem,fingerprint,data,owner_key) VALUES(?,?,?,?,?,?)",
        ).run(b.id, b.token, key, fingerprint, JSON.stringify(b), ownerKey);
        return b;
      });
    },
    get(token) {
      return tx(() => byToken(token));
    },
    list() {
      return tx(() => read().sort((a, b) => b.createdAt - a.createdAt));
    },
    action(id, cmd) {
      return tx(() => {
        const b = byId(id);
        if (!["pending", "confirmed", "reschedule_proposed"].includes(b.status))
          fail(409, "STATE", "Cette demande est close ou expirée.");
        if (cmd.action === "confirm") {
          if (b.status !== "pending")
            fail(
              409,
              "STATE",
              "Seule une demande en attente peut être confirmée.",
            );
          checkStart(b.start, packFor(b.pack));
          ensureSlot(b.start, b.end, b.id);
          b.status = "confirmed";
          event(
            b,
            "Réservation confirmée par l’équipe (notification simulée).",
          );
        } else if (cmd.action === "reject") {
          if (b.status === "reschedule_proposed")
            fail(409, "STATE", "Traitez d’abord la proposition de report.");
          b.reason = text(cmd.reason, "Motif", 3, 500);
          b.status = "rejected";
          event(b, `Demande refusée : ${b.reason}`);
        } else if (cmd.action === "reschedule") {
          if (b.status === "reschedule_proposed")
            fail(409, "STATE", "Une proposition est déjà en cours.");
          const reason = text(cmd.reason, "Motif", 3, 500);
          const times = checkStart(cmd.start, packFor(b.pack));
          if (times.start === b.start)
            fail(400, "VALIDATION", "Choisissez un horaire différent.");
          ensureSlot(times.start, times.end, b.id);
          b.previousStatus = b.status;
          b.status = "reschedule_proposed";
          b.proposal = { ...times, reason, expiresAt: now() + DAY };
          event(
            b,
            `Report proposé : ${reason}. Les deux créneaux sont temporairement protégés.`,
          );
        } else fail(400, "VALIDATION", "Action inconnue.");
        save(b);
        return b;
      });
    },
    respond(token, accept) {
      return tx(() => {
        const b = byToken(token);
        if (b.status !== "reschedule_proposed")
          fail(409, "STATE", "Aucune proposition de report active.");
        if (typeof accept !== "boolean")
          fail(400, "VALIDATION", "Réponse au report invalide.");
        if (accept) {
          checkStart(b.proposal.start, packFor(b.pack));
          ensureSlot(b.proposal.start, b.proposal.end, b.id);
          b.start = b.proposal.start;
          b.end = b.proposal.end;
          b.status = "confirmed";
          event(
            b,
            "Report accepté par le client de démonstration : nouveau créneau confirmé.",
          );
        } else {
          b.status = b.previousStatus;
          event(
            b,
            "Report refusé par le client de démonstration : ancien créneau conservé.",
          );
          if (b.status === "pending" && b.holdUntil <= now())
            b.status = "expired";
        }
        b.proposal = null;
        b.previousStatus = null;
        save(b);
        return b;
      });
    },
    close() {
      db.close();
    },
  };
}
