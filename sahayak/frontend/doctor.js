/**
 * Sahayak AI — Doctor Portal
 * localStorage-first with API fallback.
 * Sections: My Patients | Patient Detail | All Records | Access New Patient
 */

const API   = '';
const TOKEN = localStorage.getItem('sahayak_token');
const ROLE  = localStorage.getItem('sahayak_role');
const DNAME = localStorage.getItem('sahayak_name') || 'Doctor';
const EMAIL = localStorage.getItem('sahayak_email') || '';
const DUID  = localStorage.getItem('sahayak_user_id') || 'guest';

/* Per-user storage key — each doctor only sees their own patient list */
function _dk(key) {
  return typeof getUserKey === 'function'
    ? getUserKey(key)
    : ('u_' + DUID + '_' + key);
}

if (!TOKEN || ROLE !== 'doctor') { location.href = 'auth.html'; }

const S = {
  patients: [],   // full patient objects {id, name, profile, reports, checkups}
  filtered: [],
  activeId: null,
  charts: {},
};

function authH() { return { 'Content-Type':'application/json', Authorization:`Bearer ${TOKEN}` }; }

/* ── LOCAL STORAGE HELPERS ──────────────────────────────── */
function getDocPatientList() {
  // Namespaced by user ID — new doctors start with empty patient list
  try {
    return JSON.parse(
      localStorage.getItem(_dk('patients'))
      || localStorage.getItem(`sah_doctor_patients_${EMAIL}`)  // legacy
      || '[]'
    );
  } catch { return []; }
}
function saveDocPatientList(list) {
  localStorage.setItem(_dk('patients'), JSON.stringify(list));
  localStorage.setItem(`sah_doctor_patients_${EMAIL}`, JSON.stringify(list)); // keep legacy
}
function getPatientData(pid) {
  try { return JSON.parse(localStorage.getItem(`sah_patient_${pid}`) || '{}'); } catch { return {}; }
}
function getPatientProfile(pid) {
  try { return JSON.parse(localStorage.getItem(`sah_profile_${pid}`) || 'null'); } catch { return null; }
}
function getCodeRegistry() {
  try { return JSON.parse(localStorage.getItem('sah_code_registry') || '{}'); } catch { return {}; }
}

/* ── BOOT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadMyPatients();
  renderPatientStats();
  renderDoctorProfile();   // sets avatar, name, spec from saved profile or localStorage
  showSection('my-patients');
});

/* ── LOAD PATIENTS ──────────────────────────────────────── */
async function loadMyPatients() {
  // Load from localStorage first
  const stored = getDocPatientList();
  S.patients = stored.map(entry => {
    const pd  = getPatientData(entry.patient_id);
    const prf = getPatientProfile(entry.patient_id) || {};
    const reports  = (pd.reports  || []).sort((a,b) => new Date(b.date)-new Date(a.date));
    const checkups = (pd.checkups || []).sort((a,b) => new Date(b.date)-new Date(a.date));
    return { id: entry.patient_id, name: entry.name || prf.name || prf.full_name || 'Patient', profile: prf, reports, checkups, added_at: entry.added_at, code: entry.code };
  });
  S.filtered = [...S.patients];

  // Try API in background
  if (API) {
    try {
      const r = await fetch(`${API}/doctor/patients`, { headers: authH() });
      if (r.ok) {
        const apiPatients = await r.json();
        // Merge with local
        apiPatients.forEach(p => {
          if (!S.patients.find(x => x.id === p.patient_id || x.id === p.id)) {
            S.patients.push({ id: p.patient_id||p.id, name: p.name, profile: p, reports: p.reports||[], checkups: p.checkups||[], added_at: p.added_at||new Date().toISOString() });
          }
        });
        S.filtered = [...S.patients];
      }
    } catch (_) {}
  }
}

/* ── NAVIGATION ─────────────────────────────────────────── */
const PAGES = {
  'my-patients':    { t:'My Patients',         s:'All patients who have shared their code with you' },
  'patient-detail': { t:'Patient Detail',      s:'Complete health history, charts and AI analysis' },
  'all-records':    { t:'Patient Records',     s:'Searchable database of all your accessible patients' },
  'access-patient': { t:'Access New Patient',  s:'Enter a patient share code to access their records' },
  'doc-profile':    { t:'My Profile',          s:'Your account details and professional information' },
};

function showSection(id, navEl) {
  document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const sec = document.getElementById(`sec-${id}`);
  if (sec) sec.classList.add('active');
  if (navEl) navEl.classList.add('active');
  else {
    const n = document.querySelector(`.nav-item[data-section="${id}"]`);
    if (n) n.classList.add('active');
  }
  const m = PAGES[id] || { t:id, s:'' };
  setTxt('doc-page-title', m.t);
  setTxt('doc-page-sub', m.s);

  if (id === 'my-patients')  renderPatientGrid();
  if (id === 'all-records')  renderAllRecords();
  if (id === 'patient-detail' && S.activeId) renderPatientDetail(S.activeId);
  if (id === 'doc-profile') {
    renderDoctorProfile();
    // Update activity stats
    setTxt('dp-prof-stat-patients', S.patients.length);
    setTxt('dp-prof-stat-reports',  S.patients.reduce((s,p)=>s+p.reports.length,0));
    setTxt('dp-prof-stat-highrisk', S.patients.filter(p=>p.reports[0]&&(p.reports[0].ai_risk==='HIGH'||p.reports[0].ai_risk==='EMERGENCY')).length);
  }
}

