// ===== AUTH =====
const APP_PASSWORD = 'mbnpl';
(function initAuth() {
  if (sessionStorage.getItem('berto_auth') === '1') {
    document.getElementById('auth-gate').classList.add('hidden');
  }
})();
function tryAuth() {
  if (document.getElementById('auth-input').value === APP_PASSWORD) {
    sessionStorage.setItem('berto_auth', '1');
    document.getElementById('auth-gate').classList.add('hidden');
  } else {
    document.getElementById('auth-err').classList.remove('hidden');
    document.getElementById('auth-input').value = '';
    document.getElementById('auth-input').focus();
  }
}

// ===== UTILS =====
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => n ? '€\u202f' + Number(n).toLocaleString('it-IT') : '—';
const fmtPos = n => n > 0 ? '€\u202f' + Number(n).toLocaleString('it-IT') : '—';

// ===== PIATTAFORMA (localStorage) =====
function getPiattaforma(id) {
  return localStorage.getItem('berto_pf_' + id) || '';
}
function setPiattaforma(id, val) {
  if (val) localStorage.setItem('berto_pf_' + id, val);
  else localStorage.removeItem('berto_pf_' + id);
  buildKPIs();
}

// ===== BADGES =====
function bEsito(v) {
  if (!v) return '<span class="badge b-muted">—</span>';
  if (v === 'VINTO') return '<span class="badge b-vinto">🏆 VINTO</span>';
  return '<span class="badge b-perso">✗ PERSO</span>';
}
function bPrel(v) {
  if (!v) return '<span class="badge b-muted">—</span>';
  if (v === 'SÌ') return '<span class="badge b-si">✓ SÌ</span>';
  if (v === 'IN CORSO') return '<span class="badge b-incorso">⏳ IN CORSO</span>';
  if (v === 'DA RIFARE') return '<span class="badge b-darifare">↺ DA RIFARE</span>';
  return `<span class="badge b-muted">${esc(v)}</span>`;
}
function bRegist(v) {
  if (!v) return '—';
  if (v === 'SPID') return '<span class="badge b-spid">SPID</span>';
  if (v === 'REV') return '<span class="badge b-rev">REV</span>';
  return '<span class="badge b-doc">DOC</span>';
}
function bBloc(v) {
  return v ? '<span class="badge b-blocco">🔒 BLOCC.</span>' : '<span class="badge b-si">✓</span>';
}

// ===== VIEW SWITCHING =====
function switchView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelector('[data-view="' + name + '"]').classList.add('active');
  if (name === 'statistiche' && !chartsBuilt.stat) buildStatCharts();
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ===== KPI =====
function buildKPIs() {
  const active = CLIENTS.filter(c => c.deposito > 0);
  const dep = active.reduce((s, c) => s + c.deposito, 0);
  const rit = active.reduce((s, c) => s + c.rititatiTot, 0);
  const comm = CLIENTS.reduce((s, c) => s + c.tramiti + c.clienti, 0);
  const mylotteryFee = active.filter(c => getPiattaforma(c.id) === 'MYLOTTERY').length * 50;
  const totUscite = dep + mylotteryFee;
  const diff = rit - totUscite;
  const attivi = CLIENTS.filter(c => c.prelevati === 'IN CORSO' || c.prelevati === 'DA RIFARE' || (!c.prelevati && c.deposito > 0)).length;

  document.getElementById('k-clienti').textContent = active.length;
  document.getElementById('k-dep').textContent = fmt(totUscite);
  document.getElementById('k-rit').textContent = fmt(rit);

  const kd = document.getElementById('k-diff');
  kd.textContent = (diff >= 0 ? '+' : '') + fmt(Math.abs(diff));
  kd.className = 'kpi-val ' + (diff >= 0 ? 'pos' : 'neg');

  document.getElementById('k-comm').textContent = fmt(comm);
  document.getElementById('k-attivi').textContent = attivi;
}

// ===== CHARTS =====
const chartsBuilt = {};
const CHART_DEFAULTS = {
  color: '#8b949e',
  gridColor: 'rgba(48,54,61,0.6)',
  font: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", size: 11 }
};

function chartOpts(extra = {}) {
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  }, extra);
}

