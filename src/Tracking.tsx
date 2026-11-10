import { useState, useEffect, useRef } from "react";
import {
  Check,
  Copy,
  ArrowUpRight,
  RefreshCw,
  Clock3,
  ShieldCheck,
  LoaderCircle,
  CalendarDays,
} from "lucide-react";
import type { Pack, Reservation } from "./types";
import { day, hour } from "./types";
import { api } from "./api";
import { createAsyncScope, type Freshness } from "./asyncScope";
import { StatusBadge, Summary, ErrorBox, FreshnessNotice } from "./components";
export function Tracking({
  packs,
  online,
}: {
  packs: Pack[];
  online: boolean;
}) {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [booking, setBooking] = useState<Reservation | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [updated, setUpdated] = useState(""),
    [freshness, setFreshness] = useState<Freshness>("loading");
  const generation = useRef(0),
    scope = useRef(createAsyncScope()),
    copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    tokenRef = useRef(token);
  tokenRef.current = token;
  useEffect(() => {
    const changed = () => {
      generation.current++;
      scope.current.invalidate();
      tokenRef.current = window.location.hash.slice(1);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setBusy(false);
      setCopied(false);
      setUpdated("");
      setBooking(null);
      setLoading(true);
      setFreshness("loading");
      setError("");
      setToken(tokenRef.current);
    };
    window.addEventListener("hashchange", changed);
    return () => {
      generation.current++;
      scope.current.invalidate();
      if (copyTimer.current) clearTimeout(copyTimer.current);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  async function load() {
    if (!token) {
      setLoading(false);
      return;
    }
    if (!online) return;
    const ticket = scope.current.read();
    if (!ticket) return;
    const current = generation.current;
    const valid = () =>
      current === generation.current &&
      token === tokenRef.current &&
      scope.current.current(ticket);
    setFreshness("loading");
    try {
      const result = await api<Reservation>("/booking/" + token);
      if (valid()) {
        setBooking(result);
        setError("");
        setUpdated(new Date().toISOString());
        setFreshness("fresh");
      }
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        setFreshness("stale");
      }
    } finally {
      if (valid()) setLoading(false);
    }
  }
  useEffect(() => {
    if (!online) {
      scope.current.invalidate();
      setLoading(false);
      setBusy(false);
      setFreshness("stale");
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 20000),
      focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      scope.current.invalidate();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [token, online]);
  async function respond(accept: boolean) {
    if (busy || !online || freshness !== "fresh") return;
    const ticket = scope.current.mutate();
    if (!ticket) return;
    const current = generation.current,
      requestedToken = token;
    const valid = () =>
      current === generation.current &&
      requestedToken === tokenRef.current &&
      scope.current.current(ticket);
    setBusy(true);
    setFreshness("loading");
    setError("");
    try {
      const result = await api<Reservation>(
        "/booking/" + requestedToken + "/respond",
        { method: "POST", body: JSON.stringify({ accept }) },
      );
      if (valid()) {
        setBooking(result);
        setUpdated(new Date().toISOString());
        setFreshness("fresh");
      }
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        setFreshness("stale");
      }
    } finally {
      if (valid()) {
        scope.current.finish(ticket);
        setBusy(false);
      }
    }
  }
  async function copy() {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (current !== generation.current) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        if (current === generation.current) setCopied(false);
      }, 2500);
    } catch {
      if (current === generation.current)
        setError(
          "La copie automatique n’est pas disponible. Copiez le lien de cette page dans votre barre d’adresse.",
        );
    }
  }
  const pack = packs.find((p) => p.id === booking?.pack);
  return (
    <main className="tracking-page wrap" id="main">
      {token && (
        <FreshnessNotice
          status={freshness}
          updated={updated}
          online={online}
          blocked={busy}
          onRefresh={() => void load()}
        />
      )}
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" /> Récupération de votre demande…
        </div>
      ) : !booking ? (
        <section className="empty-state large-empty">
          <CalendarDays size={38} />
          <h1>Votre demande, au même endroit.</h1>
          <p>
            {token
              ? "Impossible de charger ce dossier pour le moment."
              : "Ouvrez le lien privé affiché après l’enregistrement de votre demande."}
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <a href="/reserver" className="btn btn-orange">
            Préparer un live <ArrowUpRight size={18} />
          </a>
        </section>
      ) : (
        <>
          <div className="receipt-heading">
            <div
              className={`receipt-symbol ${booking.status === "confirmed" ? "confirmed" : ""}`}
            >
              {booking.status === "confirmed" ? (
                <Check size={28} />
              ) : (
                <Clock3 size={28} />
              )}
            </div>
            <span className="eyebrow orange">VOTRE ESPACE DE SUIVI PRIVÉ</span>
            <h1>
              {booking.status === "confirmed"
                ? "Votre live a sa place."
                : booking.status === "rejected"
                  ? "Une réponse de l’équipe."
                  : booking.status === "expired"
                    ? "Votre option a expiré."
                    : booking.status === "reschedule_proposed"
                      ? "Un autre moment à vous proposer."
                      : "Premier pas : c’est fait."}
            </h1>
            <p>
              {booking.status === "pending"
                ? "Votre demande est bien reçue. Elle attend encore la confirmation de l’équipe."
                : booking.status === "confirmed"
                  ? "Votre créneau est confirmé dans cette démonstration. Aucun email réel n’est envoyé."
                  : booking.status === "expired"
                    ? "La protection de 24 heures est terminée. Un nouveau choix et un nouveau contrôle sont nécessaires."
                    : booking.status === "rejected"
                      ? "Votre créneau a été libéré. Vous pouvez préparer une nouvelle demande."
                      : "Votre ancien créneau reste protégé jusqu’à votre réponse à la proposition."}
            </p>
            <StatusBadge status={booking.status} />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="receipt-card">
            <div className="receipt-card-top">
              <span className="eyebrow">
                DOSSIER #{booking.id.toUpperCase()}
              </span>
              <span>DONNÉES FICTIVES</span>
            </div>
            <Summary reservation={booking} pack={pack} />
            {booking.status === "pending" && (
              <div className="hold-notice">
                <Clock3 size={18} />
                <span>
                  Option valable jusqu’au{" "}
                  {day(new Date(booking.holdUntil).toISOString())} à{" "}
                  {hour(new Date(booking.holdUntil).toISOString())} · UTC+0. Une
                  demande reçue n’est pas encore une confirmation.
                </span>
              </div>
            )}
            {booking.reason && (
              <div className="hold-notice">
                <span>
                  <strong>Motif de l’équipe :</strong> {booking.reason}
                </span>
              </div>
            )}
            <div className="receipt-business">
              <h3>{booking.business}</h3>
              <p>
                {booking.name} · {booking.category}
              </p>
              <p>{booking.description}</p>
              <small>
                {booking.email} · {booking.phone}
                {booking.country ? ` · ${booking.country}` : ""}
                {booking.tiktok ? ` · TikTok ${booking.tiktok}` : ""}
              </small>
            </div>
          </div>
          {booking.status === "reschedule_proposed" && booking.proposal && (
            <section className="proposal-card">
              <span className="eyebrow orange">
                À VOUS DE CHOISIR · SIMULATION CLIENT
              </span>
              <h2>Ce nouveau moment vous convient ?</h2>
              <p>{booking.proposal.reason}</p>
              <div className="proposal-time">
                <CalendarDays size={24} />
                <div>
                  <strong>{day(booking.proposal.start)}</strong>
                  <span>
                    {hour(booking.proposal.start)} à{" "}
                    {hour(booking.proposal.end)} · Lomé UTC+0
                  </span>
                </div>
              </div>
              <p className="muted">
                Proposition valable jusqu’au{" "}
                {day(new Date(booking.proposal.expiresAt).toISOString())} à{" "}
                {hour(new Date(booking.proposal.expiresAt).toISOString())} ·
                UTC+0. Un refus conserve l’ancien état ; une acceptation
                confirme le nouveau créneau.
              </p>
              <div className="proposal-actions">
                <button
                  className="btn btn-orange"
                  disabled={!online || busy || freshness !== "fresh"}
                  onClick={() => void respond(true)}
                >
                  <Check size={18} /> Accepter le report
                </button>
                <button
                  className="btn btn-line"
                  disabled={!online || busy || freshness !== "fresh"}
                  onClick={() => void respond(false)}
                >
                  Conserver l’ancien créneau
                </button>
              </div>
            </section>
          )}
          <div className="private-link-card">
            <ShieldCheck size={23} />
            <div>
              <h3>Ce lien est votre clé. Gardez-le privé.</h3>
              <p>
                Il permet de consulter votre dossier et de répondre à un report.
                Aucun compte ni email n’est nécessaire. Ne le partagez pas
                publiquement.
              </p>
            </div>
            <button className="btn btn-line" onClick={() => void copy()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? "Lien copié" : "Copier mon lien"}
            </button>
          </div>
          <section className="timeline-section">
            <div className="field-heading">
              <h2>Le fil de votre demande</h2>
              <button
                type="button"
                className="btn btn-line btn-small"
                disabled={!online || busy}
                onClick={() => void load()}
              >
                <RefreshCw size={15} /> Actualiser
              </button>
            </div>
            <p className="muted">
              Notifications internes simulées uniquement · Aucun message externe
            </p>
            <ol className="event-list">
              {[...booking.events].reverse().map((event, i) => (
                <li key={event.at + i}>
                  <span className="event-dot" />
                  <div>
                    <p>{event.message}</p>
                    <small>
                      {day(event.at)} · {hour(event.at)} UTC+0
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <div className="receipt-bottom">
            <a className="text-link" href="/reserver">
              Préparer une autre demande <ArrowUpRight size={17} />
            </a>
            <span className="muted">Démo non officielle conçue par Adama</span>
          </div>
        </>
      )}
    </main>
  );
}