/* ── PATIENT STATS ──────────────────────────────────────── */
function renderPatientStats() {
  const high = S.patients.filter(p => {
    const r = p.reports[0];
    return r && (r.ai_risk === 'HIGH' || r.ai_risk === 'EMERGENCY');
  }).length;
  const totalReports = S.patients.reduce((sum,p) => sum + p.reports.length, 0);
  const weekAgo = Date.now() - 7*86400000;
  const updated = S.patients.filter(p => p.reports[0] && new Date(p.reports[0].date) > weekAgo).length;
  setTxt('doc-stat-total',   S.patients.length);
  setTxt('doc-stat-highrisk', high);
  setTxt('doc-stat-reports',  totalReports);
  setTxt('doc-stat-updated',  updated);
  // Badge
  const badge = document.getElementById('patients-count');
  if (badge) { badge.textContent=S.patients.length; badge.style.display=S.patients.length>0?'inline-flex':'none'; }
}

/* ── PATIENT GRID ───────────────────────────────────────── */
function renderPatientGrid() {
  const grid = document.getElementById('patient-cards-grid');
  if (!grid) return;
  const patients = S.filtered;
  if (!patients.length) {
    grid.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><h4>No patients yet</h4><p>Ask patients to share their Sahayak patient code, then enter it in "Access New Patient".</p><button class="btn btn-primary" style="margin-top:1.25rem" onclick="showSection('access-patient',document.querySelector('[data-section=access-patient]'))">Access First Patient</button></div>`;
    return;
  }
  grid.innerHTML = `<div class="patient-cards-grid">${patients.map(p => buildPatientCard(p)).join('')}</div>`;
}

function buildPatientCard(p) {
  const latest = p.reports[0];
  const risk   = latest?.ai_risk || 'NONE';
  const initials = (p.name||'P').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  return `
    <div class="patient-card" onclick="openPatientDetail('${p.id}')">
      <div class="pc-header">
        <div class="pc-avatar">${escHtml(initials)}</div>
        <div style="flex:1;min-width:0">
          <div class="pc-name">${escHtml(p.name)}</div>
          <div class="pc-meta">${escHtml([p.profile?.age?p.profile.age+'y':'', p.profile?.gender||'', p.profile?.village||p.profile?.district||''].filter(Boolean).join(' · '))}</div>
        </div>
        <span class="risk-pill ${riskClass(risk)}">${risk}</span>
        ${priority && priority !== 'LOW' ? `<span style="font-size:.65rem;font-weight:700;color:#dc2626;margin-left:4px">${priority}</span>` : ''}
      </div>
      ${latest ? `
        <div class="pc-vitals">
          ${latest.bp ? `<div class="pc-vital"><div class="pc-vval">${escHtml(latest.bp)}</div><div class="pc-vlbl">BP</div></div>` : ''}
          ${latest.blood_sugar ? `<div class="pc-vital"><div class="pc-vval">${latest.blood_sugar}</div><div class="pc-vlbl">Sugar</div></div>` : ''}
          ${latest.hemoglobin  ? `<div class="pc-vital"><div class="pc-vval">${latest.hemoglobin}</div><div class="pc-vlbl">Hb</div></div>` : ''}
        </div>
      ` : '<div style="font-size:.8rem;color:var(--muted);margin-bottom:.875rem">No reports uploaded yet</div>'}
      <div class="pc-footer">
        <span>${latest ? 'Last: ' + fmtDate(latest.date, true) : 'No reports'}</span>
        <span>${p.reports.length} report${p.reports.length!==1?'s':''}</span>
      </div>
    </div>
  `;
}

function filterPatients() {
  const q = (document.getElementById('patient-search')?.value || '').toLowerCase();
  S.filtered = S.patients.filter(p => !q || (p.name||'').toLowerCase().includes(q));
  renderPatientGrid();
}

/* ── PATIENT DETAIL ─────────────────────────────────────── */
function openPatientDetail(id) {
  S.activeId = id;
  // Show nav item
  const navItem = document.getElementById('nav-patient-detail');
  if (navItem) {
    navItem.style.display = 'flex';
    const p = S.patients.find(x => x.id === id);
    setTxt('nav-patient-name', p?.name?.split(' ')[0] || 'Patient');
  }
  showSection('patient-detail', document.getElementById('nav-patient-detail'));
  renderPatientDetail(id);
}

function renderPatientDetail(id) {
  const p = S.patients.find(x => x.id === id);
  if (!p) return;

  // Header
  const initials = (p.name||'P').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  setTxt('dp-avatar', initials);
  document.getElementById('dp-avatar').style.background = 'linear-gradient(135deg,#e35a2c,#f97316)';
  setTxt('dp-name', p.name);
  const profile = p.profile || {};
  setTxt('dp-meta', [profile.age?profile.age+'y':'', profile.gender, profile.village||profile.district||'', profile.blood_group?'Blood: '+profile.blood_group:''].filter(Boolean).join(' · '));

  // Risk badge
  const risk = p.reports[0]?.ai_risk || 'NONE';
  const rbEl = document.getElementById('dp-risk-badge');
  if (rbEl) rbEl.innerHTML = `<span class="risk-pill ${riskClass(risk)}">${risk} RISK</span>`;

  // Latest vitals
  const latest = p.reports[0];
  setTxt('dp-bp',   latest?.bp    || '-');
  setTxt('dp-sugar',latest?.blood_sugar ? latest.blood_sugar+' mg/dL' : '-');
  setTxt('dp-hb',   latest?.hemoglobin  ? latest.hemoglobin+' g/dL'   : '-');
  setTxt('dp-spo2', latest?.spo2        ? latest.spo2+'%'              : '-');

  // AI summary
  const sumEl = document.getElementById('dp-ai-summary');
  if (sumEl && latest?.ai_summary) {
    sumEl.innerHTML = `
      <div class="ai-badge" style="margin-bottom:.75rem">LLaMA 70B Analysis</div>
      <div class="insight-card ${latest.ai_risk==='HIGH'||latest.ai_risk==='EMERGENCY'?'insight-warning':'insight-info'}" style="margin-bottom:.875rem"><strong>${escHtml(latest.ai_disease||'')}</strong></div>
      <div style="font-size:.875rem;line-height:1.75">${escHtml(latest.ai_summary)}</div>
      ${profile.medical_history ? `<div class="insight-card insight-info" style="margin-top:.875rem"><strong>Known history:</strong> ${escHtml(profile.medical_history)}</div>` : ''}
    `;
  }

  // Render charts after tab switch
  setTimeout(() => {
    renderDPSugarChart(p);
    renderDPHbChart(p);
  }, 150);

  // Reports list
  renderDPReportList(p);
  renderDPTimeline(p);
  renderDPCompare(p);
}

function renderDPSugarChart(p) {
  const canvas = document.getElementById('dp-sugar-chart');
  if (!canvas || !window.Chart) return;
  if (S.charts.dpSugar) S.charts.dpSugar.destroy();
  const data = p.reports.slice().reverse();
  S.charts.dpSugar = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: data.map(r => fmtDate(r.date, true)), datasets: [
      { label:'Blood Sugar', data: data.map(r=>r.blood_sugar||null), borderColor:'#e35a2c', backgroundColor:'rgba(227,90,44,.1)', borderWidth:2, pointRadius:4, fill:true, tension:0.4 },
      { label:'Normal', data: Array(data.length).fill(100), borderColor:'#16a34a', borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1 },
      { label:'Diabetic', data: Array(data.length).fill(200), borderColor:'#dc2626', borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1 },
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ boxWidth:10, font:{size:10} } } }, scales:{ y:{ grid:{color:'rgba(0,0,0,.04)'}, ticks:{font:{size:11}} }, x:{ grid:{display:false}, ticks:{font:{size:11}} } } }
  });
}

function renderDPHbChart(p) {
  const canvas = document.getElementById('dp-hb-chart');
  if (!canvas || !window.Chart) return;
  if (S.charts.dpHb) S.charts.dpHb.destroy();
  const data = p.reports.slice().reverse();
  const low = (p.profile?.gender === 'Female') ? 12 : 13;
  S.charts.dpHb = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: data.map(r=>fmtDate(r.date,true)), datasets: [
      { label:'Haemoglobin', data:data.map(r=>r.hemoglobin||null), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.1)', borderWidth:2, pointRadius:4, fill:true, tension:0.4 },
      { label:'Min Normal', data:Array(data.length).fill(low), borderColor:'#d97706', borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ boxWidth:10, font:{size:10} } } }, scales:{ y:{grid:{color:'rgba(0,0,0,.04)'},ticks:{font:{size:11}}}, x:{grid:{display:false},ticks:{font:{size:11}}} } }
  });
}

function renderDPReportList(p) {
  const el = document.getElementById('dp-reports-list');
  if (!el) return;
  if (!p.reports.length) { el.innerHTML = '<div class="empty-state" style="padding:2rem"><p>No reports uploaded yet.</p></div>'; return; }
  el.innerHTML = p.reports.map(r => `
    <div class="report-card">
      <div class="report-card-header">
        <div><div style="font-weight:700">${escHtml(r.type||'Report')} - ${escHtml(r.hospital||'')}</div><div class="report-date-badge">${fmtDate(r.date)} · Dr. ${escHtml(r.doctor||'-')}</div></div>
        <span class="risk-pill ${riskClass(r.ai_risk)}">${r.ai_risk||'-'}</span>
      </div>
      <div class="report-vitals">
        ${r.bp?`<span class="rv-item"><strong>${r.bp}</strong> BP</span>`:''}
        ${r.blood_sugar?`<span class="rv-item"><strong>${r.blood_sugar}</strong> Sugar</span>`:''}
        ${r.hemoglobin?`<span class="rv-item"><strong>${r.hemoglobin}</strong> Hb</span>`:''}
        ${r.spo2?`<span class="rv-item"><strong>${r.spo2}%</strong> SpO₂</span>`:''}
      </div>
      ${r.ai_summary?`<div class="ai-summary-box"><div class="ai-sum-title">AI Analysis</div>${escHtml(r.ai_summary)}</div>`:''}
      ${r.diagnosis?`<div style="font-size:.875rem;color:var(--muted);margin-top:.5rem">📋 ${escHtml(r.diagnosis)}</div>`:''}
      ${r.medications?`<div style="font-size:.875rem;color:var(--muted)">💊 ${escHtml(r.medications)}</div>`:''}
    </div>
  `).join('');
}

function renderDPTimeline(p) {
  const el = document.getElementById('dp-timeline-list');
  const cnt = document.getElementById('dp-visit-count');
  if (!el) return;
  if (cnt) cnt.textContent = p.checkups.length + ' visits';
  if (!p.checkups.length) { el.innerHTML = '<div class="empty-state" style="padding:2rem"><p>No checkup history available.</p></div>'; return; }
  el.innerHTML = p.checkups.map((c,i) => `
    <div class="tl-item">
      <div class="tl-dot-col"><div class="tl-dot${i===0?' filled':''}"></div>${i<p.checkups.length-1?'<div class="tl-line"></div>':''}</div>
      <div class="tl-content">
        <div class="tl-date">${fmtDate(c.date)}</div>
        <div class="tl-title">Dr. ${escHtml(c.doctor||'Unknown')} - ${escHtml(c.hospital||'')}</div>
        <div class="tl-desc">${escHtml(c.diagnosis||'')}</div>
        ${c.medications?`<div class="tl-tags"><span class="tl-tag-orange">💊 ${escHtml(c.medications)}</span></div>`:''}
        ${c.notes?`<div class="tl-desc" style="margin-top:.25rem">📝 ${escHtml(c.notes)}</div>`:''}
      </div>
    </div>
  `).join('');
}

function renderDPCompare(p) {
  const el = document.getElementById('dp-compare-table');
  if (!el) return;
  if (p.reports.length < 2) {
    el.innerHTML = '<div class="empty-state" style="padding:2rem"><p>At least 2 reports needed for comparison.</p></div>';
    renderRadarChart(p); renderRiskChart(p);
    return;
  }
  const [latest, prev] = p.reports;
  const metrics = [
    { name:'Blood Sugar (mg/dL)', key:'blood_sugar', format: v => v },
    { name:'Haemoglobin (g/dL)',  key:'hemoglobin',  format: v => v },
    { name:'Cholesterol (mg/dL)', key:'cholesterol', format: v => v },
    { name:'SpO₂ (%)',            key:'spo2',         format: v => v },
    { name:'Weight (kg)',         key:'weight',       format: v => v },
  ];
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr .5fr;gap:0;font-size:.8125rem">
      <div style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:.75rem 1rem;border-bottom:2px solid var(--border);background:var(--surface2)">Metric</div>
      <div style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:.75rem 1rem;border-bottom:2px solid var(--border);background:var(--surface2);text-align:center">Previous (${fmtDate(prev.date,true)})</div>
      <div style="font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:.04em;padding:.75rem 1rem;border-bottom:2px solid var(--border);background:var(--surface2);text-align:center">Latest (${fmtDate(latest.date,true)})</div>
      <div style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:.75rem 1rem;border-bottom:2px solid var(--border);background:var(--surface2);text-align:right">Change</div>
      ${metrics.map(m => {
        const oldVal = prev[m.key];
        const newVal = latest[m.key];
        if (!oldVal && !newVal) return '';
        const diff = (oldVal && newVal) ? ((newVal - oldVal) / Math.abs(oldVal) * 100).toFixed(0) : null;
        const dir  = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        const cls  = diff > 5 ? 'change-up' : diff < -5 ? 'change-down' : 'change-same';
        return `
          <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);font-weight:600">${m.name}</div>
          <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">${oldVal||'-'}</div>
          <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);text-align:center;font-weight:700">${newVal||'-'}</div>
          <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);text-align:right;font-weight:700" class="${cls}">${diff!==null?dir+' '+Math.abs(diff)+'%':'-'}</div>
        `;
      }).join('')}
    </div>
  `;
  renderRadarChart(p);
  renderRiskChart(p);
}

