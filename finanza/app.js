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
        // ordine esplicito: senza, Postgres puo' restituire le righe in ordine diverso dopo un aggiornamento
        const { data, error } = await sb.from(t).select("*").order("created_at", { ascending: true });
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

const ICONS = {
  entrata: "M17 7L7 17M7 17h8M7 17V9",
  spesa: "M7 17L17 7M17 7H9M17 7v8",
  giroconto: "M7 7h13M7 7l3-3M7 7l3 3M17 17H4M17 17l-3-3M17 17l-3 3",
  Casa: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  Cibo: "M6 3v8a3 3 0 0 0 3 3v7M9 3v8M12 3v8M17 3c-2 2-3 5-3 8h3v10",
  Trasporti: "M5 16V9l2-4h10l2 4v7M3 16h18M7 19v-3M17 19v-3M8 12h.01M16 12h.01",
  Svago: "M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4zM12 4v12",
  Salute: "M12 21s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z",
  Shopping: "M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0",
  Abbonamenti: "M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5",
  Stipendio: "M3 7h18v10H3zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M6 10v.01M18 14v.01",
  Altro: "M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M5 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M19 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.Altro}"/></svg>`;
const fmtDay = (d) => new Date(d + "T00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const compact = (v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v);
const gridColor = () => (matchMedia("(prefers-color-scheme: light)").matches ? "rgba(15,23,42,.07)" : "rgba(255,255,255,.05)");

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
  $("#k-net").className = "big " + signClass(net);

  // variazione del mese: confronto con l'ultimo punto dello storico prima di questo mese
  const first = monthKey() + "-01";
  const prev = [...snapshots].filter((h) => h.date < first).sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevNet = prev ? Number(prev.total) : 0;
  $("#k-trend").hidden = !prevNet;
  if (prevNet) {
    const pct = ((net - prevNet) / Math.abs(prevNet)) * 100;
    $("#k-trend").textContent = `${pct >= 0 ? "↗ +" : "↘ "}${pct.toFixed(1).replace(".", ",")}% questo mese`;
    $("#k-trend").className = "chip " + (pct >= 0 ? "" : "neg");
  }
  $("#k-liq").textContent = eur.format(netTotal(assets.filter((a) => a.section === "contanti" || a.section === "banche")));
  $("#k-inv").textContent = eur.format(netTotal(assets.filter((a) => a.section === "investimenti")));
  const pm = totalsOf(monthKey(-1));
  const pmSave = pm.entrate - pm.spese;
  $("#k-prev").textContent = (pmSave > 0 ? "+" : "") + eur.format(pmSave);
  $("#k-prev").className = pmSave === 0 ? "" : signClass(pmSave);

  $("#k-in").textContent = eur.format(m.entrate);
  $("#k-out").textContent = eur.format(m.spese);
  const nIn = m.rows.filter((t) => t.type === "entrata").length;
  $("#k-in-sub").textContent = `${nIn} moviment${nIn === 1 ? "o" : "i"}`;
  $("#k-out-sub").textContent = m.entrate > 0 ? `${Math.round((m.spese / m.entrate) * 100)}% delle entrate` : "—";
  const save = m.entrate - m.spese;
  $("#k-save").textContent = (save > 0 ? "+" : "") + eur.format(save);
  $("#k-save").className = signClass(save);
  $("#k-rate").textContent = m.entrate > 0 ? `${((save / m.entrate) * 100).toFixed(1).replace(".", ",")}% tasso` : "— tasso";
  $("#k-rate").className = "chip " + (save < 0 ? "neg" : "");

  renderGoal(net);

  const keys = Object.keys(SEZIONI);
  const vals = keys.map((k) => Math.max(0, netTotal(assets.filter((a) => a.section === k))));
  const tot = vals.reduce((t, v) => t + v, 0);
  const colors = keys.map((k) => css("--c-" + k));
  setChart("ch-assets", {
    type: "doughnut",
    data: { labels: keys.map((k) => SEZIONI[k].label), datasets: [{ data: vals, backgroundColor: colors, borderColor: css("--card"), borderWidth: 3 }] },
    options: { maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${eur.format(c.parsed)}` } } } },
  });
  $("#donut-n").textContent = assets.filter((a) => a.section !== "debiti").length;
  $("#sec-total").textContent = tot > 0 ? "Totale 100%" : "";
  $("#sec-legend").innerHTML = keys
    .map((k, i) => `<li style="--c:${colors[i]}"><i></i><span>${esc(SEZIONI[k].label)}</span><b>${tot > 0 ? Math.round((vals[i] / tot) * 100) : 0}%</b></li>`)
    .join("");

  const hist = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  $("#lg-goal").hidden = !goals[0];
  setChart("ch-history", {
    type: "line",
    data: {
      labels: hist.map((h) => h.date),
      datasets: [
        { label: "Patrimonio netto", data: hist.map((h) => Number(h.total)), borderColor: css("--pos"), backgroundColor: (c) => (c.chart.chartArea ? gradient(c.chart.ctx, c.chart.chartArea, css("--pos")) : "transparent"), borderWidth: 2, pointRadius: 3, pointBackgroundColor: css("--pos"), pointBorderColor: css("--card"), pointBorderWidth: 1, fill: true, tension: 0.35 },
        ...(goals[0] ? [{ label: "Obiettivo", data: hist.map(() => Number(goals[0].target)), borderColor: css("--warn"), borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0, fill: false }] : []),
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => eur.format(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 6, callback(v) { return new Date(this.getLabelForValue(v) + "T00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }); } } },
        y: { grid: { color: gridColor() }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: compact } },
      },
    },
  });

  const months = [-5, -4, -3, -2, -1, 0].map(monthKey);
  const data = months.map(totalsOf);
  setChart("ch-months", {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Entrate", data: data.map((d) => d.entrate), backgroundColor: css("--pos"), borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7 },
        { label: "Spese", data: data.map((d) => d.spese), backgroundColor: css("--neg"), borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${eur.format(c.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { callback(v) { const l = this.getLabelForValue(v); return l.slice(5) + "/" + l.slice(2, 4); } } },
        y: { beginAtZero: true, grid: { color: gridColor() }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: compact } },
      },
    },
  });
}

