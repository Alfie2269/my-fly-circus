// Fly Circus server: runs the fly simulation, relays players, and gates approvals to admins.
// Run: ADMIN_TOKEN=<16+ random chars> node server.js   (serves ./public and a WebSocket on the same port)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { loadBrain, createBrainRuntime } = require("./brain/flywire-adapter");

const PORT = +process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
if (ADMIN_TOKEN.length < 16) { console.error("Set ADMIN_TOKEN to 16+ characters."); process.exit(1); }
const SAVE = path.join(__dirname, "world.json");
const PUB = path.join(__dirname, "public");

// ---------- world data (keep in sync with the client) ----------
const NEEDS = ["hunger", "energy", "fun", "social"];
const POIS = [
  { need: "fun", p: [0, 1.5, -3.4], n: "the TV" }, { need: "hunger", p: [6, 1.7, -5], n: "the trash buffet" },
  { need: "energy", p: [-6, 1.2, 5], n: "the bed" }, { need: "fun", p: [-28, 1.5, 58], n: "the park bench" },
  { need: "fun", p: [30, 1.6, 52], n: "the ferris wheel" }, { need: "fun", p: [0, 1.8, 30], n: "the fountain" },
  { need: "hunger", p: [10, 1.7, 24.5], n: "the food stall" }, { need: "energy", p: [-12, 1.4, 46], n: "the hammock" },
];
const USE = { fun: "watching FlyTube", hunger: "eating trash", energy: "napping", social: "chatting" };
const FLY_DEFS = [["Buzz", { hunger: 1.4 }], ["Nibbles", { hunger: 1.8 }], ["Zee", { energy: 1.8 }], ["Flap", { fun: 1.7 }], ["Marge", { social: 1.9 }], ["Gnat", {}]];
const inT = p => Math.abs(p.x) < 8 && Math.abs(p.z) < 8;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const brainNetwork = loadBrain();
const brainRuntime = createBrainRuntime(brainNetwork);
if (brainRuntime) console.log(`[brain] Loaded ${brainRuntime.dataset} ${brainRuntime.version} (${brainNetwork.edges.length} connections)`);
else console.log("[brain] No FlyWire network loaded; using standard needs-based AI.");

