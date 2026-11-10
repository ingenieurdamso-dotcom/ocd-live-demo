import { useState, useEffect } from "react";
import {
  Download,
  ArrowUpRight,
  LoaderCircle,
  X,
  ShieldCheck,
} from "lucide-react";
import { Home } from "./Home";
import { Booking } from "./Booking";
import { Tracking } from "./Tracking";
import { Admin } from "./Admin";
import { Header, Footer, Offline, ErrorBox } from "./components";
import { LegalNotice } from "./LegalNotice";
import { api } from "./api";
import type { Pack } from "./types";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function App() {
  const [packs, setPacks] = useState<Pack[]>([]),
    [error, setError] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [installInfo, setInstallInfo] = useState(false);
  const route = window.location.pathname;
  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine)
        api<{ packs: Pack[] }>("/catalog")
          .then((d) => {
            setPacks(d.packs);
            setError("");
          })
          .catch((e) => setError(e.message));
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  async function requestInstall() {
    if (install) {
      await install.prompt();
      const choice = await install.userChoice;
      if (choice.outcome === "accepted") setInstall(null);
    } else setInstallInfo((v) => !v);
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <Header />
      <Offline online={online} />
      {error && (
        <div className="wrap app-error">
          <ErrorBox>
            {error}{" "}
            <button
              className="text-button"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          </ErrorBox>
        </div>
      )}
      {route === "/mentions-legales" ? (
        <LegalNotice />
      ) : route === "/confidentialite" ? (
        <main id="main" className="legal-page wrap">
          <span className="eyebrow orange">CLAIR DEPUIS LE PREMIER PAS</span>
          <h1>
            Une démonstration.
            <br />
            Pas un service officiel.
          </h1>
          <p>
            Cette PWA est une proposition conçue par Adama pour présenter le
            projet OCD Live. Elle n’est ni exploitée ni approuvée par Bovann ou
            Bovann Group.
          </p>
          <h2>Données fictives uniquement</h2>
          <p>
            N’utilisez aucun nom, numéro, email ou détail commercial réel. Les
            dossiers de démonstration sont conservés dans une base SQLite sur le
            serveur de la démo, hébergé par Render ; elle est effacée à chaque
            redémarrage ou mise en veille du service. Aucun prestataire
            d’analytics, publicité, email, SMS ou paiement n’est connecté.
          </p>
          <h2>Votre lien privé</h2>
          <p>
            Un jeton aléatoire permet de consulter votre demande et de répondre
            à un report. Il tient lieu de clé : toute personne possédant le lien
            pourrait accéder à ce dossier fictif. Il n’est pas stocké dans le
            cache hors connexion et n’est pas transmis à un service extérieur.
          </p>
          <h2>Règles proposées, pas contrats commerciaux</h2>
          <p>
            Tarifs en FCFA arbitraires, non validés. Une seule session à la
            fois, tous modes confondus. Planning de 09 h à 21 h, UTC+0 Lomé, sur
            90 jours. Une option protège un créneau 24 heures en attente de
            validation ; un report est soumis à accord. Le pack mensuel propose
            quatre sessions de 90 minutes : seule la première est réservée ici.
            La vidéo promotionnelle est à organiser manuellement. Aucun résultat
            de vente n’est garanti.
          </p>
          <h2>Administration et sécurité</h2>
          <p>
            Les actions d’équipe nécessitent une authentification vérifiée par
            le serveur. Les mots de passe sont hachés, les sessions limitées
            dans le temps et les conflits contrôlés en transaction. Cette démo
            n’est pas une certification ni un audit de sécurité de production.
          </p>
          <h2>Installation et hors connexion</h2>
          <p>
            L’installation est facultative. Les fonctionnalités web restent
            accessibles sans installation. Une page informative sûre fonctionne
            hors connexion ; les horaires, dossiers et actions nécessitent le
            réseau. Aucun envoi en attente silencieux. L’installation sur
            téléphone exige une adresse HTTPS, comme celle de la démo en ligne.
          </p>
          <h2>Logo et identité</h2>
          <p>
            Le monogramme OCD orange est un extrait raster de la vidéo publique
            de Bovann du 8 octobre 2026, à 01:00, conservé sans redessin. Il est
            utilisé dans cette proposition documentaire à la demande d’Adama ;
            aucun fichier original ou accord de marque n’a été fourni.
          </p>
          <a className="btn btn-dark" href="/">
            Revenir à la démo <ArrowUpRight size={17} />
          </a>
        </main>
      ) : packs.length === 0 ? (
        <main id="main" className="wrap loading-state">
          <LoaderCircle className="spin" />{" "}
          {online
            ? "Chargement de la démonstration…"
            : "Reconnectez-vous pour utiliser le planning et les réservations."}
        </main>
      ) : route === "/reserver" ? (
        <Booking packs={packs} online={online} />
      ) : route === "/suivi" ? (
        <Tracking packs={packs} online={online} />
      ) : route === "/admin" || route === "/demo-equipe" ? (
        <Admin
          packs={packs}
          online={online}
          preview={route === "/demo-equipe"}
        />
      ) : route === "/" ? (
        <Home packs={packs} />
      ) : (
        <main id="main" className="empty-state large-empty">
          <h1>Cette page n’est pas sur le planning.</h1>
          <a href="/" className="btn btn-orange">
            Retour à l’accueil
          </a>
        </main>
      )}
      <div className="pwa-install-strip">
        <ShieldCheck size={16} />
        <span>Un lien suffit. L’installation reste facultative.</span>
        <button className="text-button" onClick={() => void requestInstall()}>
          <Download size={15} />
          {install ? "Installer OCD Live" : "À propos de l’installation"}
        </button>
      </div>
      {installInfo && (
        <div className="install-info wrap" role="status">
          <button
            className="icon-btn"
            aria-label="Fermer l’information d’installation"
            onClick={() => setInstallInfo(false)}
          >
            <X size={18} />
          </button>
          <strong>Le web d’abord, la PWA si vous voulez.</strong>
          <p>
            Si votre navigateur le permet, utilisez « Installer l’application »
            ou « Ajouter à l’écran d’accueil » dans son menu. L’installation
            demande une adresse HTTPS (ou localhost sur ordinateur). Rien à
            installer pour réserver.
          </p>
        </div>
      )}
      <Footer />
    </>
  );
}
