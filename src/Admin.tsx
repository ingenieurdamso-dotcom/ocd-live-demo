import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  LayoutList,
  LogOut,
  RefreshCw,
  Search,
  Check,
  X,
  Clock3,
  ShieldCheck,
  LoaderCircle,
  Radio,
  Bell,
  LockKeyhole,
  Eye,
} from "lucide-react";
import type { Pack, Reservation } from "./types";
import { day, hour, future, today } from "./types";
import { api, ApiError } from "./api";
import { createAsyncScope, type Freshness } from "./asyncScope";
import { ErrorBox, StatusBadge, FreshnessNotice } from "./components";
import { previewBookings } from "./demo";
export function Admin({
  packs,
  online,
  preview = false,
}: {
  packs: Pack[];
  online: boolean;
  preview?: boolean;
}) {
  const [session, setSession] = useState<{
      csrf: string;
      username: string;
    } | null>(null),
    [checking, setChecking] = useState(!preview),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [bookings, setBookings] = useState<Reservation[]>(
      preview ? previewBookings : [],
    );
  const [selected, setSelected] = useState(""),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [view, setView] = useState<"list" | "planning" | "notifications">("list"),
    [command, setCommand] = useState<
      "confirm" | "reject" | "reschedule" | null
    >(null),
    [reason, setReason] = useState(""),
    [newStart, setNewStart] = useState("");
  const [freshness, setFreshness] = useState<Freshness>(
      preview ? "fresh" : "loading",
    ),
    [updated, setUpdated] = useState("");
  const scope = useRef(createAsyncScope()),
    authScope = useRef(createAsyncScope()),
    sessionRef = useRef(session),
    selectedRef = useRef(selected);
  sessionRef.current = session;
  selectedRef.current = selected;
  function clearSession() {
    scope.current.invalidate();
    authScope.current.invalidate();
    sessionRef.current = null;
    setSession(null);
    setBookings([]);
    setSelected("");
    setPassword("");
    setCommand(null);
    setReason("");
    setNewStart("");
    setUpdated("");
    setFreshness("stale");
    setBusy(false);
  }
  async function load() {
    const activeSession = sessionRef.current;
    if (preview || !activeSession || !online || authScope.current.mutating)
      return;
    const ticket = scope.current.read();
    if (!ticket) return;
    const valid = () =>
      scope.current.current(ticket) && sessionRef.current === activeSession;
    setFreshness("loading");
    try {
      const data = await api<{ bookings: Reservation[] }>("/admin/bookings");
      if (valid()) {
        setBookings(data.bookings);
        setError("");
        setFreshness("fresh");
        setUpdated(new Date().toISOString());
      }
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        setFreshness("stale");
        if ((e as ApiError).status === 401) clearSession();
      }
    }
  }
  useEffect(() => {
    if (preview) {
      setChecking(false);
      return;
    }
    const ticket = authScope.current.read();
    api<{ csrf: string; username: string }>("/admin/session")
      .then((s) => {
        if (authScope.current.current(ticket)) {
          sessionRef.current = s;
          setSession(s);
        }
      })
      .catch((e) => {
        if (authScope.current.current(ticket)) {
          sessionRef.current = null;
          setSession(null);
          if ((e as ApiError).status !== 401) setError((e as Error).message);
        }
      })
      .finally(() => {
        if (authScope.current.current(ticket)) setChecking(false);
      });
    return () => {
      authScope.current.invalidate();
      scope.current.invalidate();
    };
  }, [preview]);
  useEffect(() => {
    if (!online) {
      scope.current.invalidate();
      setFreshness("stale");
      setBusy(false);
      return;
    }
    if (!session || preview) return;
    void load();
    const timer = setInterval(() => void load(), 30000),
      focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      scope.current.invalidate();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [session, online, preview]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !online) return;
    const ticket = authScope.current.mutate();
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const s = await api<{ csrf: string; username: string }>("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (authScope.current.current(ticket)) {
        scope.current.invalidate();
        sessionRef.current = s;
        setPassword("");
        setSession(s);
      }
    } catch (e) {
      if (authScope.current.current(ticket)) setError((e as Error).message);
    } finally {
      if (authScope.current.current(ticket)) {
        authScope.current.finish(ticket);
        setBusy(false);
      }
    }
  }
  async function logout() {
    if (!session || busy || !online) return;
    const ticket = authScope.current.mutate();
    if (!ticket) return;
    scope.current.invalidate();
    setFreshness("stale");
    setBusy(true);
    try {
      await api("/admin/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrf },
        body: "{}",
      });
      if (authScope.current.current(ticket)) clearSession();
    } catch (e) {
      if (authScope.current.current(ticket)) setError((e as Error).message);
    } finally {
      if (authScope.current.current(ticket)) {
        authScope.current.finish(ticket);
        setBusy(false);
      }
    }
  }
  const chosen = bookings.find((b) => b.id === selected);
  const filtered = bookings.filter(
    (b) =>
      (status === "all" || b.status === status) &&
      `${b.business} ${b.name} ${b.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function act(e: React.FormEvent) {
    e.preventDefault();
    if (
      !chosen ||
      !session ||
      !command ||
      preview ||
      busy ||
      !online ||
      freshness !== "fresh" ||
      authScope.current.mutating
    )
      return;
    const ticket = scope.current.mutate();
    if (!ticket) return;
    const activeSession = session,
      selectedId = chosen.id;
    const valid = () =>
      scope.current.current(ticket) && sessionRef.current === activeSession;
    setBusy(true);
    setFreshness("loading");
    setError("");
    try {
      const b = await api<Reservation>(`/admin/bookings/${selectedId}/action`, {
        method: "POST",
        headers: { "X-CSRF-Token": activeSession.csrf },
        body: JSON.stringify({
          action: command,
          reason,
          start: newStart ? newStart + ":00Z" : undefined,
        }),
      });
      if (valid()) {
        setBookings((list) => list.map((x) => (x.id === b.id ? b : x)));
        setFreshness("fresh");
        setUpdated(new Date().toISOString());
        if (selectedRef.current === selectedId) {
          setCommand(null);
          setReason("");
          setNewStart("");
        }
      }
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        setFreshness("stale");
        if ((e as ApiError).status === 401) clearSession();
      }
    } finally {
      if (valid()) {
        scope.current.finish(ticket);
        setBusy(false);
      }
    }
  }
  function select(b: Reservation) {
    selectedRef.current = b.id;
    setSelected(b.id);
    setCommand(null);
    setError("");
    setReason("");
    setNewStart("");
  }
  if (checking)
    return (
      <main id="main" className="wrap loading-state">
        <LoaderCircle className="spin" /> Vérification de votre session…
      </main>
    );
  if (!preview && !session)
    return (
      <main id="main" className="login-page wrap">
        <section className="login-story">
          <span className="eyebrow orange">LE LIVE COMMENCE EN COULISSES.</span>
          <h1>
            Tout le planning.
            <br />
            Toute l’équipe.
            <br />
            <em>Au même endroit.</em>
          </h1>
          <p>
            Demandes, confirmations et reports : un espace pour garder le
            contrôle, sans compliquer la vie des entrepreneurs.
          </p>
          <div className="login-features">
            <span>
              <CalendarDays size={19} /> Un seul planning partagé
            </span>
            <span>
              <ShieldCheck size={19} /> Les conflits bloqués côté serveur
            </span>
            <span>
              <Bell size={19} /> Un journal interne, sans envoi réel
            </span>
          </div>
          <a className="text-link" href="/demo-equipe">
            Voir l’aperçu fictif en lecture seule <ArrowUpRight size={17} />
          </a>
        </section>
        <section className="login-card">
          <span className="login-icon">
            <LockKeyhole size={25} />
          </span>
          <span className="eyebrow">ESPACE ÉQUIPE</span>
          <h2>Bienvenue en coulisses.</h2>
          <p>Connectez-vous avec votre compte administrateur local.</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <form onSubmit={login}>
            <label htmlFor="username">
              Identifiant
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label htmlFor="password">
              Mot de passe
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <button
              className="btn btn-dark"
              type="submit"
              disabled={busy || !online}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  Se connecter <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <p className="login-note">
            <ShieldCheck size={15} /> Session serveur protégée. Aucun mot de
            passe public ou compte officiel Bovann.
          </p>
        </section>
      </main>
    );
  const active = bookings.filter((b) =>
    ["pending", "confirmed", "reschedule_proposed"].includes(b.status),
  );
  const days = Array.from({ length: 7 }, (_, i) => future(i));
  return (
    <main id="main" className="admin-page wrap">
      {preview && (
        <div className="preview-notice">
          <Eye size={20} />
          <div>
            <strong>Aperçu équipe · Lecture seule</strong>
            <p>
              Exemples fictifs indépendants des demandes enregistrées. Pour
              traiter une vraie demande de démonstration, connectez-vous à
              l’espace protégé.
            </p>
          </div>
          <a href="/admin" className="btn btn-dark btn-small">
            Se connecter <ArrowUpRight size={16} />
          </a>
        </div>
      )}
      <div className="admin-heading">
        <div>
          <span className="eyebrow orange">LES COULISSES D’OCD LIVE</span>
          <h1>
            Bonjour, l’équipe<span className="orange">.</span>
          </h1>
          <p>Chaque demande est une opportunité. Organisons la suite.</p>
        </div>
        <div className="admin-header-actions">
          <span className="secure-note">
            <span className="signal-dot" />
            {preview ? "Exemples fictifs" : "Session administrateur"}
          </span>
          {!preview && (
            <button
              className="btn btn-line btn-small"
              onClick={() => void logout()}
              disabled={busy || !online}
            >
              <LogOut size={15} /> Déconnexion
            </button>
          )}
        </div>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!preview && (
        <FreshnessNotice
          status={freshness}
          updated={updated}
          online={online}
          blocked={busy}
          onRefresh={() => void load()}
        />
      )}
      <div className="stats-grid">
        {[
          {
            label: "Demandes à étudier",
            count: bookings.filter((b) => b.status === "pending").length,
            icon: <Clock3 />,
            note: "Une réponse avant 24 h",
            className: "orange-stat",
          },
          {
            label: "Sessions confirmées",
            count: bookings.filter((b) => b.status === "confirmed").length,
            icon: <Check />,
            note: "Un créneau, un seul live",
            className: "",
          },
          {
            label: "Reports proposés",
            count: bookings.filter((b) => b.status === "reschedule_proposed")
              .length,
            icon: <CalendarDays />,
            note: "En attente de l’accord client",
            className: "",
          },
          {
            label: "Notifications internes",
            count: bookings.reduce((n, b) => n + b.events.length, 0),
            icon: <Bell />,
            note: "Simulées · aucun email",
            className: "",
          },
        ].map((s) => (
          <article className={`stat-card ${s.className}`} key={s.label}>
            <div>
              <span>{s.label}</span>
              {s.icon}
            </div>
            <strong>{s.count.toString().padStart(2, "0")}</strong>
            <small>{s.note}</small>
          </article>
        ))}
      </div>
      <div className="admin-tabs">
        <div role="tablist" aria-label="Vue administrative">
          {[
            {
              id: "list",
              title: "Les demandes",
              icon: <LayoutList size={16} />,
            },
            {
              id: "planning",
              title: "Le planning",
              icon: <CalendarDays size={16} />,
            },
            {
              id: "notifications",
              title: "Notifications",
              icon: <Bell size={16} />,
            },
          ].map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              className={view === v.id ? "selected" : ""}
              onClick={() => setView(v.id as typeof view)}
            >
              {v.icon}
              {v.title}
            </button>
          ))}
        </div>
        {!preview && (
          <button
            className="btn btn-line btn-small"
            onClick={() => void load()}
            disabled={busy || !online}
          >
            <RefreshCw size={15} /> Actualiser
          </button>
        )}
      </div>
      <div className="admin-workspace">
        <section className="admin-data">
          {view === "list" && (
            <>
              <div className="table-toolbar">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Rechercher une demande"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher une activité, un nom…"
                  />
                </label>
                <select
                  aria-label="Filtrer par statut"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="confirmed">Confirmées</option>
                  <option value="reschedule_proposed">Reports proposés</option>
                  <option value="rejected">Refusées</option>
                  <option value="expired">Expirées</option>
                </select>
              </div>
              <div className="requests-list">
                <div className="requests-head">
                  <span>ACTIVITÉ / FORMULE</span>
                  <span>CRÉNEAU · LOMÉ UTC+0</span>
                  <span>STATUT</span>
                </div>
                {filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`request-row ${selected === b.id ? "selected" : ""}`}
                    onClick={() => select(b)}
                  >
                    <span className="request-identity">
                      <span className="avatar">
                        {b.business.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{b.business}</strong>
                        <small>
                          {packs.find((p) => p.id === b.pack)?.name} ·{" "}
                          {b.mode === "studio" ? "Studio" : "Distance"}
                        </small>
                      </span>
                    </span>
                    <span className="request-time">
                      <strong>{day(b.start)}</strong>
                      <small>
                        {hour(b.start)} à {hour(b.end)}
                      </small>
                    </span>
                    <span className="request-status">
                      <StatusBadge status={b.status} />
                      <ArrowUpRight size={17} />
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <LayoutList size={30} />
                    <h3>Aucune demande ici pour le moment.</h3>
                    <p>
                      Les demandes de démonstration apparaissent après leur
                      enregistrement.
                    </p>
                    <a href="/reserver" className="text-link">
                      Créer une demande fictive <ArrowUpRight size={16} />
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
          {view === "planning" && (
            <>
              <div className="planning-heading">
                <h2>Une scène. Un planning.</h2>
                <p>
                  7 prochains jours · 09 h à 21 h · Lomé UTC+0. Les demandes en
                  attente et les reports protègent aussi leurs créneaux.
                </p>
              </div>
              <div className="planning-grid">
                {days.map((d) => (
                  <section key={d} className="planning-day">
                    <h3>{day(d + "T12:00:00Z")}</h3>
                    {active
                      .filter((b) => b.start.startsWith(d))
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={`planning-event ${b.status}`}
                          onClick={() => select(b)}
                        >
                          <strong>
                            {hour(b.start)} à {hour(b.end)}
                          </strong>
                          <span>{b.business}</span>
                          <small>
                            {b.mode === "studio" ? "Studio" : "Distance"}
                          </small>
                          <StatusBadge status={b.status} />
                        </button>
                      ))}
                    {active
                      .filter((b) => b.proposal?.start.startsWith(d))
                      .map((b) => (
                        <button
                          key={b.id + "proposal"}
                          className="planning-event proposal-event"
                          onClick={() => select(b)}
                        >
                          <strong>
                            {hour(b.proposal!.start)} à {hour(b.proposal!.end)}
                          </strong>
                          <span>{b.business}</span>
                          <small>Option de report · ancien conservé</small>
                        </button>
                      ))}
                    {!active.some(
                      (b) =>
                        b.start.startsWith(d) ||
                        b.proposal?.start.startsWith(d),
                    ) && (
                      <p className="planning-empty">Aucune session prévue</p>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "notifications" && (
            <section className="notifications-view">
              <span className="eyebrow orange">JOURNAL INTERNE SIMULÉ</span>
              <h2>Rien ne passe entre les mailles.</h2>
              <p>
                Ces notifications sont enregistrées dans l’application. Aucun
                email, SMS ou message n’est envoyé à l’extérieur.
              </p>
              <div className="notification-list">
                {bookings
                  .flatMap((b) => b.events.map((e) => ({ ...e, booking: b })))
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((e, i) => (
                    <button key={e.at + i} onClick={() => select(e.booking)}>
                      <span className="notification-icon">
                        <Bell size={17} />
                      </span>
                      <div>
                        <strong>{e.booking.business}</strong>
                        <p>{e.message}</p>
                        <small>
                          {day(e.at)} · {hour(e.at)} UTC+0 · SIMULÉ
                        </small>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                {bookings.length === 0 && (
                  <div className="empty-state">
                    Aucune notification pour le moment.
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
        {chosen ? (
          <aside className="request-detail">
            <div className="detail-top">
              <span className="eyebrow">DÉTAIL DE LA DEMANDE</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Fermer le détail"
                onClick={() => setSelected("")}
              >
                <X size={20} />
              </button>
            </div>
            <StatusBadge status={chosen.status} />
            <h2>{chosen.business}</h2>
            <p className="muted">
              #{chosen.id.toUpperCase()} · Données fictives
            </p>
            <dl className="detail-dl">
              <dt>CONTACT</dt>
              <dd>
                {chosen.name}
                <small>
                  {chosen.email}
                  <br />
                  {chosen.phone}
                  {chosen.country ? ` · ${chosen.country}` : ""}
                </small>
              </dd>
              {chosen.tiktok && (
                <>
                  <dt>COMPTES PUBLICS FICTIFS</dt>
                  <dd>{`TikTok ${chosen.tiktok}`}</dd>
                </>
              )}
              <dt>FORMULE</dt>
              <dd>
                {packs.find((p) => p.id === chosen.pack)?.name}
                <small>
                  {packs.find((p) => p.id === chosen.pack)?.credits === 4
                    ? "Première session de 90 min / 4 sessions proposées"
                    : "Une session"}{" "}
                  · {chosen.mode === "studio" ? "Studio Lomé" : "À distance"}
                </small>
              </dd>
              <dt>CRÉNEAU ACTUEL · UTC+0</dt>
              <dd>
                {day(chosen.start)}
                <small>
                  {hour(chosen.start)} à {hour(chosen.end)}
                </small>
              </dd>
              <dt>ACTIVITÉ</dt>
              <dd>
                {chosen.category}
                <small>{chosen.description}</small>
              </dd>
            </dl>
            {chosen.status === "pending" && (
              <div className="hold-notice">
                <Clock3 size={16} />
                <small>
                  Option jusqu’au{" "}
                  {day(new Date(chosen.holdUntil).toISOString())} à{" "}
                  {hour(new Date(chosen.holdUntil).toISOString())} UTC+0.
                </small>
              </div>
            )}
            {chosen.reason && (
              <div className="info-line">Motif : {chosen.reason}</div>
            )}
            {chosen.proposal && (
              <div className="admin-proposal">
                <strong>Report proposé</strong>
                <p>
                  {day(chosen.proposal.start)}
                  <br />
                  {hour(chosen.proposal.start)} à {hour(chosen.proposal.end)}{" "}
                  UTC+0
                </p>
                <p>{chosen.proposal.reason}</p>
                <small>
                  Accord du client nécessaire. Ancien créneau conservé.
                </small>
              </div>
            )}
            {!preview && (
              <a
                href={"/suivi#" + chosen.token}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Ouvrir le suivi client privé <ArrowUpRight size={15} />
              </a>
            )}
            {preview ? (
              <div className="preview-detail">
                <LockKeyhole size={19} />
                <p>
                  Aperçu en lecture seule. Aucune action n’est appliquée à un
                  dossier.
                </p>
                <a href="/admin" className="btn btn-dark btn-small">
                  Accéder à l’espace protégé
                </a>
              </div>
            ) : (
              <>
                {["pending", "confirmed"].includes(chosen.status) &&
                  !command && (
                    <div className="admin-action-buttons">
                      {chosen.status === "pending" && (
                        <button
                          className="btn btn-orange"
                          disabled={!online || busy || freshness !== "fresh"}
                          onClick={() => setCommand("confirm")}
                        >
                          <Check size={17} /> Confirmer
                        </button>
                      )}
                      <button
                        className="btn btn-line"
                        disabled={!online || busy || freshness !== "fresh"}
                        onClick={() => setCommand("reschedule")}
                      >
                        <CalendarDays size={17} /> Proposer un report
                      </button>
                      <button
                        className="btn btn-line danger"
                        disabled={!online || busy || freshness !== "fresh"}
                        onClick={() => setCommand("reject")}
                      >
                        Refuser la demande
                      </button>
                    </div>
                  )}
                {command && (
                  <form className="action-form" onSubmit={act}>
                    <h3>
                      {command === "confirm"
                        ? "Confirmer cette demande ?"
                        : command === "reject"
                          ? "Pourquoi ce refus ?"
                          : "Proposer un autre moment"}
                    </h3>
                    <p>
                      {command === "confirm"
                        ? "Le serveur revérifie la disponibilité et la validité de l’option avant confirmation."
                        : command === "reject"
                          ? "Le motif sera visible dans le suivi client. Le créneau sera libéré."
                          : "Le nouveau créneau sera protégé 24 h. Le client de démonstration doit l’accepter dans son suivi privé."}
                    </p>
                    {command === "reschedule" && (
                      <label htmlFor="reschedule-date">
                        Nouveau départ · Lomé UTC+0
                        <input
                          id="reschedule-date"
                          type="datetime-local"
                          step={1800}
                          min={today() + "T09:00"}
                          max={future(90) + "T21:00"}
                          value={newStart}
                          required
                          onChange={(e) => setNewStart(e.target.value)}
                        />
                        <small>
                          09 h à 21 h, durée complète incluse. Départs toutes
                          les 30 min. Contrôle de collision côté serveur.
                        </small>
                      </label>
                    )}
                    {command !== "confirm" && (
                      <label htmlFor="reason">
                        Motif
                        <textarea
                          id="reason"
                          value={reason}
                          required
                          minLength={3}
                          maxLength={500}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                        />
                      </label>
                    )}
                    <button
                      className="btn btn-orange"
                      disabled={!online || busy || freshness !== "fresh"}
                      type="submit"
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <>
                          Valider{" "}
                          {command === "reschedule"
                            ? "la proposition"
                            : "l’action"}{" "}
                          <Check size={16} />
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-line"
                      disabled={busy}
                      type="button"
                      onClick={() => setCommand(null)}
                    >
                      Annuler
                    </button>
                  </form>
                )}
              </>
            )}
          </aside>
        ) : (
          <aside className="detail-placeholder">
            <span>
              <Radio size={27} />
            </span>
            <h3>
              Chaque dossier
              <br />a son histoire.
            </h3>
            <p>
              Sélectionnez une demande pour consulter ses détails
              {preview ? "." : " et préparer la suite."}
            </p>
            <small>
              <ShieldCheck size={15} /> Un seul live à la fois, tous modes
              confondus.
            </small>
          </aside>
        )}
      </div>
      <div className="admin-footnote">
        <ShieldCheck size={17} />
        <p>
          Validation manuelle · Options de 24 h · Reports avec accord client ·
          Notifications simulées uniquement.
          <br />
          Tous les prix, données et règles sont des hypothèses de présentation.
          Pas un service officiel de Bovann.
        </p>
      </div>
    </main>
  );
}