function renderGoal(net) {
  const g = goals[0];
  $("#goal-info").hidden = !g;
  $("#goal-pct").textContent = "";
  if (!g) return;
  const target = Number(g.target);
  $("#goal-target").value = target;
  $("#goal-date").value = g.deadline;
  const pct = Math.max(0, Math.min(100, Math.round((net / target) * 100)));
  $("#goal-pct").textContent = pct + "%";
  $("#goal-fill").style.width = pct + "%";
  const missing = target - net;
  const days = Math.ceil((new Date(g.deadline) - new Date()) / 864e5);
  let left = `Mancano ${eur.format(missing)}`, right = "";
  if (missing <= 0) left = "🎯 Obiettivo raggiunto!";
  else if (days <= 0) right = "Scadenza passata";
  else if (days < 30) right = `Scade tra ${days} giorni`;
  else right = `Ritmo: ${eur.format(missing / (days / 30.44))}/mese`;
  $("#goal-left").textContent = left;
  $("#goal-right").textContent = right;
}

// riga sotto il titolo: conto (o percorso del giroconto) e data
function txSub(t) {
  const a = assets.find((x) => x.id === t.asset_id);
  let acc = a ? esc(a.name) : "";
  if (t.type === "giroconto") {
    const b = assets.find((x) => x.id === t.to_asset_id);
    acc = `${esc(a ? a.name : "?")} → ${esc(b ? b.name : "?")}`;
  }
  return (acc ? acc + " • " : "") + esc(fmtDay(t.date));
}

