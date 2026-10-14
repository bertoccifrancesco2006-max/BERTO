const CFG = window.FINANZA_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
const sb = CLOUD ? supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;

const CATEGORIE = {
  spesa: ["Casa", "Cibo", "Trasporti", "Svago", "Salute", "Shopping", "Abbonamenti", "Altro"],
  entrata: ["Stipendio", "Extra", "Investimenti", "Altro"],
};
const SEZIONI = {
  contanti: { label: "Contanti", tipi: ["Contanti"] },
  banche: { label: "Banche", tipi: ["Conto corrente", "Conto risparmio", "Conto deposito", "Carta prepagata", "Carta di credito"] },
  investimenti: { label: "Investimenti", tipi: ["Crypto", "Trading", "Altro"] },
};

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((t, r) => t + Number(r[key]), 0);
const signClass = (n) => (n < 0 ? "neg" : "pos");

// ===== Storage: Supabase se configurato, altrimenti localStorage =====
const local = {
  read: (t) => JSON.parse(localStorage.getItem("finanza_" + t) || "[]"),
  write: (t, rows) => localStorage.setItem("finanza_" + t, JSON.stringify(rows)),
};
const store = CLOUD
  ? {
      async list(t) {
        const { data, error } = await sb.from(t).select("*");
        if (error) throw error;
        return data;
      },
      async add(t, row) {
        const { error } = await sb.from(t).insert(row);
        if (error) throw error;
      },
      async set(t, id, patch) {
        const { error } = await sb.from(t).update(patch).eq("id", id);
        if (error) throw error;
      },
      async del(t, id) {
        const { error } = await sb.from(t).delete().eq("id", id);
        if (error) throw error;
      },
    }
  : {
      async list(t) { return local.read(t); },
      async add(t, row) { local.write(t, [...local.read(t), { id: crypto.randomUUID(), ...row }]); },
      async set(t, id, patch) { local.write(t, local.read(t).map((r) => (r.id === id ? { ...r, ...patch } : r))); },
      async del(t, id) { local.write(t, local.read(t).filter((r) => r.id !== id)); },
    };

let tx = [];
let assets = [];
let charts = {};

async function refresh() {
  [tx, assets] = await Promise.all([store.list("transactions"), store.list("assets")]);
  render();
}

async function run(fn) {
  $("#msg").textContent = "";
  try { await fn(); } catch (e) { $("#msg").textContent = "Errore: " + (e.message || e); }
}

// ===== Render =====
function render() {
  renderDashboard();
  renderMovimenti();
  renderPatrimonio();
}

function monthKey(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}

function totalsOf(month) {
  const rows = tx.filter((t) => t.date.slice(0, 7) === month);
  return {
    rows,
    entrate: sum(rows.filter((t) => t.type === "entrata"), "amount"),
    spese: sum(rows.filter((t) => t.type === "spesa"), "amount"),
  };
}

function setChart(id, config) {
  if (charts[id]) charts[id].destroy();
  if (window.Chart) charts[id] = new Chart($("#" + id), config);
}

function renderDashboard() {
  const net = sum(assets, "value");
  const m = totalsOf(monthKey());
  $("#k-net").textContent = eur.format(net);
  $("#k-net").className = signClass(net);
  $("#k-in").textContent = eur.format(m.entrate);
  $("#k-out").textContent = eur.format(m.spese);
  const save = m.entrate - m.spese;
  $("#k-save").textContent = eur.format(save);
  $("#k-save").className = signClass(save);

  const keys = Object.keys(SEZIONI);
  setChart("ch-assets", {
    type: "doughnut",
    data: {
      labels: keys.map((k) => SEZIONI[k].label),
      datasets: [{ data: keys.map((k) => Math.max(0, sum(assets.filter((a) => a.section === k), "value"))), backgroundColor: ["#f59e0b", "#3b82f6", "#10b981"] }],
    },
    options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c) => `${c.label}: ${eur.format(c.parsed)}` } } } },
  });

  const months = [-5, -4, -3, -2, -1, 0].map(monthKey);
  const data = months.map(totalsOf);
  setChart("ch-months", {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Entrate", data: data.map((d) => d.entrate), backgroundColor: "#10b981" },
        { label: "Spese", data: data.map((d) => d.spese), backgroundColor: "#ef4444" },
      ],
    },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