function buildDashCharts() {
  if (chartsBuilt.dash) return;
  chartsBuilt.dash = true;

  const active = CLIENTS.filter(c => c.esito);
  const vinti = active.filter(c => c.esito === 'VINTO').length;
  const persi = active.filter(c => c.esito === 'PERSO').length;

  // Donut: esito
  new Chart(document.getElementById('ch-esito'), {
    type: 'doughnut',
    data: {
      labels: ['Vinto', 'Perso'],
      datasets: [{ data: [vinti, persi],
        backgroundColor: ['rgba(63,185,80,0.85)', 'rgba(248,81,73,0.85)'],
        borderColor: ['rgba(63,185,80,1)', 'rgba(248,81,73,1)'],
        borderWidth: 2 }]
    },
    options: { ...chartOpts(), cutout: '70%',
      plugins: { legend: { display: true, position: 'bottom',
        labels: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, padding: 14, boxWidth: 12 }
      }}
    }
  });

  // Bar: ritirato per tramite
  const tmap = {};
  CLIENTS.forEach(c => { if (c.tramite) tmap[c.tramite] = (tmap[c.tramite]||0) + c.rititatiTot; });
  const tlabels = Object.keys(tmap).sort((a,b) => tmap[b]-tmap[a]);
  const tvals = tlabels.map(l => tmap[l]);

  new Chart(document.getElementById('ch-tramite'), {
    type: 'bar',
    data: { labels: tlabels, datasets: [{
      label: '€ Ritirato', data: tvals,
      backgroundColor: 'rgba(88,166,255,0.7)',
      borderColor: 'rgba(88,166,255,1)',
      borderWidth: 1, borderRadius: 6
    }]},
    options: { ...chartOpts(),
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.parsed.y) }}
      },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation: 25 }},
        y: { grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, callback: v => '€' + v.toLocaleString('it-IT') }}
      }
    }
  });

  // Donut: stato prelievi
  const stati = {
    'Completati': CLIENTS.filter(c => c.prelevati === 'SÌ').length,
    'In Corso':   CLIENTS.filter(c => c.prelevati === 'IN CORSO').length,
    'Da Rifare':  CLIENTS.filter(c => c.prelevati === 'DA RIFARE').length,
    'Non avviati':CLIENTS.filter(c => !c.prelevati && c.deposito > 0).length,
  };
  new Chart(document.getElementById('ch-stati'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(stati),
      datasets: [{ data: Object.values(stati),
        backgroundColor: ['rgba(63,185,80,0.85)','rgba(227,179,65,0.85)','rgba(255,123,114,0.85)','rgba(139,148,158,0.4)'],
        borderWidth: 2 }]
    },
    options: { ...chartOpts(), cutout: '65%',
      plugins: { legend: { display: true, position: 'bottom',
        labels: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, padding: 10, boxWidth: 12 }
      }}
    }
  });
}

function buildStatCharts() {
  chartsBuilt.stat = true;

  // Horizontal bar: ritirato per cliente
  const sorted = [...CLIENTS].filter(c => c.deposito > 0).sort((a,b) => b.rititatiTot - a.rititatiTot);
  new Chart(document.getElementById('ch-clienti'), {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.cliente),
      datasets: [{
        label: '€ Ritirato',
        data: sorted.map(c => c.rititatiTot),
        backgroundColor: sorted.map(c => c.esito === 'VINTO' ? 'rgba(63,185,80,0.75)' : 'rgba(88,166,255,0.65)'),
        borderRadius: 5
      }, {
        label: '€ Depositato',
        data: sorted.map(c => c.deposito),
        backgroundColor: 'rgba(139,148,158,0.2)',
        borderRadius: 5
      }]
    },
    options: { ...chartOpts(),
      plugins: { legend: { display: true, labels: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, boxWidth: 12 }}},
      scales: {
        x: { grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation: 40 }},
        y: { grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, callback: v => '€'+v.toLocaleString('it-IT') }}
      }
    }
  });

  // Bar stacked: commissioni per tramite
  const cmap = {};
  CLIENTS.forEach(c => {
    if (!c.deposito) return;
    if (!cmap[c.tramite]) cmap[c.tramite] = { t: 0, cl: 0 };
    cmap[c.tramite].t += c.tramiti;
    cmap[c.tramite].cl += c.clienti;
  });
  const cl = Object.keys(cmap);
  new Chart(document.getElementById('ch-comm'), {
    type: 'bar',
    data: {
      labels: cl,
      datasets: [
        { label: '€ Tramite', data: cl.map(k => cmap[k].t), backgroundColor: 'rgba(88,166,255,0.75)', borderRadius: 5 },
        { label: '€ Cliente',  data: cl.map(k => cmap[k].cl), backgroundColor: 'rgba(188,140,255,0.75)', borderRadius: 5 }
      ]
    },
    options: { ...chartOpts(),
      plugins: { legend: { display: true, labels: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, boxWidth: 12 }}},
      scales: {
        x: { stacked: true, grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation: 30 }},
        y: { stacked: true, grid: { color: CHART_DEFAULTS.gridColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, callback: v => '€'+v }}
      }
    }
  });

  // Pie: clienti per tramite
  const pmap = {};
  CLIENTS.forEach(c => { if (c.deposito && c.tramite) pmap[c.tramite] = (pmap[c.tramite]||0)+1; });
  const pl = Object.keys(pmap);
  const PIE_COLORS = ['rgba(88,166,255,.85)','rgba(63,185,80,.85)','rgba(248,81,73,.85)','rgba(188,140,255,.85)','rgba(227,179,65,.85)','rgba(255,123,114,.85)','rgba(58,200,200,.85)','rgba(200,120,200,.85)','rgba(120,200,120,.85)'];
  new Chart(document.getElementById('ch-pie'), {
    type: 'pie',
    data: {
      labels: pl,
      datasets: [{ data: pl.map(k => pmap[k]), backgroundColor: PIE_COLORS.slice(0, pl.length), borderWidth: 2, borderColor: '#161b22' }]
    },
    options: { ...chartOpts(),
      plugins: { legend: { display: true, position: 'right', labels: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, padding: 14, boxWidth: 12 }}}
    }
  });
}

