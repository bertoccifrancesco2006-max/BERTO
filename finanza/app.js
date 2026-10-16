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
  debiti: { label: "Debiti e crediti", tipi: ["Debito", "Credito"] },
};

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((t, r) => t + Number(r[key]), 0);
// valore che pesa sul patrimonio: debito = negativo, credito = positivo, 0 se escluso dal conteggio
const effective = (a) => (a.section === "debiti" ? (a.counted === false ? 0 : (a.type === "Debito" ? -1 : 1) * Number(a.value)) : Number(a.value));
const netTotal = (rows) => rows.reduce((t, a) => t + effective(a), 0);
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
      async snapshot(row) {
        const { error } = await sb.from("snapshots").upsert(row, { onConflict: "user_id,date" });
        if (error) throw error;
      },
    }
  : {
      async list(t) { return local.read(t); },
      async add(t, row) { local.write(t, [...local.read(t), { id: crypto.randomUUID(), ...row }]); },
      async set(t, id, patch) { local.write(t, local.read(t).map((r) => (r.id === id ? { ...r, ...patch } : r))); },
      async del(t, id) { local.write(t, local.read(t).filter((r) => r.id !== id)); },
      async snapshot(row) { local.write("snapshots", [...local.read("snapshots").filter((r) => r.date !== row.date), { id: crypto.randomUUID(), ...row }]); },
    };

let tx = [];
let assets = [];
let snapshots = [];
let goals = [];
let charts = {};

async function refresh(saveSnapshot = false) {
  [tx, assets] = await Promise.all([store.list("transactions"), store.list("assets")]);
  if (saveSnapshot) await store.snapshot({ date: today(), total: netTotal(assets) });
  [snapshots, goals] = await Promise.all([store.list("snapshots"), store.list("goals")]);
  render();
}

// aggiorna il saldo del conto collegato: entrata = +, spesa = -; sign -1 annulla l'effetto
async function applyToAsset(assetId, type, amount, sign = 1) {
  const a = assets.find((x) => x.id === assetId);
  if (!a) return false;
  const delta = (type === "entrata" ? 1 : -1) * sign * Number(amount);
  await store.set("assets", a.id, { value: Math.round((Number(a.value) + delta) * 100) / 100 });
  return true;
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

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function setChart(id, config) {
  if (charts[id]) charts[id].destroy();
  if (!window.Chart) return;
  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--line");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  charts[id] = new Chart($("#" + id), config);
}

function gradient(ctx, area, color) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, color + "66");
  g.addColorStop(1, color + "00");
  return g;
}

