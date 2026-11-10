import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Tracking } from "../src/Tracking.tsx";
import { Admin } from "../src/Admin.tsx";
import { Booking } from "../src/Booking.tsx";
import { catalog } from "../server/catalog.mjs";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const A = "a".repeat(64),
  B = "b".repeat(64);
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const fixture = (token = A, status = "reschedule_proposed") => ({
  id: token.slice(0, 16),
  token,
  business: token === A ? "Dossier A" : "Dossier B",
  pack: "decouverte",
  mode: "studio",
  start: "2026-11-09T09:00:00Z",
  end: "2026-11-09T10:30:00Z",
  holdUntil: Date.now() + 86400000,
  name: "Client Démo",
  category: "Artisanat",
  description: "Description fictive de test",
  email: "test@example.test",
  phone: "+22890000000",
  status,
  events: [],
  proposal:
    status === "reschedule_proposed"
      ? {
          start: "2026-11-10T09:00:00Z",
          end: "2026-11-10T10:30:00Z",
          reason: "Report fictif",
          expiresAt: Date.now() + 86400000,
        }
      : null,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function button(r, text) {
  const value = r.root
    .findAllByType("button")
    .find((b) =>
      b.children.some((c) => typeof c === "string" && c.includes(text)),
    );
  assert.ok(value, `bouton ${text}`);
  return value;
}
const shown = (r) => JSON.stringify(r.toJSON());
async function harness(
  fetcher,
  Component = Tracking,
  props = {},
  options = {},
) {
  const oldFetch = globalThis.fetch,
    oldWindow = globalThis.window,
    oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const events = new EventTarget();
  globalThis.window = {
    location: {
      hash: "#" + A,
      href: "http://example.test/suivi#" + A,
      search: "",
      assign() {},
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, clipboard: { writeText: async () => {} } },
    configurable: true,
  });
  globalThis.fetch = fetcher;
  let r;
  let open = true;
  const element = (extra = {}) => {
    const node = React.createElement(Component, {
      packs: catalog,
      online: true,
      ...props,
      ...extra,
    });
    return options.strict
      ? React.createElement(React.StrictMode, null, node)
      : node;
  };
  await act(async () => {
    r = TestRenderer.create(element());
  });
  const api = {
    r,
    update(extra) {
      r.update(element(extra));
    },
    async change(token) {
      await act(async () => {
        globalThis.window.location.hash = "#" + token;
        globalThis.window.location.href = "http://example.test/suivi#" + token;
        events.dispatchEvent(new Event("hashchange"));
      });
    },
    async focus() {
      await act(async () => events.dispatchEvent(new Event("focus")));
    },
    async unmount() {
      if (!open) return;
      open = false;
      await act(async () => r.unmount());
    },
    async close() {
      await api.unmount();
      globalThis.fetch = oldFetch;
      if (oldWindow === undefined) delete globalThis.window;
      else globalThis.window = oldWindow;
      if (oldNavigator)
        Object.defineProperty(globalThis, "navigator", oldNavigator);
      else delete globalThis.navigator;
    },
  };
  return api;
}
test("revue 1 : POST tardif du dossier A ne remplace jamais B et busy/copie sont réinitialisés", async () => {
  const post = deferred();
  const h = await harness(async (url, opt) =>
    opt.method === "POST"
      ? post.promise
      : response(fixture(String(url).endsWith(A) ? A : B)),
  );
  try {
    await act(async () => button(h.r, "Copier mon lien").props.onClick());
    await act(async () => button(h.r, "Accepter le report").props.onClick());
    await h.change(B);
    assert.ok(shown(h.r).includes("Dossier B"));
    assert.equal(
      button(h.r, "Accepter le report").props.disabled,
      false,
      "busy de A ne bloque pas B",
    );
    assert.ok(!shown(h.r).includes("Lien copié"));
    await act(async () => post.resolve(response(fixture(A, "confirmed"))));
    assert.ok(shown(h.r).includes("Dossier B"));
    assert.ok(!shown(h.r).includes("Dossier A"));
  } finally {
    await h.close();
  }
});
test("revue 1 : erreur POST tardive de A ne publie ni erreur ni GET A sur B", async () => {
  const post = deferred();
  let getsA = 0;
  const h = await harness(async (url, opt) => {
    if (opt.method === "POST") return post.promise;
    if (String(url).endsWith(A)) getsA++;
    return response(fixture(String(url).endsWith(A) ? A : B));
  });
  try {
    await act(async () => button(h.r, "Accepter le report").props.onClick());
    await h.change(B);
    await act(async () => post.reject(new Error("Ancienne erreur A")));
    assert.ok(shown(h.r).includes("Dossier B"));
    assert.ok(!shown(h.r).includes("Ancienne erreur A"));
    assert.equal(
      getsA,
      1,
      "pas de rechargement ancien dossier après mutation invalide",
    );
  } finally {
    await h.close();
  }
});

test("revue 2 : suivi inaccessible avec navigateur online = données périmées et actions bloquées", async () => {
  let broken = false;
  const h = await harness(async () =>
    broken
      ? response({ code: "UNAVAILABLE", message: "Serveur indisponible" }, 503)
      : response(fixture()),
  );
  try {
    broken = true;
    await h.focus();
    assert.ok(shown(h.r).includes("non actualisées"));
    assert.equal(button(h.r, "Accepter le report").props.disabled, true);
    assert.ok(shown(h.r).includes("Dernière synchronisation réussie"));
  } finally {
    await h.close();
  }
});
test("revue 2 : aucun polling GET de suivi ne concurrence une réponse POST active", async () => {
  const post = deferred();
  let gets = 0;
  const h = await harness(async (_url, opt) => {
    if (opt.method === "POST") return post.promise;
    gets++;
    return response(fixture());
  });
  try {
    await act(async () => button(h.r, "Accepter le report").props.onClick());
    await h.focus();
    assert.equal(gets, 1, "pas de GET durant le POST");
    await act(async () => post.resolve(response(fixture(A, "confirmed"))));
    assert.ok(shown(h.r).includes("Votre live a sa place."));
  } finally {
    post.resolve(response(fixture(A, "confirmed")));
    await h.close();
  }
});
test("revue 2 : erreur disponibilité ne laisse pas une indication de fraîcheur actuelle", async () => {
  let broken = false;
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = date + "T09:00:00.000Z";
  const h = await harness(
    async () =>
      broken
        ? response({ code: "FAILED", message: "API indisponible" }, 503)
        : response({
            slots: [{ start, end: date + "T10:30:00Z", available: true }],
            serverTime: new Date().toISOString(),
          }),
    Booking,
  );
  try {
    await act(async () => {
      void h.r.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    broken = true;
    await act(async () => button(h.r, "Actualiser").props.onClick());
    assert.ok(shown(h.r).includes("non actualisées"));
    assert.ok(!shown(h.r).includes("Disponibilités actualisées"));
    assert.equal(button(h.r, "Continuer").props.disabled, true);
  } finally {
    await h.close();
  }
});
function requestRow(r, name = "Dossier A") {
  const row = r.root
    .findAllByType("button")
    .find((b) =>
      b.findAllByType("strong").some((x) => x.children.includes(name)),
    );
  assert.ok(row, "ligne activité");
  return row;
}
test("revue 2 : API admin inaccessible empêche de confirmer les anciens dossiers", async () => {
  let broken = false;
  const h = await harness(
    async (url) =>
      String(url).endsWith("/session")
        ? response({ csrf: "unit-test-csrf", username: "admin" })
        : broken
          ? response({ code: "FAILED", message: "API indisponible" }, 503)
          : response({ bookings: [fixture(A, "pending")] }),
    Admin,
  );
  try {
    broken = true;
    await act(async () => button(h.r, "Actualiser").props.onClick());
    await act(async () => requestRow(h.r).props.onClick());
    assert.ok(shown(h.r).includes("non actualisées"));
    assert.equal(button(h.r, "Confirmer").props.disabled, true);
  } finally {
    await h.close();
  }
});
test("revue 2 : vieux GET admin ne repeuple pas une nouvelle session après déconnexion", async () => {
  const pending = deferred();
  let gets = 0;
  const h = await harness(async (url, opt) => {
    if (String(url).endsWith("/session"))
      return response({ csrf: "old", username: "admin" });
    if (String(url).endsWith("/logout")) return response({ ok: true });
    if (String(url).endsWith("/login"))
      return response({ csrf: "new", username: "admin" });
    if (opt.method !== "POST") {
      gets++;
      if (gets === 2) return pending.promise;
      return response({ bookings: gets === 1 ? [fixture(A, "pending")] : [] });
    }
    throw new Error("Unexpected endpoint");
  }, Admin);
  try {
    await act(async () => button(h.r, "Actualiser").props.onClick());
    await act(async () => button(h.r, "Déconnexion").props.onClick());
    await act(async () => {
      h.r.root
        .findByProps({ id: "username" })
        .props.onChange({ target: { value: "admin" } });
      h.r.root
        .findByProps({ id: "password" })
        .props.onChange({ target: { value: "test-unit-only" } });
    });
    await act(async () => {
      void h.r.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    await act(async () =>
      pending.resolve(response({ bookings: [fixture(A, "pending")] })),
    );
    assert.ok(
      !shown(h.r).includes("Dossier A"),
      "ancienne session ne doit rien publier",
    );
  } finally {
    pending.resolve(response({ bookings: [] }));
    await h.close();
  }
});
test("revue 2 : deux lectures admin résolues à l’envers gardent le dernier résultat", async () => {
  const first = deferred(),
    second = deferred();
  let gets = 0;
  const h = await harness(async (url) => {
    if (String(url).endsWith("/session"))
      return response({ csrf: "test", username: "admin" });
    gets++;
    if (gets === 2) return first.promise;
    if (gets === 3) return second.promise;
    return response({ bookings: [fixture(A, "pending")] });
  }, Admin);
  try {
    await act(async () => {
      const refresh = button(h.r, "Actualiser");
      refresh.props.onClick();
      refresh.props.onClick();
    });
    await act(async () =>
      second.resolve(response({ bookings: [fixture(B, "pending")] })),
    );
    await act(async () =>
      first.resolve(response({ bookings: [fixture(A, "pending")] })),
    );
    assert.ok(shown(h.r).includes("Dossier B"));
    assert.ok(!shown(h.r).includes("Dossier A"));
  } finally {
    first.resolve(response({ bookings: [] }));
    second.resolve(response({ bookings: [] }));
    await h.close();
  }
});

test("revue 2 : cliquer à nouveau la formule ou le jour courant ne périme pas le planning", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = date + "T09:00:00.000Z";
  const h = await harness(
    async () =>
      response({
        slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
        serverTime: new Date().toISOString(),
      }),
    Booking,
  );
  try {
    const selected = h.r.root
      .findAllByType("button")
      .find((b) => b.props["aria-pressed"] === true);
    assert.ok(selected);
    await act(async () => selected.props.onClick());
    assert.ok(!shown(h.r).includes("Vérification en cours"));
    await act(async () => {
      void h.r.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    const field = h.r.root.findByProps({ id: "booking-date" });
    await act(async () =>
      field.props.onChange({ target: { value: field.props.value } }),
    );
    assert.ok(!shown(h.r).includes("Vérification en cours"));
  } finally {
    await h.close();
  }
});

async function fillBooking(r) {
  const submit = async () =>
    act(async () =>
      r.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
  await submit();
  const slot = r.root
    .findAllByType("button")
    .find(
      (b) =>
        b.props["aria-pressed"] === false &&
        b.findAllByType("strong").some((x) => x.children.includes("09:00")),
    );
  assert.ok(slot);
  await act(async () => slot.props.onClick());
  await submit();
  await act(async () => button(r, "Remplir un exemple").props.onClick());
  await submit();
  return submit;
}
test("revue 2 : récupération garde le payload original après réponse réseau perdue et modification", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = date + "T09:00:00.000Z",
    posts = [];
  let captured = "";
  const h = await harness(async (url, options) => {
    if (String(url).endsWith("/bookings")) {
      posts.push({
        key: options.headers["Idempotency-Key"],
        body: options.body,
      });
      if (posts.length === 1) throw new TypeError("réponse perdue");
      return response(fixture(A, "pending"));
    }
    return response({
      slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
      serverTime: new Date().toISOString(),
    });
  }, Booking);
  try {
    globalThis.window.location.assign = (value) => {
      captured = value;
    };
    const submit = await fillBooking(h.r);
    await submit();
    assert.ok(shown(h.r).includes("Récupérer le reçu du même envoi"));
    assert.equal(button(h.r, "Envoyer ma demande").props.disabled, true);
    await act(async () => button(h.r, "Retour").props.onClick());
    await act(async () =>
      h.r.root
        .findByProps({ id: "business" })
        .props.onChange({ target: { value: "Activité modifiée" } }),
    );
    await act(async () =>
      button(h.r, "Récupérer le reçu du même envoi").props.onClick(),
    );
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0], posts[1]);
    assert.equal(captured, "/suivi#" + A);
  } finally {
    await h.close();
  }
});
test("revue 2 : administration suspend les GET pendant la mutation et conserve la confirmation", async () => {
  const post = deferred();
  let gets = 0;
  const h = await harness(async (url, options) => {
    if (String(url).endsWith("/admin/session"))
      return response({ csrf: "fake-session", username: "demo" });
    if (String(url).endsWith("/action")) return post.promise;
    if (options?.method !== "POST") {
      gets++;
      return response({ bookings: [fixture(A, "pending")] });
    }
  }, Admin);
  try {
    await act(async () => requestRow(h.r, "Dossier A").props.onClick());
    await act(async () => button(h.r, "Confirmer").props.onClick());
    await act(async () => {
      void h.r.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    const count = gets;
    await h.focus();
    assert.equal(gets, count);
    assert.equal(h.r.root.findByProps({ type: "submit" }).props.disabled, true);
    await act(async () => post.resolve(response(fixture(A, "confirmed"))));
    assert.ok(shown(h.r).includes("Confirmée"));
  } finally {
    post.resolve(response(fixture(A, "confirmed")));
    await h.close();
  }
});

test("coupure pendant l’envoi : le 201 tardif ouvre le suivi et la récupération reste proposée", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = date + "T09:00:00.000Z",
    post = deferred();
  let assigned = "";
  const h = await harness(async (url) => {
    if (String(url).endsWith("/bookings")) return post.promise;
    return response({
      slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
      serverTime: new Date().toISOString(),
    });
  }, Booking);
  try {
    globalThis.window.location.assign = (value) => {
      assigned = value;
    };
    const submit = await fillBooking(h.r);
    await submit();
    await act(async () => {
      h.r.update(
        React.createElement(Booking, { packs: catalog, online: false }),
      );
    });
    assert.match(shown(h.r), /Récupérer le reçu du même envoi/);
    await act(async () => {
      h.r.update(
        React.createElement(Booking, { packs: catalog, online: true }),
      );
    });
    await act(async () => post.resolve(response({ token: A })));
    assert.equal(assigned, "/suivi#" + A);
  } finally {
    post.resolve(response({ token: A }));
    await h.close();
  }
});

test("coupure puis départ de la page : le 201 tardif n’ouvre pas le suivi", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = date + "T09:00:00.000Z",
    post = deferred();
  let assigned = "";
  const h = await harness(async (url) => {
    if (String(url).endsWith("/bookings")) return post.promise;
    return response({
      slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
      serverTime: new Date().toISOString(),
    });
  }, Booking);
  try {
    globalThis.window.location.assign = (value) => {
      assigned = value;
    };
    const submit = await fillBooking(h.r);
    await submit();
    await act(async () => h.update({ online: false }));
    await h.unmount();
    await act(async () => post.resolve(response({ token: A })));
    assert.equal(assigned, "");
  } finally {
    post.resolve(response({ token: A }));
    await h.close();
  }
});

test("mode strict : coupure pendant l’envoi, le reçu reste proposé et le 201 ouvre le suivi", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = date + "T09:00:00.000Z",
    post = deferred();
  let assigned = "";
  const h = await harness(
    async (url) => {
      if (String(url).endsWith("/bookings")) return post.promise;
      return response({
        slots: [{ start, end: date + "T10:30:00.000Z", available: true }],
        serverTime: new Date().toISOString(),
      });
    },
    Booking,
    {},
    { strict: true },
  );
  try {
    globalThis.window.location.assign = (value) => {
      assigned = value;
    };
    const submit = await fillBooking(h.r);
    await submit();
    await act(async () => h.update({ online: false }));
    assert.match(shown(h.r), /Récupérer le reçu du même envoi/);
    await act(async () => h.update({ online: true }));
    await act(async () => post.resolve(response({ token: A })));
    assert.equal(assigned, "/suivi#" + A);
  } finally {
    post.resolve(response({ token: A }));
    await h.close();
  }
});

test("revue 2 : un GET suivi lancé avant la mutation ne rétablit pas une proposition périmée", async () => {
  const oldRead = deferred();
  let gets = 0;
  const h = await harness(async (url, options) => {
    if (options.method === "POST") return response(fixture(A, "confirmed"));
    if (++gets === 1) return response(fixture());
    return oldRead.promise;
  });
  try {
    const queuedClick = button(h.r, "Accepter le report").props.onClick;
    await h.focus();
    await act(async () => {
      queuedClick();
    });
    assert.ok(shown(h.r).includes("Confirmée"));
    await act(async () => oldRead.resolve(response(fixture())));
    assert.ok(!shown(h.r).includes("Accepter le report"));
    assert.ok(shown(h.r).includes("Confirmée"));
  } finally {
    oldRead.resolve(response(fixture()));
    await h.close();
  }
});
