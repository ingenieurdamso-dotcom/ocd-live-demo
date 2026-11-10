export type Freshness = "loading" | "fresh" | "stale";
type Ticket = { epoch: number; sequence: number; mutation: boolean };
// Une session/ressource possède ce scope. Toute mutation invalide les GET antérieurs.
// Invalider n’annule jamais une opération déjà reçue par le serveur : seule sa publication UI est ignorée.
export function createAsyncScope() {
  let epoch = 0,
    sequence = 0,
    writing = false;
  const current = (ticket: Ticket | null) =>
    !!ticket &&
    ticket.epoch === epoch &&
    (ticket.mutation ? writing : !writing && ticket.sequence === sequence);
  return {
    read(): Ticket | null {
      if (writing) return null;
      return { epoch, sequence: ++sequence, mutation: false };
    },
    mutate(): Ticket | null {
      if (writing) return null;
      writing = true;
      return { epoch: ++epoch, sequence: ++sequence, mutation: true };
    },
    current,
    finish(ticket: Ticket | null) {
      if (ticket?.mutation && current(ticket)) writing = false;
    },
    invalidate() {
      epoch++;
      sequence++;
      writing = false;
    },
    get mutating() {
      return writing;
    },
  };
}