function renderDashboard() {
  const net = netTotal(assets);
  const m = totalsOf(monthKey());
  $("#k-net").textContent = eur.format(net);
  $("#k-net").className = signClass(net);
  $("#k-in").textContent = eur.format(m.entrate);
  $("#k-out").textContent = eur.format(m.spese);
  const save = m.entrate - m.spese;
  $("#k-save").textContent = eur.format(save);
  $("#k-save").className = signClass(save);

  renderGoal(net);

  const keys = Object.keys(SEZIONI);
  setChart("ch-assets", {
    type: "doughnut",
    data: {
      labels: keys.map((k) => SEZIONI[k].label),
      datasets: [{ data: keys.map((k) => Math.max(0, netTotal(assets.filter((a) => a.section === k)))), backgroundColor: [css("--warn"), css("--accent2"), css("--pos"), css("--accent")], borderColor: css("--card"), borderWidth: 3 }],
    },
    options: { maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${eur.format(c.parsed)}` } } } },
  });

  const hist = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  setChart("ch-history", {
    type: "line",
    data: {
      labels: hist.map((h) => h.date),
      datasets: [
        { label: "Patrimonio netto", data: hist.map((h) => Number(h.total)), borderColor: css("--accent"), backgroundColor: (c) => (c.chart.chartArea ? gradient(c.chart.ctx, c.chart.chartArea, css("--accent")) : "transparent"), borderWidth: 3, pointRadius: 3, pointBackgroundColor: css("--accent"), fill: true, tension: 0.35 },
        ...(goals[0] ? [{ label: "Obiettivo", data: hist.map(() => Number(goals[0].target)), borderColor: css("--warn"), borderDash: [6, 6], pointRadius: 0, fill: false }] : []),
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: !!goals[0], labels: { usePointStyle: true } } , tooltip: { callbacks: { label: (c) => eur.format(c.parsed.y) } } } },
  });

  const months = [-5, -4, -3, -2, -1, 0].map(monthKey);
  const data = months.map(totalsOf);
  setChart("ch-months", {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Entrate", data: data.map((d) => d.entrate), backgroundColor: css("--pos"), borderRadius: 6 },
        { label: "Spese", data: data.map((d) => d.spese), backgroundColor: css("--neg"), borderRadius: 6 },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true } } }, scales: { y: { beginAtZero: true } } },
  });
}

function renderGoal(net) {
  const g = goals[0];
  $("#goal-info").hidden = !g;
  if (!g) return;
  const target = Number(g.target);
  $("#goal-target").value = target;
  $("#goal-date").value = g.deadline;
  const pct = Math.max(0, Math.min(100, Math.round((net / target) * 100)));
  $("#goal-fill").style.width = pct + "%";
  const missing = target - net;
  const days = Math.ceil((new Date(g.deadline) - new Date()) / 864e5);
  let text = `${pct}% · mancano ${eur.format(missing)}`;
  if (missing <= 0) text = "🎯 Obiettivo raggiunto!";
  else if (days <= 0) text += " · scadenza passata";
  else if (days < 30) text += ` · scade tra ${days} giorni`;
  else text += ` · servono ${eur.format(missing / (days / 30.44))}/mese`;
  $("#goal-text").textContent = text;
}

function accountLabel(t) {
  const a = assets.find((x) => x.id === t.asset_id);
  return a ? `<br><span class="muted small">${esc(a.name)}</span>` : "";
}

function renderMovimenti() {
  fillCats($("#tx-cat").value);
  fillAccounts();
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
      <td>${esc(t.date)}</td><td>${esc(t.category)}${accountLabel(t)}</td><td>${esc(t.note)}</td>
      <td class="r ${t.type === "entrata" ? "pos" : "neg"}">${t.type === "entrata" ? "+" : "−"}${eur.format(t.amount)}</td>
      <td class="r"><button class="btn ghost small" data-del-tx="${esc(t.id)}" aria-label="Elimina">✕</button></td>
    </tr>`).join("");
}

function renderPatrimonio() {
  $("#as-sections").innerHTML = Object.entries(SEZIONI).map(([key, s]) => {
    const rows = assets.filter((a) => a.section === key);
    const tot = netTotal(rows);
    return `<div class="card">
      <div class="row between"><h2>${s.label}</h2><strong class="${signClass(tot)}">${eur.format(tot)}</strong></div>
      ${rows.length ? rows.map((a) => `<div class="asset">
        <div><strong>${esc(a.name)}</strong><br><span class="muted small">${esc(a.type)}</span>${key === "debiti" ? `<label class="check small"><input type="checkbox" data-count-asset="${esc(a.id)}" ${a.counted === false ? "" : "checked"}> Conta nel patrimonio</label>` : ""}</div>
        <input type="number" step="0.01" value="${Number(a.value)}" data-set-asset="${esc(a.id)}" aria-label="Valore ${esc(a.name)}">
        <button class="btn ghost small" data-del-asset="${esc(a.id)}" aria-label="Elimina">✕</button>
      </div>`).join("") : `<p class="muted">Nessuna voce.</p>`}
    </div>`;
  }).join("");
}

// ===== Form helpers =====
const NEW_CAT = "__new";

// categorie predefinite + quelle create dall'utente (ricavate dai movimenti esistenti)
function catList(type) {
  const extra = [...new Set(tx.filter((t) => t.type === type).map((t) => t.category))].filter((c) => !CATEGORIE[type].includes(c));
  return [...CATEGORIE[type], ...extra.sort((a, b) => a.localeCompare(b))];
}

const isDebtType = (t) => t === "debito" || t === "credito";

// debito/credito: niente categoria, si indica con chi; il movimento crea una voce in Patrimonio
function toggleTxMode() {
  const debt = isDebtType($("#tx-type").value);
  ["#tx-cat", "#tx-date", "#tx-note"].forEach((id) => ($(id).hidden = debt));
  $("#tx-who").hidden = $("#tx-counted-wrap").hidden = !debt;
  $("#tx-who").required = debt;
  $("#tx-who").placeholder = $("#tx-type").value === "credito" ? "A chi hai prestato (es. Mario)" : "Da chi hai ricevuto (es. Mario)";
  $("#tx-cat").required = !debt;
  $("#tx-date").required = !debt;
  if (debt) $("#tx-newcat").hidden = true;
  else fillCats();
}

function fillCats(selected) {
  if (isDebtType($("#tx-type").value)) return;
  const sel = $("#tx-cat");
  const list = catList($("#tx-type").value);
  sel.innerHTML = list.map((v) => `<option>${esc(v)}</option>`).join("") + `<option value="${NEW_CAT}">➕ Nuova categoria…</option>`;
  sel.value = list.includes(selected) || selected === NEW_CAT ? selected : list[0];
  toggleNewCat();
}

// contanti: nessun nome obbligatorio, solo una nota facoltativa
function adaptAssetName() {
  const cash = $("#as-section").value === "contanti";
  $("#as-name").required = !cash;
  const debt = $("#as-section").value === "debiti";
  $("#as-name").placeholder = cash ? "Nota (opzionale)" : debt ? "Nome (es. Mario)" : "Nome (es. Fineco, Bitcoin)";
  $("#as-counted-wrap").hidden = !debt;
  $("#as-value").min = debt ? "0.01" : "";
  $("#as-value").placeholder = debt ? "Importo €" : "Valore € (debito: -)";
}

// conti selezionabili: contanti e banche
function fillAccounts() {
  const sel = $("#tx-asset");
  const prev = sel.value;
  const accs = assets.filter((a) => a.section === "contanti" || a.section === "banche");
  const dup = (a) => accs.filter((x) => x.name === a.name).length > 1; // il tipo serve solo a distinguere nomi uguali
  sel.innerHTML = accs.map((a) => `<option value="${esc(a.id)}">${esc(dup(a) ? `${a.name} · ${a.type}` : a.name)}</option>`).join("")
    + `<option value="">Nessun conto</option>`;
  sel.value = accs.some((a) => a.id === prev) ? prev : accs.length ? accs[0].id : "";
}

// debito = soldi ricevuti (entrano nel conto); credito = soldi prestati (escono dal conto)
function submitDebt() {
  run(async () => {
    const debito = $("#tx-type").value === "debito";
    const amount = Number($("#tx-amount").value);
    await store.add("assets", {
      section: "debiti", type: debito ? "Debito" : "Credito", name: $("#tx-who").value.trim(),
      value: amount, counted: $("#tx-counted").checked,
    });
    const accId = $("#tx-asset").value;
    if (accId) await applyToAsset(accId, debito ? "entrata" : "spesa", amount);
    $("#tx-amount").value = "";
    $("#tx-who").value = "";
    await refresh(true);
  });
}

function toggleNewCat() {
  const isNew = $("#tx-cat").value === NEW_CAT;
  $("#tx-newcat").hidden = !isNew;
  $("#tx-newcat").required = isNew;
  if (isNew) $("#tx-newcat").focus();
}

function fillOptions(sel, list) {
  sel.innerHTML = list.map((v) => `<option>${esc(v)}</option>`).join("");
}

// ===== Eventi (registrati una sola volta) =====
function init() {
  fillCats();
  fillOptions($("#as-type"), SEZIONI.contanti.tipi);
  $("#as-section").innerHTML = Object.entries(SEZIONI).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
  adaptAssetName();
  toggleTxMode();
  $("#tx-date").value = today();
  $("#tx-month").value = monthKey();

  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((x) => x.classList.toggle("active", x === b));
      ["dashboard", "movimenti", "patrimonio"].forEach((v) => ($("#view-" + v).hidden = v !== b.dataset.view));
      if (b.dataset.view === "dashboard") renderDashboard();
    })
  );

  $("#tx-type").addEventListener("change", toggleTxMode);
  $("#tx-cat").addEventListener("change", toggleNewCat);
  $("#as-section").addEventListener("change", (e) => {
    fillOptions($("#as-type"), SEZIONI[e.target.value].tipi);
    adaptAssetName();
  });
  $("#tx-month").addEventListener("change", renderMovimenti);

  $("#tx-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (isDebtType($("#tx-type").value)) return submitDebt();
    run(async () => {
      const category = $("#tx-cat").value === NEW_CAT ? $("#tx-newcat").value.trim() : $("#tx-cat").value;
      const row = {
        date: $("#tx-date").value, type: $("#tx-type").value, category,
        amount: Number($("#tx-amount").value), note: $("#tx-note").value.trim() || null,
        asset_id: $("#tx-asset").value || null,
      };
      await store.add("transactions", row);
      const touched = row.asset_id ? await applyToAsset(row.asset_id, row.type, row.amount) : false;
      $("#tx-amount").value = "";
      $("#tx-note").value = "";
      $("#tx-newcat").value = "";
      await refresh(touched);
      fillCats(category);
    });
  });

  $("#as-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await store.add("assets", {
        section: $("#as-section").value, type: $("#as-type").value,
        name: $("#as-name").value.trim() || "Contanti", value: Number($("#as-value").value),
        ...($("#as-section").value === "debiti" ? { counted: $("#as-counted").checked } : {}),
      });
      $("#as-name").value = "";
      $("#as-value").value = "";
      await refresh(true);
    });
  });

  $("#goal-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      const row = { target: Number($("#goal-target").value), deadline: $("#goal-date").value };
      if (goals[0]) await store.set("goals", goals[0].id, row);
      else await store.add("goals", row);
      await refresh();
    });
  });

  document.addEventListener("click", (e) => {
    const txId = e.target.dataset.delTx;
    const asId = e.target.dataset.delAsset;
    if (txId && confirm("Eliminare questo movimento? Il saldo del conto collegato verrà ripristinato.")) run(async () => {
      const t = tx.find((x) => x.id === txId);
      await store.del("transactions", txId);
      const touched = t && t.asset_id ? await applyToAsset(t.asset_id, t.type, t.amount, -1) : false;
      await refresh(touched);
    });
    if (asId && confirm("Eliminare questa voce?")) run(async () => { await store.del("assets", asId); await refresh(true); });
  });

  document.addEventListener("change", (e) => {
    const cid = e.target.dataset.countAsset;
    if (cid) run(async () => { await store.set("assets", cid, { counted: e.target.checked }); await refresh(true); });
    const id = e.target.dataset.setAsset;
    if (id && e.target.value !== "") run(async () => { await store.set("assets", id, { value: Number(e.target.value) }); await refresh(true); });
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