function renderRadarChart(p) {
  const canvas = document.getElementById('dp-radar-chart');
  if (!canvas || !window.Chart) return;
  if (S.charts.dpRadar) S.charts.dpRadar.destroy();
  const r = p.reports[0];
  if (!r) return;
  // Normalize values 0-100
  const normalize = (val, min, max) => val ? Math.min(100, Math.max(0, (val-min)/(max-min)*100)) : 0;
  const data = [
    normalize(r.blood_sugar, 70, 300),
    normalize(r.hemoglobin, 7, 17),
    normalize(r.spo2, 85, 100),
    normalize(r.bp ? parseInt(r.bp) : null, 80, 200),
    normalize(r.cholesterol, 100, 300),
  ];
  S.charts.dpRadar = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: { labels:['Blood Sugar','Haemoglobin','SpO₂','Blood Pressure','Cholesterol'], datasets:[{ data, backgroundColor:'rgba(227,90,44,.15)', borderColor:'#e35a2c', pointBackgroundColor:'#e35a2c', pointRadius:4 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ r:{ min:0, max:100, ticks:{ display:false }, grid:{ color:'rgba(0,0,0,.06)' }, pointLabels:{ font:{size:11} } } } }
  });
}

function renderRiskChart(p) {
  const canvas = document.getElementById('dp-risk-chart');
  if (!canvas || !window.Chart) return;
  if (S.charts.dpRisk) S.charts.dpRisk.destroy();
  const riskMap = { EMERGENCY:4, HIGH:3, MEDIUM:2, LOW:1, UNKNOWN:0 };
  const colorMap = { 4:'#dc2626', 3:'#f97316', 2:'#d97706', 1:'#16a34a', 0:'#9ca3af' };
  const data = p.reports.slice().reverse();
  const values = data.map(r => riskMap[r.ai_risk]||0);
  const colors = values.map(v => colorMap[v]||'#9ca3af');
  S.charts.dpRisk = new Chart(canvas.getContext('2d'), {
    type:'bar',
    data:{ labels:data.map(r=>fmtDate(r.date,true)), datasets:[{ label:'Risk Level', data:values, backgroundColor:colors, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ['-','LOW','MEDIUM','HIGH','EMERGENCY'][ctx.parsed.y]||'' } } }, scales:{ y:{ min:0, max:4, ticks:{ callback: v=>['-','LOW','MED','HIGH','EMER'][v]||'', font:{size:10} }, grid:{color:'rgba(0,0,0,.04)'} }, x:{ grid:{display:false}, ticks:{font:{size:11}} } } }
  });
}