function syncSeg() {
  const type = $("#tx-type").value;
  document.querySelectorAll("#tx-seg button, #tx-seg2 button").forEach((b) => b.classList.toggle("on", b.dataset.type === type));
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
    .map((t) => {
      const kind = t.type === "giroconto" ? "xfer" : t.type === "entrata" ? "pos" : "neg";
      const ic = t.type === "giroconto" ? "giroconto" : ICONS[t.category] ? t.category : t.type;
      return `<div class="tx">
      <span class="tx-ico ${kind}">${icon(ic)}</span>
      <div class="tx-main"><strong>${esc(t.category)}</strong>${t.note ? `<span class="pill">${esc(t.note)}</span>` : ""}<small>${txSub(t)}</small></div>
      <span class="tx-amt ${kind}">${t.type === "giroconto" ? "⇄ " : t.type === "entrata" ? "+" : "−"}${eur.format(t.amount)}</span>
      <button class="icon-btn" data-del-tx="${esc(t.id)}" aria-label="Elimina">${icon("trash")}</button>
    </div>`;
    }).join("");
}

function sourceNote(a) {
  const src = a.section === "debiti" && assets.find((x) => x.id === a.source_id);
  return src ? `${a.type === "Debito" ? "ricevuto su" : "prestato da"} ${src.name}` : "";
}

// sigla del conto: "ING Arancio" -> ING, "Fineco" -> FI
const monogram = (name) => {
  const w = String(name).trim().split(/\s+/)[0] || "?";
  return (w.length <= 3 ? w : w.slice(0, 2)).toUpperCase();
};

