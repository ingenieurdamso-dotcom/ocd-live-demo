import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createStore } from "../server/store.mjs";
const exec = promisify(execFile);
test("deux processus SQLite concurrents ne peuvent réserver le même intervalle", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ocd-concurrency-"));
  const filename = path.join(dir, "test.sqlite");
  const module = new URL("../server/store.mjs", import.meta.url).href;
  const init = createStore({ filename });
  init.close();
  const script = `import {createStore} from ${JSON.stringify(module)};const s=createStore({filename:process.argv[1],now:()=>Date.parse('2026-11-08T08:00:00Z')});try{s.create({pack:'decouverte',mode:'studio',start:'2026-11-09T09:00:00Z',name:'Client Démo',email:'test@example.test',phone:'+228 90000000',business:'Atelier Démo',category:'Artisanat',description:'Description fictive pour le test.',country:'Togo',tiktok:'@client.demo',instagram:'',consent:true},process.argv[2]);console.log(201)}catch(e){console.log(e.status||500)}finally{s.close()}`;
  try {
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((k) =>
        exec(process.execPath, [
          "--input-type=module",
          "-e",
          script,
          filename,
          k,
        ]),
      ),
    );
    assert.deepEqual(
      results.map((r) => Number(r.stdout.trim())).sort(),
      [201, 409],
    );
    const s = createStore({ filename });
    assert.equal(s.list().length, 1);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("revue 4 : deux processus ne dépassent pas le quota actif même sur créneaux distincts", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ocd-quota-concurrency-")),
    filename = path.join(dir, "test.sqlite"),
    module = new URL("../server/store.mjs", import.meta.url).href;
  const init = createStore({ filename });
  init.close();
  const script = `import {createStore} from ${JSON.stringify(module)};const s=createStore({filename:process.argv[1],now:()=>Date.parse('2026-11-08T08:00:00Z'),pendingLimits:{perOwner:1,total:100}});try{s.create({pack:'decouverte',mode:'studio',start:process.argv[3],name:'Client Démo',email:'test@example.test',phone:'+22890000000',business:'Atelier Démo',category:'Artisanat',description:'Description fictive pour le test.',country:'Togo',tiktok:'@client.demo',instagram:'',consent:true},process.argv[2],'shared-owner');console.log(201)}catch(e){console.log(e.status||500)}finally{s.close()}`;
  try {
    const results = await Promise.all(
      [9, 10].map((day) =>
        exec(process.execPath, [
          "--input-type=module",
          "-e",
          script,
          filename,
          randomUUID(),
          `2026-11-${String(day).padStart(2, "0")}T09:00:00Z`,
        ]),
      ),
    );
    assert.deepEqual(
      results.map((r) => Number(r.stdout.trim())).sort(),
      [201, 429],
    );
    const s = createStore({ filename });
    assert.equal(s.list().length, 1);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