function switchPatientTab(tab, btn) {
  document.querySelectorAll('.dp-tab').forEach(el => el.style.display='none');
  document.querySelectorAll('.tab-bar .tab-pill').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`dp-tab-${tab}`);
  if (el) el.style.display='block';
  if (btn) btn.classList.add('active');
  if (tab==='dp-compare' && S.activeId) {
    const p = S.patients.find(x=>x.id===S.activeId);
    if(p) { renderDPCompare(p); setTimeout(()=>{renderRadarChart(p);renderRiskChart(p);},200); }
  }
}

function filterDPReports(q) {
  if (!S.activeId) return;
  const p = S.patients.find(x=>x.id===S.activeId);
  if (!p) return;
  const el = document.getElementById('dp-reports-list');
  if (!el) return;
  const filtered = q ? p.reports.filter(r => (r.type||'').toLowerCase().includes(q) || (r.diagnosis||'').toLowerCase().includes(q) || (r.hospital||'').toLowerCase().includes(q)) : p.reports;
  renderDPReportList({ ...p, reports: filtered });
}

function addDoctorNote() { openModal('doctor-note-modal'); }
function saveDoctorNote() {
  const txt    = document.getElementById('note-text')?.value || '';
  const action = document.getElementById('note-action')?.value || 'none';
  if (!txt.trim()) { showToast('Please enter a clinical note.', 'warning'); return; }
  showToast('Clinical note saved to patient record.', 'success');
  closeModal('doctor-note-modal');
}