function renderPatrimonio() {
  fillFrom();
  $("#as-sections").innerHTML = Object.entries(SEZIONI).map(([key, s]) => {
    const rows = assets.filter((a) => a.section === key);
    const tot = netTotal(rows);
    return `<div class="card">
      <div class="sec-h"><h2 class="bar-h" style="--bar: var(--c-${key})">${s.label}</h2><span class="sec-tot">Totale: <strong class="${signClass(tot)}">${eur.format(tot)}</strong></span></div>
      ${rows.length ? rows.map((a) => `<div class="asset" style="--c: var(--c-${key})">
        <span class="mono">${esc(monogram(a.name))}</span>
        <div class="as-main"><strong>${esc(a.name)}</strong><span class="pill">${esc(a.type)}</span>${key === "contanti" ? `<small>Disponibilità liquida</small>` : key === "debiti" ? `<small>${esc(sourceNote(a))}</small>` : ""}${key === "debiti" ? `<label class="check"><input type="checkbox" data-count-asset="${esc(a.id)}" ${a.counted === false ? "" : "checked"}> Conta nel patrimonio</label>` : ""}</div>
        <label class="val"><input type="number" step="0.01" value="${Number(a.value)}" data-set-asset="${esc(a.id)}" aria-label="Valore ${esc(a.name)}"><i>€</i></label>
        <button class="icon-btn" data-del-asset="${esc(a.id)}" aria-label="Elimina">${icon("trash")}</button>
      </div>`).join("") : `<p class="empty">Nessuna voce.</p>`}
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
  const type = $("#tx-type").value;
  const debt = isDebtType(type), xfer = type === "giroconto";
  $("#tx-cat").hidden = debt || xfer;
  ["#tx-date", "#tx-note"].forEach((id) => ($(id).hidden = debt));
  $("#tx-who").hidden = $("#tx-counted-wrap").hidden = !debt;
  $("#tx-to").hidden = !xfer;
  $("#tx-who").required = debt;
  $("#tx-who").placeholder = type === "credito" ? "A chi hai prestato (es. Mario)" : "Da chi hai ricevuto (es. Mario)";
  $("#tx-cat").required = !(debt || xfer);
  $("#tx-date").required = !debt;
  syncSeg();
  $("#tx-hint").hidden = !(debt || xfer);
  $("#tx-hint").textContent = xfer ? "Giroconto: sposta soldi da un conto all'altro. Non conta come entrata o spesa." : debtHint(type);
  if (debt || xfer) $("#tx-newcat").hidden = true;
  else fillCats();
  fillAccounts();
}

function fillCats(selected) {
  if (!CATEGORIE[$("#tx-type").value]) return;
  const sel = $("#tx-cat");
  const list = catList($("#tx-type").value);
  sel.innerHTML = list.map((v) => `<option>${esc(v)}</option>`).join("") + `<option value="${NEW_CAT}">➕ Nuova</option>`;
  sel.value = list.includes(selected) || selected === NEW_CAT ? selected : list[0];
  toggleNewCat();
}

// contanti: nessun nome obbligatorio, solo una nota facoltativa
function adaptAssetName() {
  const cash = $("#as-section").value === "contanti";
  $("#as-name").required = !cash;
  const debt = $("#as-section").value === "debiti";
  $("#as-name").placeholder = cash ? "Nota (opzionale)" : debt ? "Nome (es. Mario)" : "Es. Fineco, Bitcoin";
  $("#as-counted-wrap").hidden = $("#as-from").hidden = $("#as-hint").hidden = !debt;
  $("#as-hint").textContent = debtHint($("#as-type").value);
  $("#as-value").min = debt ? "0.01" : "";
  $("#as-value").placeholder = "0,00";
}

// conti selezionabili, raggruppati per sezione; il tipo si mostra solo per distinguere nomi uguali
function accountOptions(sections, noneLabel, prefix = "") {
  const accs = assets.filter((a) => sections.includes(a.section));
  const opt = (a) => `<option value="${esc(a.id)}">${esc(prefix + (accs.filter((x) => x.name === a.name).length > 1 ? `${a.name} · ${a.type}` : a.name))}</option>`;
  return sections
    .map((k) => ({ k, rows: accs.filter((a) => a.section === k) }))
    .filter((g) => g.rows.length)
    .map((g) => `<optgroup label="${SEZIONI[g.k].label}">${g.rows.map(opt).join("")}</optgroup>`).join("")
    + (noneLabel ? `<option value="">${noneLabel}</option>` : "");
}

const DEBT_SOURCES = ["contanti", "banche", "investimenti"];

// movimenti normali: contanti e banche; debiti/crediti e giroconti: anche gli investimenti (es. BTC)
function fillAccounts() {
  const sel = $("#tx-asset"), to = $("#tx-to");
  const type = $("#tx-type").value;
  const keep = (el, prev, fallback) => ([...el.options].some((o) => o.value && o.value === prev) ? prev : fallback);
  const prev = sel.value, prevTo = to.value;
  if (type === "giroconto") {
    sel.innerHTML = accountOptions(DEBT_SOURCES, "", "Da ");
    to.innerHTML = accountOptions(DEBT_SOURCES, "", "A ");
    sel.value = keep(sel, prev, sel.options[0]?.value ?? "");
    const other = [...to.options].find((o) => o.value !== sel.value);
    to.value = keep(to, prevTo, other ? other.value : "");
    if (to.value === sel.value && other) to.value = other.value;
    return;
  }
  const debt = isDebtType(type);
  sel.innerHTML = accountOptions(debt ? DEBT_SOURCES : ["contanti", "banche"], debt ? "Nessun conto collegato" : "Nessun conto");
  const first = sel.querySelector("option[value]:not([value=''])");
  sel.value = keep(sel, prev, first ? first.value : "");
}

function fillFrom() {
  const sel = $("#as-from");
  const prev = sel.value;
  sel.innerHTML = accountOptions(DEBT_SOURCES, "Nessun conto collegato");
  sel.value = [...sel.options].some((o) => o.value && o.value === prev) ? prev : "";
}

const debtHint = (type) => (type === "Credito" || type === "credito"
  ? "Credito: i soldi escono dal conto o investimento scelto."
  : "Debito: i soldi entrano nel conto o investimento scelto.");

// registra il debito/credito: aggiorna il conto collegato (debito = entrata, credito = uscita)
async function linkDebt(type, amount, accId) {
  if (accId) await applyToAsset(accId, type === "Debito" ? "entrata" : "spesa", amount);
}

// debito = soldi ricevuti (entrano nel conto); credito = soldi prestati (escono dal conto)
function submitDebt() {
  run(async () => {
    const type = $("#tx-type").value === "debito" ? "Debito" : "Credito";
    const amount = Number($("#tx-amount").value);
    const accId = $("#tx-asset").value;
    await store.add("assets", {
      section: "debiti", type, name: $("#tx-who").value.trim(),
      value: amount, counted: $("#tx-counted").checked, source_id: accId || null,
    });
    await linkDebt(type, amount, accId);
    $("#tx-amount").value = "";
    $("#tx-who").value = "";
    $("#tx-counted").checked = true;
    await refresh(true);
  });
}

// giroconto: sposta l'importo da un conto all'altro, senza toccare entrate/spese del mese
function submitTransfer() {
  run(async () => {
    const from = $("#tx-asset").value, to = $("#tx-to").value, amount = Number($("#tx-amount").value);
    if (!from || !to) throw new Error("Servono almeno due conti: aggiungili in Patrimonio.");
    if (from === to) throw new Error("Scegli due conti diversi.");
    await store.add("transactions", {
      date: $("#tx-date").value, type: "giroconto", category: "Giroconto", amount,
      note: $("#tx-note").value.trim() || null, asset_id: from, to_asset_id: to,
    });
    await applyToAsset(from, "spesa", amount);
    await applyToAsset(to, "entrata", amount);
    $("#tx-amount").value = "";
    $("#tx-note").value = "";
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
  document.querySelectorAll("#tx-seg button, #tx-seg2 button").forEach((b) =>
    b.addEventListener("click", () => { $("#tx-type").value = b.dataset.type; $("#tx-type").dispatchEvent(new Event("change")); })
  );
  $("#tx-cat").addEventListener("change", toggleNewCat);
  $("#tx-asset").addEventListener("change", () => {
    if ($("#tx-type").value === "giroconto" && $("#tx-to").value === $("#tx-asset").value) {
      const other = [...$("#tx-to").options].find((o) => o.value !== $("#tx-asset").value);
      if (other) $("#tx-to").value = other.value;
    }
  });
  $("#as-type").addEventListener("change", adaptAssetName);
  $("#as-section").addEventListener("change", (e) => {
    fillOptions($("#as-type"), SEZIONI[e.target.value].tipi);
    adaptAssetName();
  });
  $("#tx-month").addEventListener("change", renderMovimenti);

  $("#tx-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (isDebtType($("#tx-type").value)) return submitDebt();
    if ($("#tx-type").value === "giroconto") return submitTransfer();
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
      const debt = $("#as-section").value === "debiti";
      const type = $("#as-type").value, value = Number($("#as-value").value);
      const from = debt ? $("#as-from").value : "";
      await store.add("assets", {
        section: $("#as-section").value, type,
        name: $("#as-name").value.trim() || "Contanti", value,
        ...(debt ? { counted: $("#as-counted").checked, source_id: from || null } : {}),
      });
      await linkDebt(type, value, from);
      $("#as-name").value = "";
      $("#as-value").value = "";
      $("#as-counted").checked = true;
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
    const txId = e.target.closest("[data-del-tx]")?.dataset.delTx;
    const asId = e.target.closest("[data-del-asset]")?.dataset.delAsset;
    if (txId && confirm("Eliminare questo movimento? Il saldo del conto collegato verrà ripristinato.")) run(async () => {
      const t = tx.find((x) => x.id === txId);
      await store.del("transactions", txId);
      let touched = false;
      if (t && t.type === "giroconto") {
        const a = await applyToAsset(t.asset_id, "spesa", t.amount, -1);
        const b = await applyToAsset(t.to_asset_id, "entrata", t.amount, -1);
        touched = a || b;
      } else if (t && t.asset_id) touched = await applyToAsset(t.asset_id, t.type, t.amount, -1);
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
  $("#mode").textContent = CLOUD ? "Cloud" : "Locale";
  $("#mode-sub").textContent = CLOUD ? "Dati sincronizzati con il tuo account" : "Dati memorizzati esclusivamente in questo browser";
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
