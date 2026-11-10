import type { ReactNode } from "react";
import type { Pack, Reservation } from "./types";
import { money, day, hour, duration } from "./types";
export function Logo() {
  return (
    <a className="brand" href="/" aria-label="OCD Live, accueil">
      <span className="brand-mark">
        <img
          src="/ocd-logo.png"
          alt="Logo OCD extrait d’une vidéo de Bovann"
          width="84"
          height="37"
        />
      </span>
      <strong>
        Live<span className="brand-dot">.</span>
      </strong>
    </a>
  );
}
export function DemoBar() {
  return (
    <div className="demo-bar" role="note">
      <span className="demo-main">
        <span className="demo-pip" aria-hidden="true" /> Proposition d’Adama ·
        Démonstration non officielle
      </span>
      <span className="demo-sep" aria-hidden="true">
        /
      </span>
      <span className="demo-extra">Aucun paiement ni email réel</span>
    </div>
  );
}
export function Header() {
  const active = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <>
      <DemoBar />
      <header className="site-header">
        <Logo />
        <nav aria-label="Navigation principale">
          <a href="/#formules">Les formules</a>
          <a href="/#comment">Comment ça marche</a>
          <a className={active === "/admin" ? "active" : ""} href="/admin">
            Espace équipe
          </a>
        </nav>
        <a className="btn btn-dark nav-cta" href="/reserver">
          Réserver un live
        </a>
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Logo />
        <p>
          Les opportunités c’est dehors.
          <br />
          Votre prochaine commence ici.
        </p>
      </div>
      <div>
        <strong>Une proposition, pas un service officiel.</strong>
        <p>
          Conçue par Adama pour présenter OCD Live.
          <br />
          Données fictives · Tarifs non validés · Aucun encaissement
        </p>
        <a href="/confidentialite">Confidentialité</a>
        <span> · </span>
        <a href="/mentions-legales">Mentions légales</a>
        <span> · </span>
        <a href="/admin">Équipe</a>
      </div>
      <div className="footer-end">
        LOMÉ, TOGO
        <br />
        <span>Heure locale · UTC+0</span>
        <br />
        <small>Prototype de présentation · 2026</small>
      </div>
    </footer>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "En attente",
    confirmed: "Confirmée",
    rejected: "Refusée",
    expired: "Expirée",
    reschedule_proposed: "Report proposé",
  };
  return (
    <span
      className={`status ${Object.hasOwn(labels, status) ? status : "unknown"}`}
    >
      <span />
      {labels[status] || "Statut inconnu"}
    </span>
  );
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error-box" role="alert">
      <div>{children}</div>
    </div>
  );
}
export function Offline({ online }: { online: boolean }) {
  return !online ? (
    <div className="offline-banner" role="status">
      Hors connexion : créneaux et statuts non actualisés. Les envois sont
      désactivés.
    </div>
  ) : null;
}
export function PackCard({
  pack,
  selected,
  onSelect,
  compact = false,
}: {
  pack: Pack;
  selected?: boolean;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <article
      className={`pack-card ${pack.featured ? "featured" : ""} ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
    >
      <div className="pack-top">
        <span className="eyebrow">{pack.eyebrow}</span>
        {pack.featured && <span className="tag">LE GRAND FORMAT</span>}
      </div>
      <h3>{pack.name}</h3>
      <p className="pack-description">{pack.description}</p>
      <div className="pack-price">
        {money(pack.price)}
        <span> FCFA</span>
      </div>
      <div className="pack-period">
        {pack.credits > 1
          ? "4 sessions proposées / mois"
          : `${duration(pack.duration)} de live`}
      </div>
      <ul>
        {pack.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {onSelect ? (
        <button
          type="button"
          className={`btn ${selected ? "btn-orange" : "btn-line"}`}
          aria-pressed={selected}
          onClick={() => onSelect(pack.id)}
        >
          {selected ? "Formule sélectionnée" : "Choisir cette formule"}
        </button>
      ) : (
        <a
          href={`/reserver?pack=${pack.id}`}
          className={`btn ${pack.featured ? "btn-orange" : "btn-line"}`}
        >
          Choisir cette formule
        </a>
      )}
    </article>
  );
}
export function Summary({
  reservation,
  pack,
}: {
  reservation: Reservation;
  pack?: Pack;
}) {
  return (
    <div className="summary-grid">
      <div>
        <span>FORMULE</span>
        <strong>{pack?.name || reservation.pack}</strong>
        <small>
          {pack ? duration(pack.duration) : ""}
          {pack?.credits && pack.credits > 1
            ? " · première des 4 sessions"
            : ""}
        </small>
      </div>
      <div>
        <span>PARTICIPATION</span>
        <strong>
          {reservation.mode === "studio" ? "Studio à Lomé" : "À distance"}
        </strong>
        <small>
          {reservation.mode === "studio"
            ? "Adresse précise après validation"
            : "Modalités à convenir avec l’équipe"}
        </small>
      </div>
      <div>
        <span>VOTRE CRÉNEAU</span>
        <strong>{day(reservation.start)}</strong>
        <small>
          {hour(reservation.start)} à {hour(reservation.end)} · Lomé UTC+0
        </small>
      </div>
      <div>
        <span>TARIF ILLUSTRATIF</span>
        <strong>{pack ? money(pack.price) : "non indiqué"} FCFA</strong>
        <small>Aucun paiement demandé</small>
      </div>
    </div>
  );
}
export function LivePill() {
  return (
    <span className="live-pill">
      <span className="live-dot" aria-hidden="true" /> LE LIVE, AUTREMENT
    </span>
  );
}

export function FreshnessNotice({
  status,
  updated,
  online,
  onRefresh,
  blocked = false,
}: {
  status: import("./asyncScope").Freshness;
  updated: string;
  online: boolean;
  onRefresh: () => void;
  blocked?: boolean;
}) {
  return (
    <div className="freshness-panel" aria-live="polite">
      {status !== "fresh" && (
        <div className="info-line">
          <span>
            {status === "loading"
              ? "Vérification en cours : les actions attendent une réponse récente du serveur."
              : "Données non actualisées. Actualisez avec succès avant une nouvelle action."}
          </span>
          <button
            type="button"
            className="text-button"
            disabled={!online || blocked || status === "loading"}
            onClick={onRefresh}
          >
            Recharger les données
          </button>
        </div>
      )}
      {updated && (
        <p className="muted">
          Dernière synchronisation réussie : {day(updated)} à {hour(updated)}{" "}
          UTC+0 · horodatage historique, pas une garantie de disponibilité.
        </p>
      )}
    </div>
  );
}