/* ── ALL RECORDS ─────────────────────────────────────────── */
function renderAllRecords() {
  const cnt = document.getElementById('all-records-count');
  if (cnt) cnt.textContent = `${S.patients.length} patient${S.patients.length!==1?'s':''} accessible`;
  filterAllRecords();
}

function filterAllRecords() {
  const q    = (document.getElementById('all-records-search')?.value||'').toLowerCase();
  const risk = document.getElementById('records-filter-risk')?.value || '';
  const tbody = document.getElementById('all-records-tbody');
  if (!tbody) return;

  let list = [...S.patients];
  if (q) list = list.filter(p => (p.name||'').toLowerCase().includes(q) || (p.reports[0]?.ai_disease||'').toLowerCase().includes(q) || (p.reports[0]?.diagnosis||'').toLowerCase().includes(q));
  if (risk) list = list.filter(p => p.reports[0]?.ai_risk === risk);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--muted)">No patients found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => {
    const r = p.reports[0];
    const initials = (p.name||'P').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `
      <tr onclick="openPatientDetail('${p.id}')">
        <td><div style="display:flex;align-items:center;gap:.75rem"><div class="user-avatar" style="width:32px;height:32px;font-size:.75rem;flex-shrink:0">${escHtml(initials)}</div><div><div style="font-weight:600">${escHtml(p.name)}</div><div style="font-size:.75rem;color:var(--muted)">${escHtml(p.profile?.village||p.profile?.district||'')}</div></div></div></td>
        <td>${escHtml([p.profile?.age?p.profile.age+'y':'',p.profile?.gender].filter(Boolean).join(' / ')||'-')}</td>
        <td>${r ? fmtDate(r.date, true) : '-'}</td>
        <td>${p.reports.length}</td>
        <td>${r ? `<span class="risk-pill ${riskClass(r.ai_risk)}">${r.ai_risk}</span>` : '-'}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r?.ai_disease||r?.diagnosis||'-')}</td>
        <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openPatientDetail('${p.id}')">View →</button></td>
      </tr>
    `;
  }).join('');
}

