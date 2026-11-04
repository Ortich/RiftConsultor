import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "data/catalog");
const cardsUrl = "https://api.riftcodex.com/cards";
const setsUrl = "https://api.riftcodex.com/sets";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "rift-consultor/0.1",
    },
  });
  const text = await response.text();
  if (!response.ok || text.trimStart().startsWith("<")) return null;
  return JSON.parse(text);
}

async function fetchAllDirect() {
  const first = await fetchJson(`${cardsUrl}?page=1&size=100`);
  if (!first || !Array.isArray(first.items) || typeof first.pages !== "number") return null;
  const items = [...first.items];
  for (let page = 2; page <= first.pages; page += 1) {
    const next = await fetchJson(`${cardsUrl}?page=${page}&size=100`);
    if (!next || !Array.isArray(next.items)) return null;
    items.push(...next.items);
    await sleep(150);
  }
  const sets = await fetchJson(`${setsUrl}?page=1&size=100`);
  if (!sets || !Array.isArray(sets.items)) return null;
  return { items, sets: sets.items, total: first.total };
}

function startChrome() {
  const profile = path.join("/tmp", `riftcodex-chrome-${process.pid}`);
  const chrome = spawn(
    "/usr/bin/google-chrome",
    [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=9222",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return chrome;
}

async function fetchAllChrome() {
  const chrome = startChrome();
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const ping = await fetch("http://127.0.0.1:9222/json/version");
        if (ping.ok) break;
      } catch {
        // Chrome is still starting.
      }
      if (attempt === 39) throw new Error("Chrome no ha abierto el puerto de depuración.");
      await sleep(250);
    }
    const tab = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let seq = 0;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const send = (method, params = {}) => {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Tiempo agotado en ${method}`));
        }, 120000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.result?.exceptionDetails) {
        throw new Error(JSON.stringify(result.result.exceptionDetails).slice(0, 400));
      }
      return result.result?.result?.value;
    };
    await send("Page.enable");
    await send("Page.navigate", { url: `${cardsUrl}?page=1&size=1` });
    let ready = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(1000);
      const text = await evaluate("document.body ? document.body.innerText.slice(0, 20) : ''");
      if (typeof text === "string" && text.trim().startsWith("{")) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error("Cloudflare no ha dejado pasar la petición.");
    const first = await evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(`${cardsUrl}?page=1&size=100`)});
      const body = await response.json();
      return { total: body.total, pages: body.pages, items: body.items };
    })()`);
    const items = [...first.items];
    for (let page = 2; page <= first.pages; page += 1) {
      const chunk = await evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(`${cardsUrl}?page=${page}&size=100`)});
        const body = await response.json();
        return body.items;
      })()`);
      if (!Array.isArray(chunk)) throw new Error(`La página ${page} no ha devuelto cartas.`);
      items.push(...chunk);
      await sleep(150);
    }
    const sets = await evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(`${setsUrl}?page=1&size=100`)});
      const body = await response.json();
      return body.items;
    })()`);
    ws.close();
    return { items, sets, total: first.total };
  } finally {
    chrome.kill("SIGKILL");
  }
}

function byPrinting(left, right) {
  const setCompare = String(left.set?.set_id ?? "").localeCompare(String(right.set?.set_id ?? ""));
  if (setCompare !== 0) return setCompare;
  const numberCompare = (left.collector_number ?? 0) - (right.collector_number ?? 0);
  if (numberCompare !== 0) return numberCompare;
  return String(left.id).localeCompare(String(right.id));
}

const direct = await fetchAllDirect();
const payload = direct ?? (await fetchAllChrome());
if (!Array.isArray(payload.items) || payload.items.length === 0) {
  throw new Error("La descarga no ha traído cartas.");
}
if (typeof payload.total === "number" && payload.items.length !== payload.total) {
  throw new Error(`La API anuncia ${payload.total} cartas y han llegado ${payload.items.length}.`);
}
payload.items.sort(byPrinting);
payload.sets.sort((left, right) => String(left.set_id).localeCompare(String(right.set_id)));
const cardsJson = JSON.stringify(payload.items);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "cards.json"), cardsJson);
writeFileSync(path.join(outDir, "sets.json"), `${JSON.stringify(payload.sets, null, 2)}\n`);
const manifest = {
  source: cardsUrl,
  setsSource: setsUrl,
  fetchedAt: new Date().toISOString(),
  cardCount: payload.items.length,
  setCount: payload.sets.length,
  sha256: createHash("sha256").update(cardsJson).digest("hex"),
};
writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Guardadas ${manifest.cardCount} cartas y ${manifest.setCount} sets en data/catalog.`);
