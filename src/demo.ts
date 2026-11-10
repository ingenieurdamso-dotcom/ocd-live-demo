import type { Reservation } from "./types";
import { future } from "./types";
// Aperçu public autonome : jamais alimenté par les dossiers réels du serveur.
export function previewBookings(): Reservation[] {
  return [
    {
      name: "Amina Démo",
      business: "Atelier Amina",
      pack: "decouverte",
      status: "pending",
      mode: "studio",
      at: "09:00",
      offset: 1,
      category: "Mode & accessoires",
    },
    {
      name: "Koffi Démo",
      business: "Maison Naya",
      pack: "session",
      status: "confirmed",
      mode: "studio",
      at: "12:00",
      offset: 1,
      category: "Maison & décoration",
    },
    {
      name: "Afi Démo",
      business: "Karité & Racines",
      pack: "visibilite",
      status: "reschedule_proposed",
      mode: "remote",
      at: "10:00",
      offset: 2,
      category: "Beauté & bien-être",
    },
    {
      name: "Moussa Démo",
      business: "Le Comptoir Créatif",
      pack: "mensuel",
      status: "pending",
      mode: "remote",
      at: "10:00",
      offset: 3,
      category: "Artisanat",
    },
    {
      name: "Éva Démo",
      business: "Studio Éva",
      pack: "essentiel",
      status: "rejected",
      mode: "studio",
      at: "15:00",
      offset: 4,
      category: "Services",
    },
  ].map((x, i) => {
    const start = future(x.offset) + "T" + x.at + ":00.000Z";
    return {
      id: "demo00000000000" + i,
      token: "",
      pack: x.pack,
      mode: x.mode as "studio" | "remote",
      start,
      end: new Date(
        Date.parse(start) +
          (x.pack === "session" || x.pack === "visibilite"
            ? 240
            : x.pack === "essentiel"
              ? 120
              : 90) *
            60000,
      ).toISOString(),
      name: x.name,
      email: "contact@example.test",
      phone: "+228 90000000",
      country: "Togo",
      tiktok: "@demo.ocd",
      instagram: "",
      business: x.business,
      category: x.category,
      description:
        "Dossier entièrement fictif pour présenter les outils de l’équipe OCD Live.",
      consent: true,
      status: x.status,
      createdAt: Date.now() - i * 3600000,
      holdUntil: Date.now() + 20 * 3600000,
      reason:
        x.status === "rejected"
          ? "Dossier fictif incomplet pour cette session."
          : "",
      proposal:
        x.status === "reschedule_proposed"
          ? {
              start: future(5) + "T10:00:00.000Z",
              end: future(5) + "T14:00:00.000Z",
              expiresAt: Date.now() + 86400000,
              reason: "Ajustement du planning, exemple de démonstration.",
            }
          : null,
      events: [
        {
          at: new Date().toISOString(),
          message:
            "Dossier fictif reçu : notification interne simulée. Aucun email envoyé.",
          simulated: true,
        },
      ],
    };
  });
}