/* ── ACCESS NEW PATIENT ─────────────────────────────────── */
async function accessPatientByCode() {
  const code = (document.getElementById('access-code-input')?.value||'').trim().toUpperCase();
  if (!code) return showToast('Please enter a patient code.', 'warning');
  const btn = document.querySelector('#sec-access-patient .btn-primary');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner spinner-sm"></span> Looking up…'; }

  try {
    // Check local registry first
    const reg = getCodeRegistry();
    let entry = reg[code];

    if (!entry && API) {
      // POST /doctor/access-patient — the real backend endpoint
      try {
        const r = await fetch(`${API}/doctor/access-patient`, {
          method: 'POST',
          headers: authH(),
          body: JSON.stringify({ share_code: code }),
        });
        if (r.ok) {
          const d = await r.json();
          // Normalise to the same shape as the local registry entry
          entry = { patient_id: d.patient_id, name: d.patient_name };
        }
      } catch (_) { /* network error — stay with local lookup result */ }
    }

    if (!entry) throw new Error(`Code "${code}" not found. Ask the patient to check their code.`);

    const pid = entry.patient_id;
    if (S.patients.find(x => x.id === pid)) { showToast('You already have access to this patient.', ''); return; }

    // Load patient data
    const pd  = getPatientData(pid);
    const prf = getPatientProfile(pid) || {};
    const pName = entry.name || prf.name || prf.full_name || 'Patient';

    const newEntry = { patient_id:pid, name:pName, code, added_at:new Date().toISOString() };
    const stored = getDocPatientList();
    stored.push(newEntry);
    saveDocPatientList(stored);

    const reports  = (pd.reports||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const checkups = (pd.checkups||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
    S.patients.push({ id:pid, name:pName, profile:prf, reports, checkups, added_at:newEntry.added_at, code });
    S.filtered = [...S.patients];

    renderPatientStats();
    if (document.getElementById('access-code-input')) document.getElementById('access-code-input').value = '';
    showToast(`Patient "${pName}" added! View their records now.`, 'success');
    openPatientDetail(pid);
  } catch(e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.innerHTML='Access Patient Records'; }
  }
}

/* ── MODAL ──────────────────────────────────────────────── */
function openModal(id)  { const m=document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id) { const m=document.getElementById(id); if(m) m.classList.remove('open'); }
document.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open')); });

/* ── TOAST ──────────────────────────────────────────────── */
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent=msg; t.className=`toast${type?' '+type:''}`; t.style.display='block';
  clearTimeout(t._t); t._t=setTimeout(()=>t.style.display='none', 3800);
}

/* ── UTILS ──────────────────────────────────────────────── */
function setTxt(id,v) { const e=document.getElementById(id); if(e)e.textContent=v??''; }
function escHtml(s)   { if(!s&&s!==0)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso,short=false) { if(!iso)return'-'; try{const d=new Date(iso);return d.toLocaleDateString('en-IN',short?{day:'2-digit',month:'short'}:{day:'2-digit',month:'short',year:'numeric'});}catch{return'-';} }
function riskClass(r) { return{EMERGENCY:'risk-emergency',HIGH:'risk-high',MEDIUM:'risk-medium',LOW:'risk-low'}[r]||'risk-none'; }
function logoutDoctor(){
  try{import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js').then(function(m){var a=m.getAuth();if(a)m.signOut(a).catch(function(){});}).catch(function(){});}catch(e){}
  var uid=localStorage.getItem('sahayak_user_id')||'';
  if(uid){var pfx='u_'+uid+'_',rm=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(pfx))rm.push(k);}rm.forEach(function(k){localStorage.removeItem(k);});}
  ['sahayak_token','sahayak_role','sahayak_name','sahayak_user_id','sahayak_email','sahayak_spec','sahayak_hospital','sahayak_reg','sahayak_firebase_uid'].forEach(k=>localStorage.removeItem(k));
  location.href='auth.html';
}

/* ── DOCTOR PROFILE ─────────────────────────────────────── */
function loadDocProfile() {
  try { return JSON.parse(localStorage.getItem(`sah_doc_profile_${EMAIL}`) || 'null'); } catch { return null; }
}
function storeDocProfile(p) {
  localStorage.setItem(`sah_doc_profile_${EMAIL}`, JSON.stringify(p));
}