// ===== TABLE =====
let filteredData = [...CLIENTS];
let sortState = { col: null, dir: 1 };

const COLS_FULL = [
  { k: 'id',         h: '#' },
  { k: 'tramite',    h: 'Tramite' },
  { k: 'cliente',    h: 'Cliente' },
  { k: 'data',       h: 'Data' },
  { k: 'regist',     h: 'Reg.' },
  { k: 'deposito',   h: 'Dep.' },
  { k: 'tel',        h: 'Tel.' },
  { k: 'esito',      h: 'Esito' },
  { k: 'rititatiTot',h: 'Ritirato' },
  { k: 'prelevati',  h: 'Prelevati' },
  { k: 'bloc',       h: 'Bloc.' },
  { k: '_act',       h: '' },
];
const COLS_COMPACT = [
  { k: 'tramite',    h: 'Tramite' },
  { k: 'cliente',    h: 'Cliente' },
  { k: 'data',       h: 'Data' },
  { k: 'deposito',   h: 'Dep.' },
  { k: 'esito',      h: 'Esito' },
  { k: 'rititatiTot',h: 'Ritirato' },
  { k: 'prelevati',  h: 'Stato' },
];

function renderCell(c, k) {
  switch(k) {
    case 'id':          return `<span class="text-muted">${c.id}</span>`;
    case 'tramite':     return `<strong>${esc(c.tramite)}</strong>`;
    case 'cliente':     return esc(c.cliente);
    case 'data':        return `<span class="text-muted">${esc(c.data)}</span>`;
    case 'regist':      return bRegist(c.regist) + (c.carta === 'REV' && c.regist !== 'REV' ? ' <span class="badge b-rev" style="font-size:9px">REV</span>' : '');
    case 'deposito':    return c.deposito ? fmt(c.deposito) : '<span class="text-muted">—</span>';
    case 'tel':         return `<span class="text-muted">${c.tel || '—'}</span>`;
    case 'esito':       return bEsito(c.esito);
    case 'rititatiTot': return c.rititatiTot > 0 ? `<span class="text-green">${fmt(c.rititatiTot)}</span>` : `<span class="text-muted">—</span>`;
    case 'prelevati':   return bPrel(c.prelevati);
    case 'bloc':        return bBloc(c.bloc);
    case '_act':        return `<button class="btn-eye" onclick="event.stopPropagation();openModal(${c.id})">👁 Dettagli</button>`;
    default: return '—';
  }
}