// ---------- object recipes: the ONLY way anything new enters the world ----------
function validRecipe(r) {
  if (!r || typeof r.name !== "string" || r.name.length > 80 || !Array.isArray(r.parts) || r.parts.length < 1 || r.parts.length > 24) return false;
  if (!Array.isArray(r.at) || r.at.length !== 2 || !r.at.every(v => typeof v === "number" && Math.abs(v) <= 90)) return false;
  return r.parts.every(q => ["box", "sphere", "cylinder"].includes(q.s)
    && Array.isArray(q.z) && q.z.length === 3 && q.z.every(v => typeof v === "number" && v >= .02 && v <= 3)
    && Array.isArray(q.p) && q.p.length === 3 && q.p.every(v => typeof v === "number" && Math.abs(v) <= 4)
    && typeof q.c === "string" && /^#[0-9a-f]{6}$/i.test(q.c));
}

// ---------- persistence ----------
let objects = [];
try { objects = JSON.parse(fs.readFileSync(SAVE, "utf8")).objects.filter(validRecipe); } catch {}
const save = () => fs.writeFile(SAVE, JSON.stringify({ objects }), () => {});
objects.forEach(o => o.fun && POIS.push({ need: "fun", p: [o.at[0], 1.5, o.at[1] + .3], n: "the new " + o.name }));

// ---------- fly simulation (authoritative) ----------
const flies = FLY_DEFS.map(([name, tr], i) => {
  const rate = {}, n = {};
  NEEDS.forEach(k => { rate[k] = rnd(.8, 1.2) * (tr[k] || 1); n[k] = rnd(40, 90); });
  return { i, name, g: { x: rnd(-5, 5), y: rnd(2, 4), z: rnd(-5, 5) }, ry: 0, rate, n, brainState: {}, state: "idle", need: null, tgt: null, tf: null, useT: 0, off: { x: 0, y: 0, z: 0 }, q: null, act: "" };
});
function pick(f) {
  let k = brainRuntime && brainRuntime.chooseNeed(f.n, f.brainState);\n  if (!k || !NEEDS.includes(k)) { k = NEEDS[0]; NEEDS.forEach(x => { if (f.n[x] < f.n[k]) k = x; }); }\n  f.brainState[k] = (f.brainState[k] || 0) + 1;
  Object.assign(f, { need: k, state: "go", q: null, useT: 0, off: { x: rnd(-.6, .6), y: 0, z: rnd(-.6, .6) } });
  if (k === "social") { const o = flies.filter(x => x !== f); f.tf = o[Math.floor(Math.random() * o.length)]; f.act = "going to chat with " + f.tf.name; }
  else { const o = POIS.filter(p => p.need === k); f.tgt = o[Math.floor(Math.random() * o.length)]; f.tf = null; f.act = "heading to " + f.tgt.n; }
}
function step(f, dt) {
  NEEDS.forEach(k => f.n[k] = Math.max(0, f.n[k] - f.rate[k] * dt));
  if (f.state === "idle") pick(f);
  const base = f.tf ? f.tf.g : { x: f.tgt.p[0], y: f.tgt.p[1], z: f.tgt.p[2] };
  let dest = { x: base.x + f.off.x, y: base.y, z: base.z + f.off.z }, wp = false, P = f.g;
  if (f.state === "go") {
    if (inT(P) === inT(dest)) f.q = null;
    else {
      if (!f.q) f.q = inT(P) ? (Math.abs(P.x) > 1.5 ? [{ x: 0, y: 2, z: 6 }, { x: 0, y: 2, z: 11 }] : [{ x: 0, y: 2, z: 11 }]) : (Math.abs(P.x) < 1.5 && P.z > 8 ? [] : [{ x: 0, y: 2, z: 11 }]);
      while (f.q.length && dist(P, f.q[0]) < .8) f.q.shift();
      if (f.q.length) { dest = f.q[0]; wp = true; }
    }
  }
  const d = { x: dest.x - P.x, y: dest.y - P.y, z: dest.z - P.z }, len = Math.hypot(d.x, d.y, d.z);
  if (f.state === "go") {
    if (len < .6 && !wp) { f.state = "use"; f.act = f.tf ? "chatting with " + f.tf.name : USE[f.need]; }
    else if (len > 1e-6) {
      const s = Math.min(4.5 * dt, len) / len; P.x += d.x * s; P.y += d.y * s; P.z += d.z * s;
      let a = Math.atan2(d.x, d.z) - f.ry; a = Math.atan2(Math.sin(a), Math.cos(a)); f.ry += a * Math.min(1, dt * 6);
    }
  } else {
    f.useT += dt; f.n[f.need] = Math.min(100, f.n[f.need] + 14 * dt);
    if (f.tf) f.tf.n.social = Math.min(100, f.tf.n.social + 8 * dt);
    const k = Math.min(1, dt * 2); P.x += d.x * k; P.y += d.y * k; P.z += d.z * k;
    if (f.n[f.need] >= 95 || f.useT > 14) f.state = "idle";
  }
}

// ---------- requests (flies ask, only admins decide) ----------
// Placeholder generator. Later: ask the local model for a request + recipe, then run it through validRecipe().
const IDEAS = [
  { name: "a tiny armchair for watching FlyTube", at: [-3.5, 2.5], fun: true, parts: [{ s: "box", z: [1.2, .4, 1.2], p: [0, .2, 0], c: "#8e44ad" }, { s: "box", z: [1.2, .9, .3], p: [0, .65, -.45], c: "#7d3c98" }, { s: "box", z: [.25, .6, .9], p: [-.6, .5, 0], c: "#7d3c98" }, { s: "box", z: [.25, .6, .9], p: [.6, .5, 0], c: "#7d3c98" }] },
  { name: "a lava lamp", at: [3.5, 2], fun: true, parts: [{ s: "cylinder", z: [.6, .2, .6], p: [0, .1, 0], c: "#444444" }, { s: "cylinder", z: [.4, 1.3, .4], p: [0, .85, 0], c: "#ff5a36" }, { s: "sphere", z: [.35, .35, .35], p: [0, 1.6, 0], c: "#ffd24d" }] },
];
let nextId = 1, ideaI = 0; const requests = new Map();
function newRequest() {
  if (ideaI >= IDEAS.length || requests.size >= 20) return;
  const recipe = IDEAS[ideaI++]; if (!validRecipe(recipe)) return;
  const r = { id: nextId++, fly: flies[Math.floor(Math.random() * flies.length)].name, recipe };
  requests.set(r.id, r); broadcast({ t: "req", req: r });
}
setTimeout(newRequest, 8000); setInterval(newRequest, 25000);

// ---------- http + websocket ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const f = path.normalize(path.join(PUB, req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0])));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => e ? res.writeHead(404).end("Not found") : res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }).end(b));
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const players = new Map(); let pid = 1;
const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
function broadcast(m) { wss.clients.forEach(ws => { if (m.t === "req" && !players.get(ws)?.admin) return; send(ws, m); }); }   // fly requests go to admins only
const okToken = t => { try { const a = Buffer.from(String(t)), b = Buffer.from(ADMIN_TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch { return false; } };
const num = v => typeof v === "number" && isFinite(v);

wss.on("connection", ws => {
  if (players.size >= 30) { ws.close(); return; }
  const me = { id: pid++, name: "Visitor" + pid, x: 0, y: 1.7, z: 6.5, yaw: 0, admin: false, msgs: 0 };
  players.set(ws, me);
  const tick = setInterval(() => { me.msgs = 0; }, 1000);
  send(ws, { t: "init", you: me.id, objects, flies: flies.map(f => f.name), requests: [] });
  ws.on("message", raw => {
    if (++me.msgs > 40) { ws.close(); return; }
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === "hello") {
      me.name = String(m.name || me.name).replace(/[^\w \-]/g, "").slice(0, 16) || me.name;
      if (m.token && okToken(m.token)) { me.admin = true; send(ws, { t: "admin", requests: [...requests.values()] }); }
    } else if (m.t === "pos" && [m.x, m.y, m.z, m.yaw].every(num)) {
      me.x = Math.max(-95, Math.min(95, m.x)); me.y = Math.max(0, Math.min(10, m.y)); me.z = Math.max(-95, Math.min(95, m.z)); me.yaw = m.yaw;
    } else if ((m.t === "approve" || m.t === "deny") && me.admin) {          // admin check happens HERE, server-side
      const r = requests.get(m.id); if (!r) return;
      requests.delete(r.id);
      if (m.t === "approve" && validRecipe(r.recipe)) {
        objects.push(r.recipe); save();
        if (r.recipe.fun) POIS.push({ need: "fun", p: [r.recipe.at[0], 1.5, r.recipe.at[1] + .3], n: "the new " + r.recipe.name });
        broadcast({ t: "obj", recipe: r.recipe });
      }
      broadcast({ t: "reqdone", id: r.id });
    }
  });
  ws.on("close", () => { clearInterval(tick); players.delete(ws); });
});

// ---------- loops ----------
let last = Date.now();
setInterval(() => { const now = Date.now(), dt = Math.min((now - last) / 1000, .1); last = now; flies.forEach(f => step(f, dt)); }, 50);   // 20 Hz sim
setInterval(() => {                                                                                                                       // 10 Hz snapshots
  const r = x => Math.round(x * 100) / 100;
  const snap = {
    t: "snap",
    flies: flies.map(f => ({ x: r(f.g.x), y: r(f.g.y), z: r(f.g.z), ry: r(f.ry), act: f.act, n: NEEDS.map(k => Math.round(f.n[k])) })),
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw) })),
  };
  broadcast(snap);
}, 100);

server.listen(PORT, () => console.log(`Fly Circus on :${PORT}`));