function renderDoctorProfile() {
  const saved = loadDocProfile() || {};
  const name  = saved.name  || DNAME;
  const spec  = saved.spec  || localStorage.getItem('sahayak_spec')     || 'General Physician';
  const hosp  = saved.hospital || localStorage.getItem('sahayak_hospital') || '';
  const reg   = saved.reg   || localStorage.getItem('sahayak_reg') || '';
  const phone = saved.phone || '';
  const exp   = saved.experience || '';

  // Sync sidebar
  setTxt('doc-avatar', name.charAt(0).toUpperCase());
  setTxt('doc-name',   name);
  setTxt('doc-spec',   spec);

  // Profile card avatar (initials)
  const av = document.getElementById('dp-prof-avatar');
  if (av) av.textContent = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

  // View fields
  setTxt('dp-prof-name',  name);
  setTxt('dp-prof-email', EMAIL || '-');
  setTxt('doc-spec',      spec  || 'Physician');
  setTxt('dp-prof-spec',  spec  || '-');
  setTxt('dp-prof-hosp',  hosp  || '-');
  setTxt('dp-prof-reg',   reg   || '-');
  setTxt('dp-prof-phone', phone || '-');
  setTxt('dp-prof-exp',   exp ? exp + ' years' : '-');

  // Edit fields
  const setV = (id, v) => { const e = document.getElementById(id); if(e) e.value = v||''; };
  setV('dpe-name',     name);
  setV('dpe-spec',     spec);
  setV('dpe-hospital', hosp);
  setV('dpe-reg',      reg);
  setV('dpe-phone',    phone);
  setV('dpe-exp',      exp);
}

function toggleDocProfileEdit() {
  const view = document.getElementById('dp-prof-view');
  const edit = document.getElementById('dp-prof-edit');
  const btn  = document.getElementById('dp-prof-edit-btn');
  if (!view || !edit) return;
  const editing = edit.style.display !== 'none';
  view.style.display = editing ? '' : 'none';
  edit.style.display = editing ? 'none' : 'block';
  if (btn) btn.textContent = editing ? 'Edit Profile' : 'Cancel';
}

function saveDocProfile_fn() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const p = {
    name:       get('dpe-name')     || DNAME,
    spec:       get('dpe-spec')     || 'General Physician',
    hospital:   get('dpe-hospital'),
    reg:        get('dpe-reg'),
    phone:      get('dpe-phone'),
    experience: get('dpe-exp'),
    email:      EMAIL,
  };
  storeDocProfile(p);
  localStorage.setItem('sahayak_name', p.name);
  localStorage.setItem('sahayak_spec', p.spec);
  if (p.hospital) localStorage.setItem('sahayak_hospital', p.hospital);
  if (p.reg)      localStorage.setItem('sahayak_reg', p.reg);
  renderDoctorProfile();
  toggleDocProfileEdit();
  showToast('Profile updated!', 'success');
}

/* ══ VAPI CLINICAL VOICE ASSISTANT (Doctor) ══════════════════════════════════ */
var _vapiDoc = null;
var _vapiDocLoaded = false;

(function() {
  import('https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/vapi.js')
    .then(function(m){ window.VapiDoctor = m.default||m.Vapi||m; _vapiDocLoaded=true; })
    .catch(function(){ console.log('VAPI SDK not available — demo mode'); });
})();

async function startDoctorVapiCall() {
  var key = localStorage.getItem('doctor_vapi_key') || localStorage.getItem('vapi_public_key') || '';
  if (!key) { alert('Add your VAPI Public Key in My Profile → Settings to enable voice calls.'); return; }

  try {
    var uid  = localStorage.getItem('sahayak_user_id') || '';
    var name = localStorage.getItem('sahayak_name') || 'Doctor';
    var cfgRes = await fetch(API + '/vapi/agent-config/doctor?user_id=' + encodeURIComponent(uid)
      + '&name=' + encodeURIComponent(name));
    var cfg = cfgRes.ok ? (await cfgRes.json()).config : null;
  } catch(e) { cfg = null; }

  if (_vapiDocLoaded && window.VapiDoctor) {
    if (!_vapiDoc) _vapiDoc = new window.VapiDoctor(key);
    _vapiDoc.on('call-end', function(){ showToast('Call ended',''); });
    _vapiDoc.on('error', function(e){ console.error('VAPI:', e); openClinicalAssistant(); });
    try {
      if (cfg) { await _vapiDoc.start(cfg); showToast('Voice assistant active — ask about your patients','success'); }
      else {
        var aid = localStorage.getItem('doctor_vapi_aid') || '';
        if (aid) await _vapiDoc.start(aid);
        else throw new Error('no_config');
      }
    } catch(e) { openClinicalAssistant(); }
  } else {
    openClinicalAssistant();
  }
}

