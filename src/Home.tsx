import type { Pack } from "./types";
import { money, duration } from "./types";
import { PackCard, LivePill } from "./components";
export function Home({ packs }: { packs: Pack[] }) {
  const lead = packs.find((p) => p.id === "decouverte") || packs[0];
  return (
    <main id="main">
      <section className="hero wrap">
        <div className="hero-copy">
          <LivePill />
          <h1>
            Votre business.
            <br />
            Votre scène.
            <br />
            <em>Votre live.</em>
          </h1>
          <p className="hero-lead">
            Vous avez les produits. Vous avez l’énergie.
            <br />
            Prenez le micro, on prépare le créneau.
          </p>
          <p className="hero-offer">
            {lead.name} · {duration(lead.duration)} · {money(lead.price)} FCFA
            <span> tarif de démonstration</span>
          </p>
          <div className="hero-actions">
            <a className="btn btn-orange btn-large" href="/reserver">
              Je réserve ma session
            </a>
            <a className="text-link" href="#comment">
              Comment ça marche
            </a>
          </div>
          <p className="hero-note">
            Sans compte. Sans paiement. Validation par l’équipe.
          </p>
        </div>
        <div
          className="hero-visual"
          aria-label="Illustration du studio OCD Live, aucune diffusion réelle"
        >
          <div className="studio-topline">
            <span>
              <span className="signal-dot" /> VOTRE PROCHAINE OPPORTUNITÉ
            </span>
            <span>LOMÉ · UTC+0</span>
          </div>
          <div className="studio-scene">
            <div className="studio-spot spot-left" />
            <div className="studio-spot spot-right" />
            <div className="studio-rings ring-one" />
            <div className="studio-rings ring-two" />
            <div className="studio-brand">
              <img src="/ocd-logo.png" alt="OCD" />
              <span>LIVE</span>
            </div>
            <div className="studio-title">
              LA SCÈNE
              <br />
              EST À VOUS<span>↗</span>
            </div>
            <div className="studio-floor" />
            <div className="on-air">STUDIO DE VENTE EN DIRECT</div>
            <div className="studio-coordinate">
              06°08′ N<br />
              01°12′ E
            </div>
          </div>
          <div className="studio-bottom">
            <div>
              <strong>De chez vous. Ou de chez nous.</strong>
              <span>Un même élan, deux façons de passer en live.</span>
            </div>
          </div>
          <div className="floating-ticket">
            <div>
              <small>LE PREMIER PAS</small>
              <strong>Choisir votre moment.</strong>
            </div>
          </div>
        </div>
      </section>
      <div className="belief-strip">
        <span>LES OPPORTUNITÉS C’EST DEHORS</span>
        <span className="asterisk">✳</span>
        <span>VOTRE BUSINESS MÉRITE SA SCÈNE</span>
        <span className="asterisk">✳</span>
        <span>ON PASSE À L’ACTION</span>
      </div>
      <section className="intro-section wrap" id="comment">
        <div className="section-heading">
          <div>
            <span className="eyebrow orange">SIMPLE COMME UN BONJOUR</span>
            <h2>
              Moins de démarches.
              <br />
              Plus d’opportunités.
            </h2>
          </div>
          <p>
            OCD Live, c’est l’idée d’une scène ouverte aux entrepreneurs. Cette
            démo transforme l’idée en un parcours clair, du choix du live à la
            confirmation.
          </p>
        </div>
        <ol className="steps-grid">
          {[
            {
              n: "01",
              title: "Votre façon de venir",
              text: "En studio à Lomé ou à distance. Choisissez ce qui convient à votre activité.",
            },
            {
              n: "02",
              title: "Votre formule, votre moment",
              text: "Six formules illustratives et des créneaux contrôlés en temps réel.",
            },
            {
              n: "03",
              title: "L’équipe prend le relais",
              text: "Votre demande est étudiée, puis confirmée. Vous gardez un lien privé pour la suivre.",
            },
          ].map((s) => (
            <li className="how-card" key={s.n}>
              <span className="how-index">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="packs-section" id="formules">
        <div className="wrap">
          <div className="section-heading">
            <div>
              <span className="eyebrow orange">
                À CHAQUE AMBITION, SA FORMULE
              </span>
              <h2>
                Votre élan.
                <br />
                Votre format.
              </h2>
            </div>
            <div>
              <p>
                Du premier passage à un rendez-vous régulier : trouvez le format
                qui raconte le mieux votre business.
              </p>
              <div className="price-notice">
                <span /> Tarifs de démonstration, non validés par Bovann.
              </div>
            </div>
          </div>
          <div className="packs-grid">
            {packs.map((pack) => (
              <PackCard key={pack.id} pack={pack} />
            ))}
          </div>
          <p className="packs-footnote">
            Aucune promesse d’audience ou de ventes. Pas de paiement dans cette
            démonstration. Mensuel : seule la première session est planifiée ici
            ; les trois autres restent à convenir.
          </p>
        </div>
      </section>
      <section className="formats-section wrap">
        <div className="format-intro">
          <span className="eyebrow orange">LE MÊME ÉLAN. DEUX FAÇONS.</span>
          <h2>
            La distance
            <br />
            n’est pas un frein.
          </h2>
          <p>Un seul planning, pour que chaque live ait toute sa place.</p>
        </div>
        <article className="format-card">
          <span className="eyebrow">01 / EN PRÉSENTIEL</span>
          <h3>
            Direction
            <br />
            le studio.
          </h3>
          <p>
            Votre session à Lomé. L’adresse et les détails d’accueil sont à
            organiser avec l’équipe après validation.
          </p>
          <span className="format-bottom">LOMÉ, TOGO</span>
        </article>
        <article className="format-card format-dark">
          <span className="eyebrow">02 / À DISTANCE</span>
          <h3>
            Votre business,
            <br />
            où vous êtes.
          </h3>
          <p>
            Pas besoin de venir à Lomé. La connexion et le déroulement du live
            sont à convenir avec l’équipe.
          </p>
          <span className="format-bottom">L’ESSENTIEL, C’EST VOUS</span>
        </article>
      </section>
      <section className="faq-section wrap">
        <div>
          <span className="eyebrow orange">ON VOUS RÉPOND</span>
          <h2>Tout simplement.</h2>
          <p>
            Le fonctionnement proposé pour la démo,
            <br />
            sans petits caractères cachés.
          </p>
        </div>
        <div className="faq-list">
          {[
            [
              "Est-ce une plateforme officielle de Bovann ?",
              "Non. C’est une proposition fonctionnelle conçue par Adama pour présenter le projet OCD Live. Bovann n’a validé ni ces offres, ni leurs tarifs, ni les règles de cette démonstration.",
            ],
            [
              "Mon créneau est-il confirmé immédiatement ?",
              "Non. Votre demande protège temporairement le créneau pendant 24 heures. L’équipe doit la confirmer. Sans validation dans ce délai, l’option expire et le créneau redevient disponible.",
            ],
            [
              "Et si deux personnes choisissent le même créneau ?",
              "Le serveur revérifie chaque demande et n’accepte qu’une seule réservation à la fois, studio et distance confondus. Si le créneau est pris, vous en choisissez un autre sans perdre vos informations.",
            ],
            [
              "Comment fonctionne un changement de créneau ?",
              "L’équipe propose un report et protège provisoirement le nouveau créneau. Vous acceptez ou refusez via votre lien privé. L’ancien reste conservé jusqu’à l’accord ; la proposition expire après 24 heures.",
            ],
            [
              "Dois-je payer ou installer une application ?",
              "Non. Aucun paiement réel n’est possible ici, et aucun compte client n’est requis. L’installation PWA est facultative quand le navigateur la permet. Les disponibilités et l’envoi nécessitent une connexion.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <div className="wrap">
          <span className="eyebrow">
            LE PROCHAIN LIVE POURRAIT ÊTRE LE VÔTRE.
          </span>
          <div>
            <h2>
              On passe
              <br />
              <em>à l’action ?</em>
            </h2>
            <a className="btn btn-cream btn-large" href="/reserver">
              Trouver mon créneau
            </a>
          </div>
          <p>
            Une idée à montrer. Une activité à faire connaître. Un premier pas à
            faire.
          </p>
          <p className="proposal-credit">
            Proposition non officielle d’Adama · Tous les tarifs et services
            restent à valider avec Bovann.
          </p>
        </div>
      </section>
    </main>
  );
}