function renderMovimenti() {
  const m = totalsOf($("#tx-month").value);
  const bal = m.entrate - m.spese;
  $("#m-in").textContent = eur.format(m.entrate);
  $("#m-out").textContent = eur.format(m.spese);
  $("#m-bal").textContent = eur.format(bal);
  $("#m-bal").className = signClass(bal);
  $("#tx-empty").hidden = m.rows.length > 0;
  $("#tx-body").innerHTML = m.rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => `<tr>
      <td>${esc(t.date)}</td><td>${esc(t.category)}</td><td>${esc(t.note)}</td>
      <td class="r ${t.type === "entrata" ? "pos" : "neg"}">${t.type === "entrata" ? "+" : "−"}${eur.format(t.amount)}</td>
      <td class="r"><button class="btn ghost small" data-del-tx="${esc(t.id)}" aria-label="Elimina">✕</button></td>
    </tr>`).join("");
}

function renderPatrimonio() {
  $("#as-sections").innerHTML = Object.entries(SEZIONI).map(([key, s]) => {
    const rows = assets.filter((a) => a.section === key);
    const tot = sum(rows, "value");
    return `<div class="card">
      <div class="row between"><h2>${s.label}</h2><strong class="${signClass(tot)}">${eur.format(tot)}</strong></div>
      ${rows.length ? rows.map((a) => `<div class="asset">
        <div><strong>${esc(a.name)}</strong><br><span class="muted small">${esc(a.type)}</span></div>
        <input type="number" step="0.01" value="${Number(a.value)}" data-set-asset="${esc(a.id)}" aria-label="Valore ${esc(a.name)}">
        <button class="btn ghost small" data-del-asset="${esc(a.id)}" aria-label="Elimina">✕</button>
      </div>`).join("") : `<p class="muted">Nessuna voce.</p>`}
    </div>`;
  }).join("");
}

// ===== Form helpers =====
function fillOptions(sel, list) {
  sel.innerHTML = list.map((v) => `<option>${esc(v)}</option>`).join("");
}

// ===== Eventi (registrati una sola volta) =====
function init() {
  fillOptions($("#tx-cat"), CATEGORIE.spesa);
  fillOptions($("#as-type"), SEZIONI.contanti.tipi);
  $("#as-section").innerHTML = Object.entries(SEZIONI).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
  $("#tx-date").value = today();
  $("#tx-month").value = monthKey();

  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((x) => x.classList.toggle("active", x === b));
      ["dashboard", "movimenti", "patrimonio"].forEach((v) => ($("#view-" + v).hidden = v !== b.dataset.view));
      if (b.dataset.view === "dashboard") renderDashboard();
    })
  );

  $("#tx-type").addEventListener("change", (e) => fillOptions($("#tx-cat"), CATEGORIE[e.target.value]));
  $("#as-section").addEventListener("change", (e) => fillOptions($("#as-type"), SEZIONI[e.target.value].tipi));
  $("#tx-month").addEventListener("change", renderMovimenti);

  $("#tx-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await store.add("transactions", {
        date: $("#tx-date").value, type: $("#tx-type").value, category: $("#tx-cat").value,
        amount: Number($("#tx-amount").value), note: $("#tx-note").value.trim() || null,
      });
      $("#tx-amount").value = "";
      $("#tx-note").value = "";
      await refresh();
    });
  });

  $("#as-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await store.add("assets", {
        section: $("#as-section").value, type: $("#as-type").value,
        name: $("#as-name").value.trim(), value: Number($("#as-value").value),
      });
      $("#as-name").value = "";
      $("#as-value").value = "";
      await refresh();
    });
  });

  document.addEventListener("click", (e) => {
    const txId = e.target.dataset.delTx;
    const asId = e.target.dataset.delAsset;
    if (txId && confirm("Eliminare questo movimento?")) run(async () => { await store.del("transactions", txId); await refresh(); });
    if (asId && confirm("Eliminare questa voce?")) run(async () => { await store.del("assets", asId); await refresh(); });
  });

  document.addEventListener("change", (e) => {
    const id = e.target.dataset.setAsset;
    if (id && e.target.value !== "") run(async () => { await store.set("assets", id, { value: Number(e.target.value) }); await refresh(); });
  });
}

// ===== Avvio + login =====
function showApp() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#mode").textContent = CLOUD ? "" : "Modalità locale · dati solo in questo browser";
  $("#logout").hidden = !CLOUD;
  run(refresh);
}

function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
}

function initAuth() {
  const creds = () => ({ email: $("#email").value, password: $("#password").value });
  const msg = (t) => ($("#login-msg").textContent = t);
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword(creds());
    msg(error ? error.message : "");
  });
  $("#signup").addEventListener("click", async () => {
    const { data, error } = await sb.auth.signUp(creds());
    msg(error ? error.message : data.session ? "" : "Controlla la mail per confermare l'account.");
  });
  $("#logout").addEventListener("click", () => sb.auth.signOut());
  sb.auth.onAuthStateChange((_event, session) => (session ? showApp() : showLogin()));
}

init();
CLOUD ? initAuth() : showApp();
