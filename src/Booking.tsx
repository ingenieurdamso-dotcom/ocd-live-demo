import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  MapPin,
  Video,
  Clock3,
  ShieldCheck,
  LoaderCircle,
  CalendarDays,
  RefreshCw,
  Info,
} from "lucide-react";
import type { Pack, BookingData, Reservation, Slot } from "./types";
import { money, day, hour, duration, today, future } from "./types";
import { api, ApiError } from "./api";
import { createAsyncScope, type Freshness } from "./asyncScope";
import { idempotencyKey } from "./idempotencyKey";
import { PackCard, ErrorBox, FreshnessNotice } from "./components";
const steps = ["Formule", "Créneau", "Activité", "Récapitulatif"];
export function Booking({ packs, online }: { packs: Pack[]; online: boolean }) {
  const [step, setStep] = useState(0),
    [packId, setPack] = useState(() =>
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("pack") ||
          "decouverte"
        : "decouverte",
    ),
    [mode, setMode] = useState<"studio" | "remote">("studio");
  const pack = packs.find((p) => p.id === packId) || packs[0];
  const [date, setDate] = useState(future()),
    [start, setStart] = useState(""),
    [slots, setSlots] = useState<Slot[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [availabilityError, setAvailabilityError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [updated, setUpdated] = useState("");
  const [details, setDetails] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    tiktok: "",
    business: "",
    category: "",
    description: "",
    consent: false,
  });
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const submission = useRef<{
    fingerprint: string;
    key: string;
    payload: BookingData;
  } | null>(null);
  const scope = useRef(createAsyncScope());
  const sending = busy || scope.current.mutating;
  const [freshness, setFreshness] = useState<Freshness>("loading");
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step > 0) title.current?.focus();
  }, [step]);
  useEffect(
    () => () => {
      scope.current.invalidate();
    },
    [],
  );
  useEffect(() => {
    const dropIdle = () => {
      if (!scope.current.mutating) scope.current.invalidate();
    };
    if (!online) {
      setLoading(false);
      setFreshness("stale");
      if (scope.current.mutating) {
        setUncertain(true);
        setError(
          "Connexion interrompue : le résultat de l’envoi est inconnu. Récupérez le reçu du même envoi lorsque la connexion revient.",
        );
      } else scope.current.invalidate();
      setBusy(false);
      return dropIdle;
    }
    const ticket = scope.current.read();
    if (!ticket) return dropIdle;
    setLoading(true);
    setFreshness("loading");
    setAvailabilityError("");
    api<{ slots: Slot[]; serverTime: string }>(
      `/availability?date=${encodeURIComponent(date)}&pack=${encodeURIComponent(pack.id)}`,
    )
      .then((data) => {
        if (scope.current.current(ticket)) {
          setSlots(data.slots);
          setUpdated(data.serverTime);
          setFreshness("fresh");
          setStart((current) =>
            data.slots.some((s) => s.start === current && s.available)
              ? current
              : "",
          );
        }
      })
      .catch((e) => {
        if (scope.current.current(ticket)) {
          setAvailabilityError(e.message);
          setFreshness("stale");
          setSlots([]);
        }
      })
      .finally(() => {
        if (scope.current.current(ticket)) setLoading(false);
      });
    return dropIdle;
  }, [date, pack.id, online, refresh]);
  const selectPack = (id: string) => {
    if (sending || id === pack.id) return;
    scope.current.invalidate();
    setPack(id);
    setStart("");
    setError("");
    setUpdated("");
    setFreshness("loading");
  };
  const chooseDate = (value: string) => {
    if (sending || value === date) return;
    scope.current.invalidate();
    setDate(value);
    setStart("");
    setUpdated("");
    setFreshness("loading");
  };
  const reload = () => {
    if (!scope.current.mutating) setRefresh((r) => r + 1);
  };
  const update = (field: string, value: string | boolean) => {
    if (!sending) setDetails((d) => ({ ...d, [field]: value }));
  };
  function rememberSubmission(recover: boolean) {
    const kept = submission.current;
    const payload: BookingData =
      recover && kept
        ? kept.payload
        : { pack: pack.id, mode, start, ...details, instagram: "" };
    const fingerprint = JSON.stringify(payload);
    if (kept && kept.fingerprint === fingerprint) return kept;
    const next = { fingerprint, key: idempotencyKey(), payload };
    submission.current = next;
    return next;
  }
  async function send(recover = false) {
    if (
      !online ||
      sending ||
      (!recover && freshness !== "fresh") ||
      (recover && !submission.current)
    )
      return;
    const ticket = scope.current.mutate();
    if (!ticket) return;
    setError("");
    setBusy(true);
    setFreshness("loading");
    setLoading(false);
    try {
      const captured = rememberSubmission(recover);
      const result = await api<Reservation>("/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": captured.key },
        body: JSON.stringify(captured.payload),
      });
      if (scope.current.current(ticket)) {
        setUncertain(false);
        setFreshness("stale");
        window.location.assign("/suivi#" + result.token);
      }
    } catch (e) {
      if (!scope.current.current(ticket)) return;
      if (e instanceof ApiError) {
        setError(e.message);
        setUncertain(recover || e.status === 0);
        setFreshness("stale");
        if (e.code === "SLOT_CONFLICT" || e.code === "PAST") {
          setStep(1);
          setStart("");
          setRefresh((r) => r + 1);
        }
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de préparer la clé privée d’envoi. Réessayez.",
      );
      setFreshness("fresh");
    } finally {
      if (scope.current.current(ticket)) {
        scope.current.finish(ticket);
        setBusy(false);
      }
    }
  }
  function next(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError("");
    if (step === 1 && (!start || freshness !== "fresh" || !online)) {
      setError("Choisissez un créneau disponible pour continuer.");
      return;
    }
    if (step === 2 && !details.consent) {
      setError(
        "Utilisez uniquement des coordonnées fictives et cochez la confirmation.",
      );
      return;
    }
    if (step < 3) setStep((s) => s + 1);
    else void send();
  }
  return (
    <main className="booking-page wrap" id="main">
      <a className="back-link" href="/">
        <ArrowLeft size={15} /> Retour à l’accueil
      </a>
      <div className="booking-heading">
        <div>
          <span className="eyebrow orange">VOTRE PROCHAINE OPPORTUNITÉ</span>
          <h1>Faites place à votre live.</h1>
        </div>
        <span className="secure-note">
          <ShieldCheck size={16} /> Démo · Aucun paiement
        </span>
      </div>
      <div className="booking-layout">
        <section className="booking-main">
          <ol className="progress-steps" aria-label="Progression de la demande">
            {steps.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? "step" : undefined}
                className={i <= step ? "reached" : ""}
              >
                <button
                  type="button"
                  disabled={i > step || sending}
                  onClick={() => {
                    setStep(i);
                    setError("");
                  }}
                >
                  <span>{i < step ? <Check size={15} /> : i + 1}</span>
                  <strong>{s}</strong>
                </button>
              </li>
            ))}
          </ol>
          <FreshnessNotice
            status={freshness}
            updated={updated}
            online={online}
            blocked={sending}
            onRefresh={reload}
          />
          <form onSubmit={next}>
            <fieldset className="booking-fields" disabled={sending}>
              <div className="step-content">
                <div className="step-title">
                  <span className="eyebrow">ÉTAPE 0{step + 1} / 04</span>
                  <h2 ref={title} tabIndex={-1}>
                    {
                      [
                        "Votre live, à votre façon.",
                        "Choisissez votre moment.",
                        "Parlez-nous de votre business.",
                        "Tout est prêt ?",
                      ][step]
                    }
                  </h2>
                  <p>
                    {
                      [
                        "D’abord, le lieu. Ensuite, le format qui vous ressemble.",
                        "Tous les horaires sont en heure de Lomé · UTC+0.",
                        "Quelques informations pour préparer votre session. Données fictives uniquement.",
                        "Vérifiez votre dossier. Il sera ensuite soumis à validation manuelle.",
                      ][step]
                    }
                  </p>
                </div>
                {(error || availabilityError) && (
                  <ErrorBox>{error || availabilityError}</ErrorBox>
                )}
                {step === 0 && (
                  <>
                    <fieldset className="mode-fieldset">
                      <legend>Comment souhaitez-vous participer ?</legend>
                      <div className="mode-grid">
                        {[
                          {
                            id: "studio" as const,
                            icon: <MapPin size={23} />,
                            title: "Au studio, à Lomé",
                            text: "Venez avec votre énergie et vos produits.",
                          },
                          {
                            id: "remote" as const,
                            icon: <Video size={23} />,
                            title: "À distance",
                            text: "Rejoignez le live depuis là où vous êtes.",
                          },
                        ].map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            aria-pressed={mode === m.id}
                            onClick={() => setMode(m.id)}
                            className={`mode-card ${mode === m.id ? "selected" : ""}`}
                          >
                            <span className="mode-icon">{m.icon}</span>
                            <span>
                              <strong>{m.title}</strong>
                              <small>{m.text}</small>
                            </span>
                            <span className="radio-dot">
                              {mode === m.id && <Check size={13} />}
                            </span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="field-heading">
                      <h3>La formule qui vous ressemble</h3>
                      <span>6 possibilités</span>
                    </div>
                    <p className="price-inline">
                      Tarifs de démonstration, non validés par Bovann.
                    </p>
                    <div className="booking-packs">
                      {packs.map((p) => (
                        <PackCard
                          key={p.id}
                          pack={p}
                          selected={p.id === pack.id}
                          onSelect={selectPack}
                          compact
                        />
                      ))}
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <div className="calendar-toolbar">
                      <label htmlFor="booking-date">
                        Votre jour
                        <input
                          id="booking-date"
                          type="date"
                          min={today()}
                          max={future(90)}
                          value={date}
                          onChange={(e) => {
                            chooseDate(e.target.value);
                          }}
                          required
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-line btn-small"
                        disabled={!online || loading || sending}
                        onClick={reload}
                      >
                        <RefreshCw
                          size={15}
                          className={loading ? "spin" : ""}
                        />{" "}
                        Actualiser
                      </button>
                    </div>
                    <div className="quick-days">
                      {Array.from({ length: 7 }, (_, i) => future(i + 1)).map(
                        (d) => (
                          <button
                            key={d}
                            type="button"
                            className={date === d ? "selected" : ""}
                            aria-pressed={date === d}
                            onClick={() => {
                              chooseDate(d);
                            }}
                          >
                            <small>
                              {new Date(d).toLocaleDateString("fr-FR", {
                                weekday: "short",
                                timeZone: "Africa/Lome",
                              })}
                            </small>
                            <strong>{new Date(d).getUTCDate()}</strong>
                            <small>
                              {new Date(d).toLocaleDateString("fr-FR", {
                                month: "short",
                                timeZone: "Africa/Lome",
                              })}
                            </small>
                          </button>
                        ),
                      )}
                    </div>
                    <div className="field-heading">
                      <h3>{date ? day(date) : "Choisissez un jour"}</h3>
                      <span>{duration(pack.duration)} de live</span>
                    </div>
                    <div className="slot-legend">
                      <span>
                        <i className="legend-dot free" /> Disponible
                      </span>
                      <span>
                        <i className="legend-dot taken" /> Indisponible
                      </span>
                    </div>
                    {loading ? (
                      <div className="loading-state">
                        <LoaderCircle size={24} className="spin" /> Vérification
                        des disponibilités…
                      </div>
                    ) : (
                      <div className="slots-grid">
                        {slots.map((slot) => (
                          <button
                            type="button"
                            key={slot.start}
                            className={start === slot.start ? "selected" : ""}
                            disabled={
                              !slot.available ||
                              !online ||
                              freshness !== "fresh" ||
                              sending
                            }
                            aria-pressed={start === slot.start}
                            onClick={() => {
                              setStart(slot.start);
                              setError("");
                            }}
                          >
                            <strong>{hour(slot.start)}</strong>
                            <small>
                              {slot.available
                                ? `fin ${hour(slot.end)}`
                                : "Indisponible"}
                            </small>
                            {start === slot.start && <Check size={13} />}
                          </button>
                        ))}
                      </div>
                    )}
                    {!loading && slots.length === 0 && (
                      <div className="empty-state">
                        <CalendarDays size={27} />
                        <h3>Aucun créneau pour ce jour.</h3>
                        <p>
                          Choisissez un autre jour dans les 90 prochains jours.
                        </p>
                      </div>
                    )}
                    <div className="info-line">
                      <Info size={17} />
                      <span>
                        Une seule session à la fois, studio et distance
                        confondus. Votre créneau sera revérifié à l’envoi.
                      </span>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <div className="details-form">
                    <div className="fake-data-banner">
                      <ShieldCheck size={19} />
                      <span>
                        Cette démo n’accueille aucune donnée réelle. Utilisez
                        par exemple <strong>Amina Démo</strong> et{" "}
                        <strong>amina@example.test</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDetails({
                            name: "Amina Démo",
                            email: "amina@example.test",
                            phone: "+228 90000000",
                            country: "Togo",
                            tiktok: "@amina.demo",
                            business: "Atelier Amina Démo",
                            category: "Mode & accessoires",
                            description:
                              "Une collection fictive de sacs et accessoires faits main, présentée pour découvrir OCD Live.",
                            consent: true,
                          })
                        }
                      >
                        Remplir un exemple <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="form-row">
                      <label htmlFor="name">
                        Votre nom fictif
                        <input
                          id="name"
                          autoComplete="off"
                          maxLength={80}
                          minLength={2}
                          required
                          value={details.name}
                          onChange={(e) => update("name", e.target.value)}
                          placeholder="Amina Démo"
                        />
                      </label>
                      <label htmlFor="business">
                        Nom de votre activité fictive
                        <input
                          id="business"
                          autoComplete="off"
                          maxLength={100}
                          minLength={2}
                          required
                          value={details.business}
                          onChange={(e) => update("business", e.target.value)}
                          placeholder="Atelier Amina Démo"
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label htmlFor="email">
                        Email fictif
                        <input
                          id="email"
                          type="email"
                          autoComplete="off"
                          required
                          maxLength={160}
                          value={details.email}
                          onChange={(e) => update("email", e.target.value)}
                          placeholder="amina@example.test"
                        />
                        <small>Aucun email ne sera envoyé.</small>
                      </label>
                      <label htmlFor="phone">
                        Téléphone fictif
                        <input
                          id="phone"
                          type="tel"
                          autoComplete="off"
                          maxLength={30}
                          minLength={7}
                          pattern="[+0-9 ()-]{7,30}"
                          required
                          value={details.phone}
                          onChange={(e) => update("phone", e.target.value)}
                          placeholder="+228 90000000"
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label htmlFor="country">
                        Pays
                        <input
                          id="country"
                          autoComplete="off"
                          maxLength={56}
                          minLength={2}
                          required
                          value={details.country}
                          onChange={(e) => update("country", e.target.value)}
                          placeholder="Togo"
                        />
                      </label>
                      <label htmlFor="tiktok">
                        Compte TikTok fictif
                        <input
                          id="tiktok"
                          autoComplete="off"
                          maxLength={31}
                          minLength={2}
                          required
                          pattern="@?[A-Za-z0-9._]{2,30}"
                          value={details.tiktok}
                          onChange={(e) => update("tiktok", e.target.value)}
                          placeholder="@amina.demo"
                        />
                        <small>
                          Pseudo seulement. Aucun lien n’est accepté.
                        </small>
                      </label>
                    </div>
                    <label htmlFor="category">
                      Votre secteur
                      <select
                        id="category"
                        required
                        value={details.category}
                        onChange={(e) => update("category", e.target.value)}
                      >
                        <option value="">Choisissez votre secteur</option>
                        {[
                          "Mode & accessoires",
                          "Beauté & bien-être",
                          "Artisanat",
                          "Maison & décoration",
                          "Alimentation",
                          "Services",
                          "Autre activité",
                        ].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="description">
                      Qu’allez-vous présenter ?
                      <textarea
                        id="description"
                        rows={4}
                        minLength={10}
                        maxLength={1000}
                        required
                        value={details.description}
                        onChange={(e) => update("description", e.target.value)}
                        placeholder="Parlez de vos produits, de votre savoir-faire et de votre idée de live…"
                      />
                      <small>
                        {details.description.length}/1 000 caractères · Pas de
                        lien ou document nécessaire.
                      </small>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={details.consent}
                        required
                        onChange={(e) => update("consent", e.target.checked)}
                      />
                      <span>
                        Je confirme utiliser uniquement des données fictives et
                        comprends qu’il s’agit d’une démonstration non
                        officielle.{" "}
                        <a
                          href="/confidentialite"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Confidentialité
                        </a>
                        {" · "}
                        <a
                          href="/mentions-legales"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Mentions légales
                        </a>
                      </span>
                    </label>
                  </div>
                )}
                {step === 3 && (
                  <div className="recap">
                    <div className="recap-intro">
                      <span className="recap-icon">
                        <Check size={25} />
                      </span>
                      <div>
                        <h3>Votre opportunité prend forme.</h3>
                        <p>
                          Pas de paiement. Pas de promesse de vente. Juste le
                          premier pas.
                        </p>
                      </div>
                    </div>
                    <div className="recap-box">
                      <div>
                        <span>PARTICIPATION</span>
                        <strong>
                          {mode === "studio"
                            ? "Au studio, à Lomé"
                            : "À distance"}
                        </strong>
                        <button type="button" onClick={() => setStep(0)}>
                          Modifier
                        </button>
                      </div>
                      <div>
                        <span>FORMULE</span>
                        <strong>
                          {pack.name} · {duration(pack.duration)}
                          {pack.credits > 1 ? " · première session sur 4" : ""}
                        </strong>
                        <button type="button" onClick={() => setStep(0)}>
                          Modifier
                        </button>
                      </div>
                      <div>
                        <span>CRÉNEAU</span>
                        <strong>
                          {start ? day(start) : "À choisir"}
                          <small>
                            {start ? hour(start) : ""} à{" "}
                            {start
                              ? hour(
                                  new Date(
                                    Date.parse(start) + pack.duration * 60000,
                                  ).toISOString(),
                                )
                              : ""}{" "}
                            · Lomé UTC+0
                          </small>
                        </strong>
                        <button type="button" onClick={() => setStep(1)}>
                          Modifier
                        </button>
                      </div>
                      <div>
                        <span>ACTIVITÉ</span>
                        <strong>
                          {details.business}
                          <small>
                            {details.name} · {details.category}
                          </small>
                        </strong>
                        <button type="button" onClick={() => setStep(2)}>
                          Modifier
                        </button>
                      </div>
                      <div>
                        <span>CONTACT FICTIF</span>
                        <strong>
                          {details.email}
                          <small>
                            {details.phone}
                            {details.country ? ` · ${details.country}` : ""}
                          </small>
                          <small>
                            {details.tiktok ? `TikTok ${details.tiktok}` : ""}
                          </small>
                        </strong>
                        <button type="button" onClick={() => setStep(2)}>
                          Modifier
                        </button>
                      </div>
                      <p className="recap-description">{details.description}</p>
                    </div>
                    <div className="info-line">
                      <Clock3 size={18} />
                      <span>
                        Votre demande maintient une option de{" "}
                        <strong>24 heures</strong>. Elle n’est confirmée
                        qu’après validation de l’équipe. Le suivi se fait via
                        votre lien privé, sans email.
                      </span>
                    </div>
                    {pack.credits > 1 && (
                      <div className="info-line">
                        <Info size={18} />
                        <span>
                          Mensuel : les 3 autres sessions ne sont pas encore
                          planifiées. Les dates et le suivi des crédits restent
                          à organiser manuellement.
                        </span>
                      </div>
                    )}
                    {pack.promotion && (
                      <div className="info-line">
                        <Video size={18} />
                        <span>
                          La vidéo promotionnelle Bovann est une prestation
                          proposée : contenu et publication restent à convenir,
                          aucune vidéo n’est créée ou envoyée par cette démo.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="step-navigation">
                {step > 0 ? (
                  <button
                    type="button"
                    className="btn btn-line"
                    disabled={sending}
                    onClick={() => {
                      setStep((s) => s - 1);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} /> Retour
                  </button>
                ) : (
                  <small>Choix modifiables à l’étape suivante.</small>
                )}
                <button
                  type="submit"
                  className="btn btn-orange"
                  disabled={
                    sending ||
                    (step === 1 &&
                      (!start ||
                        loading ||
                        !online ||
                        freshness !== "fresh")) ||
                    (step === 3 && (!online || freshness !== "fresh"))
                  }
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={18} className="spin" />{" "}
                      Enregistrement…
                    </>
                  ) : step === 3 ? (
                    <>
                      Envoyer ma demande <ArrowUpRight size={18} />
                    </>
                  ) : (
                    <>
                      Continuer <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </fieldset>
            {uncertain && submission.current && (
              <div className="info-line">
                <Info size={18} />
                <span>
                  Réponse d’envoi incertaine. Cette page conserve temporairement
                  le dossier original et sa clé privée, même si vous modifiez le
                  formulaire. La récupération ne subsiste pas après rechargement
                  ou fermeture.
                </span>
                <button
                  type="button"
                  className="btn btn-line btn-small"
                  disabled={sending || !online}
                  onClick={() => void send(true)}
                >
                  Récupérer le reçu du même envoi
                </button>
              </div>
            )}
          </form>
        </section>
        <aside className="booking-aside">
          <div className="order-summary">
            <span className="eyebrow orange">VOTRE PROCHAIN LIVE</span>
            <div className="summary-big">
              {pack.name}
              <span>↗</span>
            </div>
            <div className="order-meta">
              <span>
                <Clock3 size={17} />
                {duration(pack.duration)}
                {pack.credits > 1 ? " · 1re session" : ""}
              </span>
              <span>
                {mode === "studio" ? <MapPin size={17} /> : <Video size={17} />}{" "}
                {mode === "studio" ? "Studio · Lomé" : "À distance"}
              </span>
              {start && (
                <span>
                  <CalendarDays size={17} />
                  <span>
                    {day(start)}
                    <br />
                    {hour(start)} · UTC+0
                  </span>
                </span>
              )}
            </div>
            <div className="order-price">
              <span>Tarif de démonstration</span>
              <strong>
                {money(pack.price)} <small>FCFA</small>
              </strong>
              <p>
                Illustratif, non validé par Bovann.
                <br />
                Aucun paiement n’est demandé.
              </p>
            </div>
            <div className="order-trust">
              <ShieldCheck size={17} />
              <p>
                Votre demande est revérifiée et validée par l’équipe. Aucun
                créneau confirmé sans contrôle.
              </p>
            </div>
          </div>
          <div className="aside-quote">
            « Les opportunités
            <br />
            c’est dehors. »<span>ET SI LA VÔTRE COMMENÇAIT ICI ?</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
