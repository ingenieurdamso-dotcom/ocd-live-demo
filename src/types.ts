export type Pack = {
  id: string;
  name: string;
  eyebrow: string;
  duration: number;
  price: number;
  credits: number;
  promotion: boolean;
  description: string;
  features: string[];
  featured?: boolean;
};
export type Slot = { start: string; end: string; available: boolean };
export type BookingData = {
  pack: string;
  mode: "studio" | "remote";
  start: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  tiktok: string;
  instagram: string;
  business: string;
  category: string;
  description: string;
  consent: boolean;
};
export type Reservation = BookingData & {
  id: string;
  token: string;
  end: string;
  status: string;
  createdAt: number;
  holdUntil: number;
  reason: string;
  proposal: null | {
    start: string;
    end: string;
    reason: string;
    expiresAt: number;
  };
  events: { at: string; message: string; simulated: boolean }[];
};
export const money = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
export const day = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Lome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(s));
export const hour = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Lome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
export const duration = (n: number) =>
  `${Math.floor(n / 60)} h${n % 60 ? " " + (n % 60) : ""}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const future = (days = 1) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