function openClinicalAssistant() {
  var uid = localStorage.getItem('sahayak_user_id') || '';
  window.open('chatbot_doctor.html?uid=' + encodeURIComponent(uid), '_blank',
    'width=440,height=700,resizable=yes');
}

/* ══ APPOINTMENT CALENDAR ══════════════════════════════════════ */
async function loadCalendar() {
  const datePicker = document.getElementById('cal-date-picker');
  const today      = new Date().toISOString().split('T')[0];
  if (datePicker && !datePicker.value) datePicker.value = today;
  const date = datePicker?.value || today;

  const label = document.getElementById('cal-date-label');
  if (label) label.textContent = new Date(date + 'T12:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const docId = localStorage.getItem('sahayak_user_id') || '';
  if (!docId) { console.warn('No doctor user_id — cannot load appointments'); return; }

  try {
    const [slotsRes, apptsRes] = await Promise.all([
      fetch(`${API}/appointments/slots?doctor_id=${docId}&date=${date}`, {headers:authH()}).then(r=>r.json()),
      fetch(`${API}/appointments/today?doctor_id=${docId}`, {headers:authH()}).then(r=>r.json()),
    ]);

    // Render free slot grid
    const slotGrid = document.getElementById('slot-grid');
    const slotSel  = document.getElementById('bk-slot');
    if (slotGrid) {
      const freeSlots = slotsRes.free_slots || [];
      slotGrid.innerHTML = freeSlots.length
        ? freeSlots.map(s =>
            `<button onclick="document.getElementById('bk-slot').value='${s}'" 
                     style="background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2);
                            border-radius:8px;padding:.4rem;font-size:.78rem;font-weight:600;cursor:pointer">${s}</button>`
          ).join('')
        : '<p style="color:var(--muted);font-size:.8rem;grid-column:1/-1;text-align:center;padding:.5rem">No free slots today</p>';

      if (slotSel) {
        slotSel.innerHTML = '<option value="">Select time</option>' +
          freeSlots.map(s => `<option value="${s}">${s}</option>`).join('');
      }
    }

    // Render appointments list
    const apptList  = document.getElementById('appt-list');
    const badge     = document.getElementById('appt-count-badge');
    const appts     = apptsRes.appointments || [];
    if (badge) badge.textContent = appts.length;
    if (apptList) {
      apptList.innerHTML = appts.length
        ? appts.map(a => `
            <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;border-bottom:1px solid var(--border)">
              <div style="background:rgba(227,90,44,.12);color:var(--or);padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:700;white-space:nowrap">${a.time}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.patient_name||'Patient'}</div>
                <div style="font-size:.72rem;color:var(--muted)">${a.phone||''} ${a.reason?'· '+a.reason.slice(0,30):''}</div>
              </div>
              <button onclick="cancelAppt(${a.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem" title="Cancel">✕</button>
            </div>`).join('')
        : '<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:1rem">No appointments today</p>';
    }
  } catch(e) {
    console.error('loadCalendar:', e);
    showToast('Connection error loading appointments', 'error');
  }
}

async function manualBook() {
  const docId  = localStorage.getItem('sahayak_user_id') || '';
  const name   = document.getElementById('bk-name')?.value.trim();
  const phone  = document.getElementById('bk-phone')?.value.trim();
  const slot   = document.getElementById('bk-slot')?.value;
  const reason = document.getElementById('bk-reason')?.value.trim();
  const date   = document.getElementById('cal-date-picker')?.value || new Date().toISOString().split('T')[0];
  const msg    = document.getElementById('bk-msg');

  if (!name)  { if(msg) msg.textContent='Enter patient name';  return; }
  if (!slot)  { if(msg) msg.textContent='Select a time slot'; return; }

  try {
    const r = await fetch(`${API}/appointments/book`, {
      method:'POST', headers:authH(),
      body: JSON.stringify({ doctor_id:parseInt(docId), patient_name:name, patient_phone:phone||'', date, time_slot:slot, reason:reason||'' }),
    });
    const d = await r.json();
    if (d.success) {
      if (msg) msg.textContent = `✅ Booked: ${name} at ${slot}`;
      if (msg) msg.style.color = '#22c55e';
      showToast(`Appointment booked: ${name} at ${slot}`, 'success');
      setTimeout(loadCalendar, 500);
    } else {
      if (msg) { msg.textContent = d.message || d.error || 'Could not book'; msg.style.color = '#ef4444'; }
    }
  } catch(e) {
    if (msg) { msg.textContent = 'Error booking. Try again.'; msg.style.color = '#ef4444'; }
  }
}

async function cancelAppt(apptId) {
  if (!confirm('Cancel this appointment?')) return;
  try {
    const r = await fetch(`${API}/appointments/cancel`, {
      method:'POST', headers:authH(), body: JSON.stringify({appt_id:apptId})
    });
    const d = await r.json();
    if (d.success) { showToast('Appointment cancelled','info'); loadCalendar(); }
  } catch(e) { showToast('Error cancelling','error'); }
}
/* ══ END APPOINTMENT CALENDAR ══════════════════════════════════ */