function buildTable(containerId, data, cols) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let h = '<div class="table-wrap"><table><thead><tr>';
  cols.forEach(col => {
    const sort = sortState.col === col.k ? (sortState.dir === 1 ? ' ↑' : ' ↓') : '';
    h += `<th onclick="doSort('${col.k}')">${col.h}${sort}</th>`;
  });
  h += '</tr></thead><tbody>';
  data.forEach(c => {
    let cls = '';
    if (c.bloc) cls = 'row-blocco';
    else if (c.esito === 'VINTO') cls = 'row-vinto';
    else if (c.prelevati === 'IN CORSO') cls = 'row-incorso';
    else if (c.prelevati === 'DA RIFARE') cls = 'row-darifare';
    h += `<tr class="${cls}" onclick="openModal(${c.id})">`;
    cols.forEach(col => { h += `<td>${renderCell(c, col.k)}</td>`; });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function doSort(col) {
  if (sortState.col === col) sortState.dir *= -1;
  else { sortState.col = col; sortState.dir = 1; }
  filteredData.sort((a, b) => {
    let va = a[col], vb = b[col];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return va < vb ? -sortState.dir : va > vb ? sortState.dir : 0;
  });
  refreshTable();
}

function refreshTable() {
  buildTable('main-table', filteredData, COLS_FULL);
  const ft = document.getElementById('tfoot');
  if (ft) ft.innerHTML = `Visualizzati <strong>${filteredData.length}</strong> su <strong>${CLIENTS.length}</strong> clienti`;
}

function applyFilters() {
  const q    = (document.getElementById('f-search')?.value || '').toLowerCase();
  const trm  = document.getElementById('f-tramite')?.value || '';
  const esi  = document.getElementById('f-esito')?.value || '';
  const sto  = document.getElementById('f-stato')?.value || '';
  filteredData = CLIENTS.filter(c => {
    if (q && !c.cliente.toLowerCase().includes(q) && !c.tramite.toLowerCase().includes(q)) return false;
    if (trm && c.tramite !== trm) return false;
    if (esi && c.esito !== esi) return false;
    if (sto && c.prelevati !== sto) return false;
    return true;
  });
  refreshTable();
}

function populateFilter(id, values) {
  const sel = document.getElementById(id);
  if (!sel) return;
  [...new Set(values.filter(Boolean))].sort().forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  sel.addEventListener('change', applyFilters);
}

// ===== MODAL =====
function openModal(id) {
  const c = CLIENTS.find(x => x.id === id);
  if (!c) return;

  document.getElementById('modal-title').textContent = esc(c.cliente);
  document.getElementById('modal-sub').textContent = `Tramite: ${c.tramite} · ${c.data}`;

  const prelievi = [
    { n: '1°', a: c.prel1, d: c.info1 },
    { n: '2°', a: c.prel2, d: c.info2 },
    { n: '3°', a: c.prel3, d: c.info3 },
  ].filter(p => p.a > 0);

  const fieldHtml = (lbl, val, full=false) =>
    `<div class="mfield${full?' full':''}"><div class="mfield-lbl">${lbl}</div><div class="mfield-val">${val}</div></div>`;

  const credHtml = (lbl, val) => val && val !== 'X' && val !== '—' ?
    `<div class="mfield"><div class="mfield-lbl">${lbl}</div>
      <div class="mfield-val">
        <div class="cred-row">
          <span class="cred-val">${esc(val)}</span>
          <button class="btn-copy" onclick="copyText('${esc(val)}', this)">📋 Copia</button>
          <span class="copy-ok">✓ Copiato</span>
        </div>
      </div>
    </div>` : fieldHtml(lbl, val || '—');

  document.getElementById('modal-body').innerHTML = `
    <!-- Generale -->
    <div class="msec">
      <div class="msec-title">Informazioni generali</div>
      <div class="mfield-grid">
        ${fieldHtml('Tramite', esc(c.tramite))}
        ${fieldHtml('Data registrazione', c.data)}
        ${fieldHtml('Tipo reg.', bRegist(c.regist))}
        ${fieldHtml('Carta', c.carta || '—')}
        ${fieldHtml('Linee tel.', c.tel || '—')}
        ${fieldHtml('Deposito', fmt(c.deposito))}
        <div class="mfield"><div class="mfield-lbl">Piattaforma</div><div class="mfield-val"><select class="input-select" style="font-size:13px;padding:4px 8px" onchange="setPiattaforma(${c.id}, this.value)"><option value="" ${getPiattaforma(c.id)===''?'selected':''}>— Non specificata</option><option value="SNAI" ${getPiattaforma(c.id)==='SNAI'?'selected':''}>SNAI</option><option value="MYLOTTERY" ${getPiattaforma(c.id)==='MYLOTTERY'?'selected':''}>MyLottery (+€\u202f50)</option></select></div></div>
        ${fieldHtml('Flipping', esc(c.flipping))}
        ${fieldHtml('Wagering', esc(c.wagering))}
      </div>
    </div>

    <!-- Risultati -->
    <div class="msec">
      <div class="msec-title">Risultati</div>
      <div class="mfield-grid">
        ${fieldHtml('Esito', bEsito(c.esito))}
        ${fieldHtml('Stato Fun Bonus', esc(c.statoFunBonus) || '—')}
        ${fieldHtml('Stato Saldo / R.Bonus', esc(c.statoSaldo) || '—')}
        ${c.fermato > 0 ? fieldHtml('Fermato', fmt(c.fermato)) : ''}
        ${c.arrivato > 0 ? fieldHtml('Arrivato', `<span class="text-green">${fmt(c.arrivato)}</span>`) : ''}
      </div>
    </div>

    <!-- Prelievi -->
    <div class="msec">
      <div class="msec-title">Prelievi · ${bPrel(c.prelevati)}</div>
      <div class="prel-list">
        ${prelievi.length > 0 ? prelievi.map(p => `
          <div class="prel-row">
            <span class="prel-lbl">${p.n} Prelievo</span>
            <span class="prel-amt">${fmt(p.a)}</span>
            ${p.d ? `<span class="prel-date">📅 ${esc(p.d)}</span>` : '<span></span>'}
          </div>`).join('') : '<span class="text-muted" style="font-size:13px">Nessun prelievo registrato</span>'}
        <div class="prel-row total">
          <span class="prel-lbl" style="font-weight:700;color:var(--text)">TOTALE RITIRATO</span>
          <span class="prel-amt total-amt">${fmt(c.rititatiTot)}</span>
          <span></span>
        </div>
        ${c.daPrel > 0 ? `<div class="prel-row" style="border-color:rgba(227,179,65,.25);background:rgba(227,179,65,.05)">
          <span class="prel-lbl">Ancora da prelevare</span>
          <span class="prel-amt" style="color:var(--gold)">${fmt(c.daPrel)}</span>
          <span></span>
        </div>` : ''}
      </div>
    </div>

    <!-- Commissioni -->
    <div class="msec">
      <div class="msec-title">Commissioni</div>
      <div class="mfield-grid">
        ${fieldHtml('€ Tramite', c.tramiti > 0 ? fmt(c.tramiti) : '—')}
        ${fieldHtml('€ Cliente',  c.clienti > 0 ? fmt(c.clienti) : '—')}
      </div>
    </div>

    <!-- Credenziali -->
    <div class="msec">
      <div class="msec-title">🔐 Credenziali</div>
      <div class="mfield-grid">
        ${credHtml('Username', c.username)}
        ${credHtml('Password', c.password)}
        ${c.parolaSegreta ? credHtml('Parola segreta', c.parolaSegreta) : ''}
      </div>
    </div>

    <!-- Note -->
    ${c.log ? `<div class="msec"><div class="msec-title">Note / Log</div>
      <div class="alert alert-warn">📝 ${esc(c.log)}</div></div>` : ''}
    ${c.bloc ? `<div class="alert alert-danger" style="margin-top:12px">🔒 Account BLOCCATO — richiede attenzione</div>` : ''}
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const ok = btn.nextElementSibling;
      btn.style.display = 'none';
      if (ok) { ok.style.display = 'inline'; setTimeout(() => { btn.style.display=''; ok.style.display='none'; }, 1800); }
    }
  });
}

// ===== INIT =====
(function init() {
  // Date
  document.getElementById('date-tag').textContent = new Date().toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  });

  buildKPIs();
  buildDashCharts();

  // Recent (last 5 with deposits)
  const recent = [...CLIENTS].filter(c => c.deposito > 0).slice(-5).reverse();
  buildTable('recent-table', recent, COLS_COMPACT);

  // Main table
  filteredData = [...CLIENTS];
  refreshTable();

  populateFilter('f-tramite', CLIENTS.map(c => c.tramite));

  document.getElementById('f-search')?.addEventListener('input', applyFilters);
  document.getElementById('f-esito')?.addEventListener('change', applyFilters);
  document.getElementById('f-stato')?.addEventListener('change', applyFilters);
})();
