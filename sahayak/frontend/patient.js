/**
 * Sahayak AI -- Patient Portal  (complete rewrite)
 * localStorage-first. 100% offline. All sections auto-refresh after every report save.
 * Rules: no em-dashes in strings, ES5 var/function, Chart.js scales inside options.
 */

var API   = 'http://localhost:8000';
var TOKEN = localStorage.getItem('sahayak_token');
var PID   = localStorage.getItem('sahayak_patient_id');
var PNAME = localStorage.getItem('sahayak_name') || 'Patient';
var EMAIL = localStorage.getItem('sahayak_email') || '';
var UID   = localStorage.getItem('sahayak_user_id') || PID || 'guest';
var FID   = localStorage.getItem('sahayak_firebase_uid') || '';

/* Auth header helper — sends Bearer token with every API call */
function authH() {
  var tok = TOKEN || localStorage.getItem('sahayak_token') || '';
  return tok
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }
    : { 'Content-Type': 'application/json' };
}

if (!TOKEN) { window.location.href = 'auth.html'; }

/* ── Per-user storage namespace ────────────────────────────────────────────
 * Every data key is prefixed with the user's unique ID so users never
 * see each other's data even if they share the same browser.
 * Falls back to the global getUserKey() from offline_sync.js if loaded.
 */
function _uk(key) {
  return typeof getUserKey === 'function'
    ? getUserKey(key)
    : ('u_' + UID + '_' + key);
}

var S = { profile: null, reports: [], checkups: [], shareCode: null, charts: {} };


/* ── Field reader: handles both camelCase and snake_case naming from seed/form ── */
function rf(obj, camel, snake) {
  if(!obj) return '';
  var v = obj[camel];
  if(v !== undefined && v !== null && v !== '') return v;
  if(snake) { v = obj[snake]; if(v !== undefined && v !== null && v !== '') return v; }
  return '';
}
function rfn(obj, camel, snake) {
  var v = rf(obj, camel, snake);
  return v ? Number(v) : null;
}

function $(id) { return document.getElementById(id); }
function setText(id, val) { var el=$(id); if(el) el.textContent=val; }

function showToast(msg, type) {
  var t=$('toast'); if(!t) return;
  t.textContent=msg; t.className='toast '+(type||'success'); t.style.display='block';
  setTimeout(function(){ t.style.display='none'; },3500);
}
function authH(){ return {'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}; }
function fmtDate(d){
  if(!d) return '--';
  var dt=new Date(d); if(isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function daysAgo(d){ if(!d) return 999; return Math.floor((Date.now()-new Date(d).getTime())/86400000); }
function uid(){ return 'r_'+Date.now()+'_'+Math.floor(Math.random()*9999); }


/* ── Data ──────────────────────────────────────────────── */
function loadData() {
  // Per-user namespaced key — new users always start with empty data
  var raw=localStorage.getItem(_uk('data'))||localStorage.getItem('sah_patient_'+PID);
  if(raw){ try{ var p=JSON.parse(raw); S.reports=p.reports||[]; S.checkups=p.checkups||[]; }catch(e){ S.reports=[]; S.checkups=[]; } }
  var prof=localStorage.getItem(_uk('profile'))||localStorage.getItem('sah_profile_'+PID);
  if(prof){ try{ S.profile=JSON.parse(prof); }catch(e){} }
}
function saveData(){
  localStorage.setItem(_uk('data'),JSON.stringify({reports:S.reports,checkups:S.checkups}));
}

/* ── Navigation ───────────────────────────────────────── */
var PAGE_TITLES={
  dashboard:  ['Dashboard',         'Your complete health overview'],
  information:['My Information',    'Personal profile and medical history'],
  upload:     ['Upload Reports',    'Add blood tests, X-rays and more'],
  reports:    ['AI Health Reports', 'AI-analysed clinical summaries'],
  records:    ['Checkup Records',   'Timeline of all your visits'],
  diagnosis:  ['Quick Diagnosis',   'Describe symptoms for ICMR-based triage'],
  share:      ['Share with Doctor', 'Give your doctor secure access to your records']
};

function showSection(id, navEl) {
  var sections=document.querySelectorAll('.section-view');
  for(var i=0;i<sections.length;i++) sections[i].classList.remove('active');
  var navItems=document.querySelectorAll('.nav-item');
  for(var j=0;j<navItems.length;j++) navItems[j].classList.remove('active');
  var target=$('sec-'+id);
  if(target) target.classList.add('active');
  if(navEl)  navEl.classList.add('active');
  var titles=PAGE_TITLES[id]||[id,''];
  setText('page-title',titles[0]); setText('page-sub',titles[1]);
  if(id==='dashboard')    renderDashboard();
  if(id==='information')  populateProfileFields();
  if(id==='reports')    { renderReportList(); renderReportCharts(); }
  if(id==='records')      renderCheckups();
  if(id==='share')        renderShareSection();
}

function refreshAllSections() {
  loadData();
  renderDashboard();
  renderReportList();
  renderReportCharts();
  renderCheckups();
  renderShareSection();
  populateProfileFields();
  updateNavBadges();
}

function updateNavBadges() {
  var b=$('reports-count'); if(!b) return;
  if(S.reports.length>0){ b.textContent=S.reports.length; b.style.display='inline-block'; }
  else b.style.display='none';
}


/* ══ DASHBOARD ════════════════════════════════════════════ */
function computeHealthScore() {
  if(!S.reports.length) return null;
  var r=S.reports[S.reports.length-1];
  var risk=rf(r,"aiRisk","ai_risk")||computeLocalRisk(r);
  if(risk==='EMERGENCY') return 20;
  if(risk==='HIGH')      return 45;
  if(risk==='MEDIUM')    return 70;
  return 88;
}

function renderDashboard() {
  loadData();
  var score=computeHealthScore();
  setText('sc-health-val', score!==null?score:'--');
  setText('sc-reports-val', S.reports.length);
  var docVisits=S.reports.filter(function(r){ return r.doctor&&r.doctor.trim(); }).length;
  setText('sc-checkups-val', docVisits);
  var nextDate='--';
  for(var i=S.reports.length-1;i>=0;i--){ if(S.reports[i].nextDate){ nextDate=fmtDate(S.reports[i].nextDate); break; } }
  setText('sc-next-val', nextDate);
  var initials=(S.profile&&S.profile.name)?S.profile.name.charAt(0).toUpperCase():PNAME.charAt(0).toUpperCase();
  setText('sidebar-name', (S.profile&&S.profile.name)||PNAME);
  setText('sidebar-avatar', initials);
  renderLatestVitals();
  renderTrendChart();
  renderDashInsights();
  renderDashRecentReports();
}

function setVitalClass(id,cls){ var el=$(id); if(el) el.className='vital-status '+cls; }

function renderLatestVitals() {
  if(!S.reports.length) {
    setText('vitals-date','No reports yet');
    setText('v-bp','--'); setText('v-sugar','--'); setText('v-hb','--'); setText('v-spo2','--');
    setText('v-bp-s',''); setText('v-sugar-s',''); setText('v-hb-s',''); setText('v-spo2-s','');
    return;
  }
  var r=S.reports[S.reports.length-1];
  setText('vitals-date','From latest report on '+fmtDate(r.date));
  if(r.bp){
    setText('v-bp',r.bp);
    var sys=parseInt((r.bp+'').split('/')[0],10);
    setText('v-bp-s', sys>=140?'High':sys>=130?'Elevated':'Normal');
    setVitalClass('v-bp-s', sys>=140?'vital-high':sys>=130?'vital-low':'vital-normal');
  }
  if(rf(r,"sugar","blood_sugar")){
    setText('v-sugar',rf(r,"sugar","blood_sugar")+' mg/dL');
    var sg=Number(rf(r,"sugar","blood_sugar"));
    setText('v-sugar-s', sg>=200?'Diabetic':sg>=100?'Pre-Diabetic':'Normal');
    setVitalClass('v-sugar-s', sg>=200?'vital-high':sg>=100?'vital-low':'vital-normal');
  }
  if(rf(r,"hb","hemoglobin")){
    setText('v-hb',rf(r,"hb","hemoglobin")+' g/dL');
    var hb=Number(rf(r,"hb","hemoglobin"));
    var gender=(S.profile&&S.profile.gender)?S.profile.gender.toLowerCase():'male';
    var hbLow=gender==='female'?12:13;
    setText('v-hb-s', hb<hbLow?(hb<10?'Severe Anaemia':'Anaemia'):'Normal');
    setVitalClass('v-hb-s', hb<hbLow?(hb<10?'vital-critical':'vital-high'):'vital-normal');
  }
  if(r.spo2){
    setText('v-spo2',r.spo2+'%');
    var sp=Number(r.spo2);
    setText('v-spo2-s', sp<90?'Critical':sp<95?'Low':'Normal');
    setVitalClass('v-spo2-s', sp<90?'vital-critical':sp<95?'vital-low':'vital-normal');
  }
}

function renderTrendChart() { buildTrendLine(($('trend-metric-sel')||{}).value||'sugar'); }
function switchTrendMetric() { renderTrendChart(); }

function buildTrendLine(metric) {
  var last6=S.reports.slice(-6);
  var labels=last6.map(function(r){ return fmtDate(r.date).split(' ').slice(0,2).join(' '); });
  var values,label,color;
  if(metric==='sugar'){
    values=last6.map(function(r){ return rf(r,"sugar","blood_sugar")?Number(rf(r,"sugar","blood_sugar")):null; });
    label='Blood Sugar (mg/dL)'; color='#e35a2c';
  } else if(metric==='bp'){
    values=last6.map(function(r){ return r.bp?parseInt((r.bp+'').split('/')[0],10):null; });
    label='Systolic BP (mmHg)'; color='#3b82f6';
  } else {
    values=last6.map(function(r){ return rf(r,"hb","hemoglobin")?Number(rf(r,"hb","hemoglobin")):null; });
    label='Haemoglobin (g/dL)'; color='#16a34a';
  }
  var ctx=$('trend-chart'); if(!ctx) return;
  if(S.charts.trend){ S.charts.trend.destroy(); S.charts.trend=null; }
  if(!last6.length||values.every(function(v){ return v===null; })) return;
  S.charts.trend=new Chart(ctx,{
    type:'line',
    data:{ labels:labels, datasets:[{ label:label, data:values, borderColor:color,
      backgroundColor:color+'20', tension:0.4, fill:true, pointBackgroundColor:color, pointRadius:5,
      spanGaps:true }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{display:false}, ticks:{font:{size:11}} },
               y:{ grid:{color:'rgba(0,0,0,.06)'}, ticks:{font:{size:11}} } } }
  });
}

function renderDashInsights() {
  var el=$('dash-insights'); if(!el) return;
  var latest=S.reports.length?S.reports[S.reports.length-1]:null;
  if(!latest||!latest.aiSummary){
    el.innerHTML='<div class="empty-state" style="padding:2rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><h4>No analysis yet</h4><p>Upload a report and run AI analysis to see insights here.</p></div>';
    return;
  }
  var risk=latest.aiRisk||computeLocalRisk(latest);
  var rc=risk==='EMERGENCY'?'insight-urgent':risk==='HIGH'?'insight-warning':'insight-good';
  var disease=latest.aiDisease||guessDisease(latest);
  el.innerHTML='<div class="insight-card '+rc+'" style="margin-bottom:.75rem"><strong>Risk: '+risk+'</strong>'+(disease?' - '+disease:'')+'</div>'
    +'<div style="font-size:.82rem;line-height:1.7;color:var(--text);white-space:pre-wrap">'+(latest.aiSummary||'').slice(0,400)+(latest.aiSummary&&latest.aiSummary.length>400?'...':'')+'</div>';
}

function renderDashRecentReports() {
  var el=$('dash-recent-reports'); if(!el) return;
  if(!S.reports.length){
    el.innerHTML='<div class="empty-state" style="padding:2rem"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h4>No reports yet</h4><p>Upload blood tests, X-rays, or any health report to get started.</p></div>';
    return;
  }
  var last3=S.reports.slice(-3).reverse();
  var html='';
  for(var i=0;i<last3.length;i++){
    var r=last3[i]; var risk=rf(r,"aiRisk","ai_risk")||computeLocalRisk(r);
    html+='<div style="display:flex;align-items:center;gap:.875rem;padding:.75rem 0;border-bottom:1px solid var(--border)">'
      +'<div style="width:36px;height:36px;background:var(--pale);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg></div>'
      +'<div style="flex:1"><div style="font-size:.875rem;font-weight:600">'+(r.type||'Report')+'</div>'
      +'<div style="font-size:.775rem;color:var(--muted)">'+fmtDate(r.date)+(r.hospital?' - '+r.hospital:'')+'</div></div>'
      +'<span class="risk-pill risk-'+risk.toLowerCase()+'">'+risk+'</span></div>';
  }
  el.innerHTML=html;
}


/* ══ MY INFORMATION ═══════════════════════════════════════ */
function populateProfileFields() {
  loadData();
  var p=S.profile||{};
  var name=rf(p,"name","full_name")||PNAME||'--';
  var initials=name.charAt(0).toUpperCase();
  setText('pv-init',initials); setText('pv-name',name);
  setText('sidebar-name',name); setText('sidebar-avatar',initials);
  var ageParts=[];
  if(p.age) ageParts.push(p.age+' yrs');
  if(p.gender) ageParts.push(p.gender);
  setText('pv-age',ageParts.join(', ')||'--');
  setText('pv-phone',p.phone||'--');
  setText('pv-village',[p.village,p.district].filter(Boolean).join(', ')||'--');
  setText('pv-blood',rf(p,"bloodGroup","blood_group")||'--');
  setText('pv-history',rf(p,"history","medical_history")||'No prior conditions recorded.');
  var score=computeHealthScore();
  setText('psum-reports',S.reports.length);
  setText('psum-visits',S.reports.filter(function(r){ return r.doctor&&r.doctor.trim(); }).length);
  setText('psum-score',score!==null?score:'--');
  var setVal=function(id,val){ var el=$(id); if(el) el.value=val||''; };
  setVal('pe-name',rf(p,"name","full_name")); setVal('pe-age',p.age); setVal('pe-gender',p.gender);
  setVal('pe-phone',p.phone); setVal('pe-blood',rf(p,"bloodGroup","blood_group"));
  setVal('pe-village',p.village); setVal('pe-district',p.district); setVal('pe-history',rf(p,"history","medical_history"));
}

function toggleEditProfile() {
  var view=$('profile-view'); var edit=$('profile-edit'); var btn=$('edit-profile-btn');
  if(!view||!edit) return;
  var isEditing=edit.style.display!=='none';
  view.style.display=isEditing?'grid':'none';
  edit.style.display=isEditing?'none':'block';
  if(btn) btn.textContent=isEditing?'Edit Profile':'Cancel';
  if(!isEditing) populateProfileFields();
}

function saveProfile_fn() {
  var getVal=function(id){ var el=$(id); return el?el.value.trim():''; };
  var phone = getVal('pe-phone');
  // Validate phone — warn if missing (needed for VAPI calls)
  if (!phone) {
    var proceed = confirm('⚠️ No phone number entered.\nVAPI voice calls require a phone number.\nSave anyway?');
    if (!proceed) return;
  }
  var p={ name:getVal('pe-name'), age:getVal('pe-age'), gender:getVal('pe-gender'),
    phone:phone, bloodGroup:getVal('pe-blood'), village:getVal('pe-village'),
    district:getVal('pe-district'), history:getVal('pe-history'),
    isPregnant: $('pe-pregnant') ? $('pe-pregnant').checked : false };
  localStorage.setItem(_uk('profile'),JSON.stringify(p));
  localStorage.setItem('sah_profile_'+PID,JSON.stringify(p));
  S.profile=p; PNAME=rf(p,"name","full_name")||PNAME;
  toggleEditProfile(); populateProfileFields();
  showToast('Profile saved!','success');

  // Sync to backend DB so doctor and ASHA can see updated info
  if (PID) {
    fetch(API+'/patients/'+PID+'/profile', {
      method: 'POST', headers: authH(),
      body: JSON.stringify({
        name:            p.name || null,
        phone:           p.phone || null,
        age:             parseInt(p.age) || null,
        gender:          p.gender || null,
        village:         p.village || null,
        district:        p.district || null,
        medical_history: p.history || null,
        blood_group:     p.bloodGroup || null,
      })
    }).then(r => r.json())
      .then(d => { if(d.success) showToast('Profile synced to server ✅','success'); })
      .catch(() => showToast('Profile saved locally (will sync when online)','info'));
  }
}

/* ══ UPLOAD REPORT ════════════════════════════════════════ */
function switchUploadMode(mode) {
  var uploadSec=$('upload-section'); var manualSec=$('manual-section');
  var uploadBtn=$('mode-upload-btn'); var manualBtn=$('mode-manual-btn');
  if(!uploadSec||!manualSec) return;
  if(mode==='upload'){
    uploadSec.style.display='block'; manualSec.style.display='none';
    if(uploadBtn) uploadBtn.classList.add('active');
    if(manualBtn) manualBtn.classList.remove('active');
  } else {
    uploadSec.style.display='none'; manualSec.style.display='block';
    if(manualBtn) manualBtn.classList.add('active');
    if(uploadBtn) uploadBtn.classList.remove('active');
  }
}

function submitReport() {
  var getVal=function(id){ var el=$(id); return el?el.value.trim():''; };
  var dateVal=getVal('r-date');
  if(!dateVal){ showToast('Please select a report date.','error'); return; }

  var report={
    id:uid(), date:dateVal, type:getVal('r-type')||'General Checkup',
    hospital:getVal('r-hospital'), doctor:getVal('r-doctor'), nextDate:getVal('r-next'),
    bp:getVal('r-bp'), hr:getVal('r-hr'), temp:getVal('r-temp'), spo2:getVal('r-spo2'),
    sugar:getVal('r-sugar'), hb:getVal('r-hb'), cholesterol:getVal('r-cholesterol'),
    weight:getVal('r-weight'), symptoms:getVal('r-symptoms'), diagnosis:getVal('r-diagnosis'),
    meds:getVal('r-meds'), notes:getVal('r-notes'), savedAt:new Date().toISOString()
  };

  loadData();
  S.reports.push(report);
  if(report.doctor||report.hospital){
    S.checkups.push({ id:uid(), date:report.date, doctor:report.doctor,
      hospital:report.hospital, notes:report.diagnosis||report.notes,
      nextDate:rf(report,"nextDate","next_checkup_date"), reportId:report.id });
  }
  saveData();

  /* v3.1 — also save to SQLite backend so doctor portal can see this report */
  if(PID) {
    var hrVal = parseInt(report.hr) || null;
    var spo2Val = parseInt(report.spo2) || null;
    fetch(API+'/reports/save-full', {
      method: 'POST',
      headers: authH(),
      body: JSON.stringify({
        patient_id:      parseInt(PID),
        bp:              report.bp || null,
        hr:              hrVal,
        temp:            report.temp || null,
        spo2:            spo2Val,
        symptoms:        report.symptoms || null,
        medical_history: report.notes || null,
        diagnosis:       report.diagnosis || null,
        medications:     report.meds || null,
        notes:           report.notes || null,
        risk_level:      'PENDING',
        is_ai_extracted: 0,
        firebase_uid:    FID
      })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.success && d.db_id) {
        /* Store db_id so AI update can find this record later */
        loadData();
        for(var i=0;i<S.reports.length;i++){
          if(S.reports[i].id===report.id){ S.reports[i].db_id=d.db_id; break; }
        }
        saveData();
      }
    })
    .catch(function(){}); /* silent fail — localStorage already saved */
  }

  clearReportForm();
  refreshAllSections();

  /* Navigate to AI Reports */
  var navEl=document.querySelector('[data-section="reports"]');
  showSection('reports',navEl);
  showToast('Report saved! Running AI analysis...','success');

  runAIAnalysis(report);
}

function clearReportForm() {
  var inputs=document.querySelectorAll('#report-form input,#report-form textarea');
  for(var i=0;i<inputs.length;i++){ if(inputs[i].type!=='date') inputs[i].value=''; }
  var sels=document.querySelectorAll('#report-form select');
  for(var j=0;j<sels.length;j++) sels[j].selectedIndex=0;
  var dt=$('r-date'); if(dt) dt.value=new Date().toISOString().split('T')[0];
  switchUploadMode('manual'); /* ensure manual form shows by default */
}


/* ══ AI ANALYSIS (local heuristics, always fires) ═════════ */
function computeLocalRisk(r) {
  var score=0;
  if(r.bp){ var sys=parseInt((r.bp+'').split('/')[0],10); var dia=parseInt((r.bp+'').split('/')[1],10);
    if(sys>=180||dia>=120) score+=40; else if(sys>=140||dia>=90) score+=20; else if(sys>=130) score+=10; }
  if(rf(r,"sugar","blood_sugar")){ var sg=Number(rf(r,"sugar","blood_sugar"));
    if(sg>=400) score+=40; else if(sg>=200) score+=25; else if(sg>=140) score+=10; }
  if(rf(r,"hb","hemoglobin")){ var hb=Number(rf(r,"hb","hemoglobin"));
    if(hb<7) score+=35; else if(hb<10) score+=20; else if(hb<12) score+=10; }
  if(r.spo2){ var sp=Number(r.spo2);
    if(sp<88) score+=45; else if(sp<92) score+=30; else if(sp<95) score+=15; }
  if(r.cholesterol){ var ch=Number(r.cholesterol);
    if(ch>=240) score+=15; else if(ch>=200) score+=8; }
  if(r.temp){ var tmp=Number(r.temp);
    if(tmp>=40) score+=20; else if(tmp>=38.5) score+=10; }
  if(r.hr){ var hr=Number(r.hr);
    if(hr>=130||hr<45) score+=25; else if(hr>=100||hr<55) score+=10; }
  if(score>=50) return 'EMERGENCY';
  if(score>=25) return 'HIGH';
  if(score>=12) return 'MEDIUM';
  return 'LOW';
}

function guessDisease(r) {
  if(!r) return '';
  var disease='';
  if(r.bp){ var sys=parseInt((r.bp+'').split('/')[0],10);
    if(sys>=180) disease='Hypertensive Crisis';
    else if(sys>=140) disease='Hypertension'; }
  if(rf(r,"sugar","blood_sugar")){ var sg=Number(rf(r,"sugar","blood_sugar"));
    if(sg>=200&&!disease) disease='Diabetes Mellitus';
    else if(sg>=100&&sg<200&&!disease) disease='Pre-Diabetes'; }
  if(rf(r,"hb","hemoglobin")){ var hb=Number(rf(r,"hb","hemoglobin"));
    if(hb<7&&!disease) disease='Severe Anaemia';
    else if(hb<10&&!disease) disease='Moderate Anaemia';
    else if(hb<12&&!disease) disease='Mild Anaemia'; }
  if(r.spo2){ var sp=Number(r.spo2);
    if(sp<90&&!disease) disease='Hypoxia / Respiratory Failure'; }
  if(r.temp){ var tmp=Number(r.temp);
    if(tmp>=38.5&&!disease) disease='Febrile Illness'; }
  var syms=(r.symptoms||'').toLowerCase();
  if(!disease){
    if(syms.indexOf('chest')!==-1) disease='Possible Cardiac Event';
    else if(syms.indexOf('fever')!==-1) disease='Febrile Illness';
    else if(syms.indexOf('cough')!==-1) disease='Respiratory Illness';
  }
  return disease;
}

function buildLocalSummary(r) {
  var risk=computeLocalRisk(r); var disease=guessDisease(r);
  var lines=['CLINICAL FINDINGS:'];
  if(r.bp){
    var sys=parseInt((r.bp+'').split('/')[0],10);
    if(sys>=180) lines.push('- Blood Pressure '+r.bp+' mmHg: HYPERTENSIVE CRISIS. Immediate medical attention required.');
    else if(sys>=140) lines.push('- Blood Pressure '+r.bp+' mmHg: Stage 2 Hypertension. Anti-hypertensive therapy needed per ICMR guidelines.');
    else if(sys>=130) lines.push('- Blood Pressure '+r.bp+' mmHg: Elevated. Lifestyle modification advised.');
    else lines.push('- Blood Pressure '+r.bp+' mmHg: Within normal range.');
  }
  if(rf(r,"sugar","blood_sugar")){
    var sg=Number(rf(r,"sugar","blood_sugar"));
    if(sg>=400) lines.push('- Blood Sugar '+sg+' mg/dL: DANGEROUSLY HIGH. Emergency care needed. IV insulin may be required.');
    else if(sg>=200) lines.push('- Blood Sugar '+sg+' mg/dL: Diabetic range. Insulin or medication review needed per ICMR diabetes guidelines.');
    else if(sg>=100) lines.push('- Blood Sugar '+sg+' mg/dL: Pre-diabetic. Dietary changes and HbA1c test recommended.');
    else lines.push('- Blood Sugar '+sg+' mg/dL: Normal.');
  }
  if(rf(r,"hb","hemoglobin")){
    var hb=Number(rf(r,"hb","hemoglobin"));
    if(hb<7) lines.push('- Haemoglobin '+hb+' g/dL: Severe Anaemia. Blood transfusion may be required. Urgent referral.');
    else if(hb<10) lines.push('- Haemoglobin '+hb+' g/dL: Moderate Anaemia. Iron supplementation 200mg daily and dietary iron intake advised.');
    else if(hb<12) lines.push('- Haemoglobin '+hb+' g/dL: Mild Anaemia. Iron-rich diet and 3-month monitoring required.');
    else lines.push('- Haemoglobin '+hb+' g/dL: Normal range.');
  }
  if(r.spo2){
    var sp=Number(r.spo2);
    if(sp<90) lines.push('- SpO2 '+sp+'%: CRITICAL hypoxia. Oxygen therapy required immediately. Call 108.');
    else if(sp<95) lines.push('- SpO2 '+sp+'%: Below normal. Pulmonary function evaluation recommended.');
    else lines.push('- SpO2 '+sp+'%: Normal oxygen saturation.');
  }
  if(r.cholesterol){
    var ch=Number(r.cholesterol);
    if(ch>=240) lines.push('- Cholesterol '+ch+' mg/dL: High. Statin therapy and cardiac risk assessment per WHO guidelines.');
    else if(ch>=200) lines.push('- Cholesterol '+ch+' mg/dL: Borderline high. Dietary modification needed.');
    else lines.push('- Cholesterol '+ch+' mg/dL: Normal.');
  }
  if(r.symptoms) lines.push('\nSYMPTOMS REPORTED: '+r.symptoms);
  if(r.diagnosis) lines.push('DOCTOR DIAGNOSIS: '+r.diagnosis);
  lines.push('\nRISK ASSESSMENT: '+risk+(disease?' - '+disease:''));
  lines.push('\nRECOMMENDATIONS:');
  if(risk==='EMERGENCY'){
    lines.push('- IMMEDIATE emergency medical care required. Call 108 or go to nearest hospital NOW.');
    lines.push('- Do NOT delay treatment.');
  } else if(risk==='HIGH'){
    lines.push('- Visit a doctor within 24-48 hours.');
    lines.push('- Take all prescribed medications without interruption.');
    lines.push('- Monitor vitals every 6 hours if possible.');
  } else if(risk==='MEDIUM'){
    lines.push('- Schedule a doctor visit within 1-2 weeks.');
    lines.push('- Follow a low-salt, low-sugar diet (ICMR dietary guidelines).');
    lines.push('- Walk 30 minutes daily. Reduce stress.');
  } else {
    lines.push('- Continue healthy lifestyle. Routine checkup in 3-6 months.');
    lines.push('- Maintain balanced diet per ICMR Recommended Dietary Allowances.');
  }
  lines.push('\nNote: Based on ICMR Standard Treatment Guidelines and WHO protocols. Consult a qualified doctor for definitive diagnosis and treatment.');
  return lines.join('\n');
}

function runAIAnalysis(report) {
  /* Step 1 - Always compute local heuristics instantly */
  var localRisk    = computeLocalRisk(report);
  var localDisease = guessDisease(report);
  var localSummary = buildLocalSummary(report);

  /* Run clinical rules locally too */
  var localAlerts = [];
  try {
    /* Basic local rules without backend */
    var hbNum = parseFloat(rf(report,'hb','hemoglobin')||'0');
    var sgNum = parseFloat(rf(report,'sugar','blood_sugar')||'0');
    var spNum = parseFloat(report.spo2||'0');
    if(hbNum > 0 && hbNum < 7)    localAlerts.push({label:'Severe Anaemia', severity:'high', why:'Hb '+hbNum+' g/dL < 7', action:'Urgent referral needed'});
    if(sgNum > 300)                localAlerts.push({label:'Critical Blood Sugar', severity:'high', why:'Sugar '+sgNum+' mg/dL > 300', action:'Immediate medical review'});
    if(spNum > 0 && spNum < 90)   localAlerts.push({label:'Critical Hypoxia', severity:'high', why:'SpO2 '+spNum+'% < 90%', action:'Oxygen therapy needed'});
  } catch(e) {}

  /* Save local results immediately so UI updates right away */
  loadData();
  for(var i=0;i<S.reports.length;i++){
    if(S.reports[i].id===report.id){
      S.reports[i].aiRisk=localRisk; S.reports[i].aiDisease=localDisease;
      S.reports[i].aiSummary=localSummary; S.reports[i].aiSource='local';
      S.reports[i].aiClinicalAlerts=localAlerts;
      S.reports[i].aiDiseaseProbabilities={};
      break;
    }
  }
  saveData();
  refreshAllSections();

  /* Step 2 - Build prompt for LLM */
  var vitals=[];
  if(report.bp)                              vitals.push('Blood Pressure: '+report.bp+' mmHg');
  if(rf(report,'sugar','blood_sugar'))       vitals.push('Blood Sugar: '+rf(report,'sugar','blood_sugar')+' mg/dL');
  if(rf(report,'hb','hemoglobin'))           vitals.push('Haemoglobin: '+rf(report,'hb','hemoglobin')+' g/dL');
  if(report.spo2)                            vitals.push('SpO2: '+report.spo2+'%');
  if(report.cholesterol)                     vitals.push('Cholesterol: '+report.cholesterol+' mg/dL');
  if(report.temp)                            vitals.push('Temperature: '+report.temp+' C');
  if(report.hr)                              vitals.push('Heart Rate: '+report.hr+' BPM');
  if(report.weight)                          vitals.push('Weight: '+report.weight+' kg');

  var profile = S.profile || {};
  var patientInfo = [
    'Patient: '+(rf(profile,'name','full_name')||PNAME),
    profile.age    ? 'Age: '+profile.age+' years' : '',
    profile.gender ? 'Gender: '+profile.gender : '',
    rf(profile,'history','medical_history') ? 'Known History: '+rf(profile,'history','medical_history') : ''
  ].filter(Boolean).join('\n');

  var prompt = 'You are a clinical AI assistant for rural India, trained on ICMR Standard Treatment Guidelines and WHO protocols.\n\n'
    + 'PATIENT INFORMATION:\n' + patientInfo + '\n\n'
    + 'VITAL SIGNS:\n' + vitals.join('\n') + '\n\n'
    + (report.symptoms  ? 'SYMPTOMS: '+report.symptoms+'\n\n' : '')
    + (report.diagnosis ? 'DOCTOR DIAGNOSIS: '+report.diagnosis+'\n\n' : '')
    + (rf(report,'meds','medications') ? 'MEDICATIONS: '+rf(report,'meds','medications')+'\n\n' : '')
    + 'TASK:\n'
    + '1. Assess risk level: EMERGENCY, HIGH, MEDIUM, or LOW\n'
    + '2. State the most likely condition\n'
    + '3. Write a clear clinical summary (3-5 sentences) based on ICMR guidelines\n'
    + '4. Give 3-5 specific actionable recommendations\n\n'
    + 'Respond in this exact JSON format (no other text):\n'
    + '{"risk_level":"HIGH","diagnosis":"Condition name","summary":"Clinical summary here.","recommendations":["Rec 1","Rec 2","Rec 3"]}';

  /* Step 3 - Call FastAPI backend (LLaMA 70B or Mixtral 8x7B via AWS Bedrock) */
  function applyLLMResult(result, source) {
    loadData();
    for(var i=0;i<S.reports.length;i++){
      if(S.reports[i].id===report.id){
        S.reports[i].aiRisk            = result.risk_level         || localRisk;
        S.reports[i].aiDisease         = result.top_disease || result.diagnosis || localDisease;
        S.reports[i].aiSummary         = result.clinical_summary || result.summary || localSummary;
        S.reports[i].aiSource          = source;
        S.reports[i].aiRedFlags        = result.red_flags          || [];
        S.reports[i].aiInterpreted     = result.interpreted         || {};
        S.reports[i].aiRecommendations = result.recommendations     || [];
        S.reports[i].aiConfidence      = result.confidence_pct      || 0;
        S.reports[i].aiDiseaseProbabilities = result.disease_probabilities || {};
        S.reports[i].aiClinicalAlerts  = result.clinical_alerts     || [];
        S.reports[i].aiTopDiseaseAction= result.top_disease_action  || '';
        S.reports[i].aiTriageLevel     = result.triage_level        || '';
        S.reports[i].aiPriority        = result.priority            || {};
        break;
      }
    }
    saveData();
    refreshAllSections();

    /* v3.1 — update SQLite record with AI result so doctor portal sees risk */
    var dbId = null;
    for(var j=0;j<S.reports.length;j++){
      if(S.reports[j].id===report.id){ dbId=S.reports[j].db_id||null; break; }
    }
    if(dbId) {
      fetch(API+'/reports/'+dbId+'/update-ai', {
        method: 'PATCH',
        headers: authH(),
        body: JSON.stringify({
          risk_level: result.risk_level || localRisk || 'MEDIUM',
          diagnosis:  result.top_disease || result.diagnosis || localDisease || '',
          notes:      result.clinical_summary || result.summary || localSummary || ''
        })
      }).catch(function(){}); /* silent fail */
    }

    /* Show risk-appropriate toast */
    var risk = result.risk_level || localRisk;
    var toastType = risk === 'EMERGENCY' ? 'error' : risk === 'HIGH' ? 'warning' : 'success';
    showToast('AI analysis complete (' + source + ') - Risk: ' + risk, toastType);
  }

  var ctrl2 = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer2 = setTimeout(function(){
    if(ctrl2) ctrl2.abort();
    showToast('AI analysis complete (offline mode)','success');
  }, 12000);

  var fetchOpts = {
    method : 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN},
    body   : JSON.stringify({
      symptoms    : report.symptoms||vitals.join(', ')||'General checkup',
      vitals      : vitals.join(', '),
      patient_id  : PID,
      report_id   : report.id,
      patient_name: rf(profile,'name','full_name')||PNAME
    })
  };
  if(ctrl2) fetchOpts.signal = ctrl2.signal;

  fetch(API+'/diagnose/', fetchOpts)
  .then(function(res){ return res.json(); })
  .then(function(data){
    clearTimeout(timer2);
    if(!data||data.detail) throw new Error('backend error');
    applyLLMResult({
      risk_level: data.risk_level||data.risk,
      diagnosis : data.diagnosis||data.condition,
      summary   : data.summary||data.analysis
    }, 'LLaMA 70B');
  })
  .catch(function(err){
    clearTimeout(timer2);
    if(err && err.name === 'AbortError') return;
    showToast('AI analysis complete (offline mode)','success');
  });
}


/* ══ AI HEALTH REPORTS SECTION ════════════════════════════ */
function renderReportList() {
  var el=$('reports-list'); if(!el) return;
  loadData();
  if(!S.reports.length){
    el.innerHTML='<div class="empty-state" style="padding:3rem"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h4>No reports yet</h4><p>Upload your first health report to get AI-powered analysis.</p></div>';
    return;
  }
  var reversed=S.reports.slice().reverse();
  var html='';
  for(var i=0;i<reversed.length;i++) html+=buildReportCard(reversed[i]);
  el.innerHTML=html;
}

function buildReportCard(r) {
  var risk=rf(r,"aiRisk","ai_risk")||computeLocalRisk(r);
  var disease=rf(r,"aiDisease","ai_disease")||guessDisease(r);
  var summary=rf(r,"aiSummary","ai_summary")||'';
  var vitalsHtml=''; var hasVitals=false;
  var vItems=[
    {label:'Blood Pressure', val:r.bp?r.bp+' mmHg':null},
    {label:'Blood Sugar',    val:rf(r,"sugar","blood_sugar")?rf(r,"sugar","blood_sugar")+' mg/dL':null},
    {label:'Haemoglobin',    val:rf(r,"hb","hemoglobin")?rf(r,"hb","hemoglobin")+' g/dL':null},
    {label:'SpO2',           val:r.spo2?r.spo2+'%':null},
    {label:'Cholesterol',    val:r.cholesterol?r.cholesterol+' mg/dL':null},
    {label:'Temperature',    val:r.temp?r.temp+' C':null},
    {label:'Heart Rate',     val:r.hr?r.hr+' BPM':null},
    {label:'Weight',         val:r.weight?r.weight+' kg':null}
  ];
  for(var j=0;j<vItems.length;j++){
    if(vItems[j].val){ vitalsHtml+='<div class="rv-item"><span class="rv-label">'+vItems[j].label+'</span><span class="rv-val">'+vItems[j].val+'</span></div>'; hasVitals=true; }
  }
  var card='<div class="report-card" style="margin-bottom:1.25rem">'
    +'<div class="report-card-header">'
    +'<div><div class="report-type">'+(r.type||'Health Report')+'</div>'
    +'<div class="report-meta">'+fmtDate(r.date)+(r.hospital?' &bull; '+r.hospital:'')+(r.doctor?' &bull; Dr. '+r.doctor:'')+'</div></div>'
    +'<span class="risk-pill risk-'+risk.toLowerCase()+'">'+risk+'</span></div>';
  if(hasVitals) card+='<div class="report-vitals">'+vitalsHtml+'</div>';
  /* Disease probability bar */
  var diseaseProbs = r.aiDiseaseProbabilities || {};
  var probKeys = Object.keys(diseaseProbs).slice(0,3);
  var probHtml = '';
  if(probKeys.length > 0) {
    probHtml = '<div style="margin:.75rem 0;padding:.75rem 1rem;background:#f9fafb;border-radius:8px;font-size:.8rem">'
      + '<div style="font-weight:700;color:var(--muted);margin-bottom:.5rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Possible Conditions (ICMR-based)</div>';
    for(var pi=0;pi<probKeys.length;pi++){
      var dk = probKeys[pi];
      var dp = diseaseProbs[dk];
      var barColor = dp.probability > 50 ? '#e35a2c' : dp.probability > 25 ? '#d97706' : '#6b7280';
      probHtml += '<div style="margin-bottom:.5rem">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:2px">'
        + '<span style="font-weight:600">' + dp.display + '</span>'
        + '<span style="color:' + barColor + ';font-weight:700">' + dp.probability + '%</span>'
        + '</div>'
        + '<div style="height:4px;background:#e5e7eb;border-radius:4px">'
        + '<div style="height:4px;background:' + barColor + ';border-radius:4px;width:' + dp.probability + '%"></div>'
        + '</div></div>';
    }
    probHtml += '</div>';
  }

  /* Clinical alerts */
  var clinAlerts = r.aiClinicalAlerts || [];
  var alertsHtml = '';
  if(clinAlerts.length > 0) {
    alertsHtml = '<div style="margin:.5rem 0">';
    for(var ci=0;ci<clinAlerts.length;ci++){
      var al = clinAlerts[ci];
      var alColor = al.severity==='high'?'#dc2626':al.severity==='medium'?'#d97706':'#2563eb';
      alertsHtml += '<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.4rem .5rem;margin-bottom:.3rem;background:'+alColor+'10;border-left:3px solid '+alColor+';border-radius:0 6px 6px 0;font-size:.78rem">'
        + '<span style="font-weight:700;color:'+alColor+';white-space:nowrap">'+al.label+'</span>'
        + '<span style="color:#374151">'+al.why+'</span>'
        + '</div>';
    }
    alertsHtml += '</div>';
  }

  if(disease||summary){
    card+='<div class="ai-summary-box">'
      +(disease?'<div style="font-weight:700;color:var(--orange);margin-bottom:.5rem">'+disease+'</div>':'')
      + alertsHtml
      + probHtml
      +'<div style="font-size:.82rem;line-height:1.7;white-space:pre-wrap">'+(summary||'')+'</div></div>';
  } else {
    card+='<div class="ai-summary-box" style="color:var(--muted);font-size:.85rem"><div class="spinner spinner-sm" style="display:inline-block;margin-right:.5rem;vertical-align:middle"></div>AI analysis running...</div>';
  }
  if(r.symptoms)  card+='<div style="font-size:.8rem;color:var(--muted);margin-top:.5rem;padding:0 1rem"><strong>Symptoms:</strong> '+r.symptoms+'</div>';
  if(r.diagnosis) card+='<div style="font-size:.8rem;color:var(--muted);margin-top:.25rem;padding:0 1rem"><strong>Diagnosis:</strong> '+r.diagnosis+'</div>';
  if(rf(r,"meds","medications"))      card+='<div style="font-size:.8rem;color:var(--muted);margin-top:.25rem;padding:0 1rem"><strong>Medications:</strong> '+rf(r,"meds","medications")+'</div>';
  card+='<div style="display:flex;gap:.75rem;padding:.875rem 1rem;border-top:1px solid var(--border);margin-top:.5rem">'
    +'<button class="btn btn-outline btn-sm" onclick="generatePatientPDF(\''+r.id+'\')">'
    +'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg>'
    +' Download PDF</button>'
    +'<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteReport(\''+r.id+'\')">Delete</button>'
    +'</div></div>';
  return card;
}

function deleteReport(id) {
  if(!confirm('Delete this report? This cannot be undone.')) return;
  loadData();
  S.reports=S.reports.filter(function(r){ return r.id!==id; });
  S.checkups=S.checkups.filter(function(c){ return c.reportId!==id; });
  saveData(); refreshAllSections();
  showToast('Report deleted.','success');
}

function renderReportCharts() {
  if(!S.reports.length) return;
  var labels=S.reports.map(function(r){ return fmtDate(r.date).split(' ').slice(0,2).join(' '); });
  buildReportChart('reports-sugar-chart','Blood Sugar (mg/dL)',labels,
    S.reports.map(function(r){ return rf(r,"sugar","blood_sugar")?Number(rf(r,"sugar","blood_sugar")):null; }),'#e35a2c');
  buildReportChart('reports-hb-chart','Haemoglobin (g/dL)',labels,
    S.reports.map(function(r){ return rf(r,"hb","hemoglobin")?Number(rf(r,"hb","hemoglobin")):null; }),'#16a34a');
  buildReportChart('reports-bp-chart','Systolic BP (mmHg)',labels,
    S.reports.map(function(r){ return r.bp?parseInt((r.bp+'').split('/')[0],10):null; }),'#3b82f6');
}

function buildReportChart(canvasId,label,labels,data,color) {
  var ctx=$(canvasId); if(!ctx) return;
  var key=canvasId.replace(/-/g,'_');
  if(S.charts[key]){ S.charts[key].destroy(); S.charts[key]=null; }
  if(data.every(function(v){ return v===null; })) return;
  S.charts[key]=new Chart(ctx,{
    type:'line',
    data:{ labels:labels, datasets:[{ label:label, data:data, borderColor:color,
      backgroundColor:color+'18', tension:0.35, fill:true,
      pointBackgroundColor:color, pointRadius:4, spanGaps:true }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{grid:{display:false},ticks:{font:{size:10}}},
               y:{grid:{color:'rgba(0,0,0,.06)'},ticks:{font:{size:10}}} } }
  });
}


/* ══ CHECKUP RECORDS ══════════════════════════════════════ */
function renderCheckups() {
  loadData();
  var upcoming_el=$('upcoming-appts');
  var today=new Date().toISOString().split('T')[0];
  var upcoming=S.reports.filter(function(r){ return rf(r,"nextDate","next_checkup_date")&&rf(r,"nextDate","next_checkup_date")>=today; });
  upcoming.sort(function(a,b){ return new Date(a.nextDate)-new Date(b.nextDate); });
  if(upcoming_el){
    if(!upcoming.length){
      upcoming_el.innerHTML='<div style="font-size:.875rem;color:var(--muted);padding:.5rem 0">No upcoming appointments recorded.</div>';
    } else {
      var html='';
      for(var i=0;i<upcoming.length;i++){
        var r=upcoming[i];
        var days=Math.ceil((new Date(rf(r,"nextDate","next_checkup_date"))-new Date(today))/(86400000));
        html+='<div style="display:flex;align-items:center;gap:1rem;padding:.875rem;background:var(--pale);border-radius:10px;margin-bottom:.5rem">'
          +'<div style="width:42px;height:42px;background:var(--orange);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.875rem;flex-shrink:0">'+new Date(rf(r,"nextDate","next_checkup_date")).getDate()+'</div>'
          +'<div style="flex:1"><div style="font-weight:600;font-size:.875rem">'+fmtDate(rf(r,"nextDate","next_checkup_date"))+'</div>'
          +'<div style="font-size:.775rem;color:var(--muted)">'+(r.doctor?'Dr. '+r.doctor:'Follow-up visit')+(r.hospital?' at '+r.hospital:'')+'</div></div>'
          +'<span class="tl-tag-orange">'+(days<=0?'Today':'In '+days+' day'+(days!==1?'s':''))+'</span></div>';
      }
      upcoming_el.innerHTML=html;
    }
  }

  var tl=$('checkup-timeline'); var countEl=$('checkup-count');
  if(!tl) return;
  var visits=S.reports.slice().sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  if(countEl) countEl.textContent=visits.length+' visit'+(visits.length!==1?'s':'')+' recorded';
  if(!visits.length){
    tl.innerHTML='<div class="empty-state" style="padding:3rem"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><h4>No checkups recorded</h4><p>Your visit history will appear here after uploading reports with doctor information.</p></div>';
    return;
  }
  var tlHtml='';
  for(var k=0;k<visits.length;k++){
    var r=visits[k]; var risk=rf(r,"aiRisk","ai_risk")||computeLocalRisk(r); var isLast=k===visits.length-1;
    tlHtml+='<div class="tl-item">'
      +'<div class="tl-dot-col"><div class="tl-dot filled"></div>'+(isLast?'':'<div class="tl-line"></div>')+'</div>'
      +'<div class="tl-content">'
      +'<div class="tl-title">'+(r.type||'Health Report')+' &nbsp;<span class="risk-pill risk-'+risk.toLowerCase()+'" style="font-size:.7rem">'+risk+'</span></div>'
      +'<div class="tl-meta">'+fmtDate(r.date)+(r.doctor?' &bull; Dr. '+r.doctor:'')+(r.hospital?' &bull; '+r.hospital:'')+'</div>'
      +(r.diagnosis?'<div class="tl-desc">'+r.diagnosis+'</div>':'')
      +(rf(r,"meds","medications")?'<div class="tl-desc" style="margin-top:.2rem">Rx: '+rf(r,"meds","medications")+'</div>':'')
      +'</div></div>';
  }
  tl.innerHTML=tlHtml;
}

/* ══ QUICK DIAGNOSIS ══════════════════════════════════════ */
function runDiagnosis() {
  var input=$('diag-input'); var output=$('diag-output'); if(!input||!output) return;
  var symptoms=input.value.trim();
  if(!symptoms){ showToast('Please describe your symptoms first.','error'); return; }
  output.innerHTML='<div style="display:flex;align-items:center;gap:.875rem;padding:2rem;color:var(--muted)"><div class="spinner"></div><div>Analysing symptoms using ICMR guidelines...</div></div>';
  var btn=$('diag-btn'); if(btn) btn.disabled=true;
  if(API){
    fetch(API+'/diagnose/',{ method:'POST', headers:authH(),
      body:JSON.stringify({symptoms:symptoms,patient_id:PID,patient_name:PNAME}) })
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(btn) btn.disabled=false;
      if(data&&(data.summary||data.diagnosis)) renderDiagnosisResult(data.risk_level||'MEDIUM',data.diagnosis||'',data.summary||'','LLaMA 70B');
      else localDiagnosis(symptoms);
    })
    .catch(function(){ if(btn) btn.disabled=false; localDiagnosis(symptoms); });
  } else {
    setTimeout(function(){ if(btn) btn.disabled=false; localDiagnosis(symptoms); },800);
  }
}

function localDiagnosis(symptoms) {
  var syms=symptoms.toLowerCase(); var risk='MEDIUM'; var disease=''; var lines=[];
  if(syms.indexOf('chest pain')!==-1||(syms.indexOf('chest')!==-1&&syms.indexOf('pain')!==-1)){
    risk='EMERGENCY'; disease='Possible Cardiac Event';
    lines.push('Chest pain requires IMMEDIATE evaluation. Call 108 now.');
    lines.push('Possible: Myocardial Infarction, Angina, Pericarditis.');
    lines.push('Chew Aspirin 325mg if not allergic while waiting for help.');
  } else if(syms.indexOf('fever')!==-1&&syms.indexOf('rash')!==-1){
    risk='HIGH'; disease='Possible Dengue or Typhoid';
    lines.push('Fever with rash: Blood test (CBC, Widal, NS1 Antigen) required urgently.');
    lines.push('Maintain ORS hydration. Avoid Aspirin. Use Paracetamol only for fever.');
  } else if(syms.indexOf('fever')!==-1){
    risk='MEDIUM'; disease='Febrile Illness';
    lines.push('Fever present. Possible viral or bacterial infection.');
    lines.push('Paracetamol 500mg every 6 hours. Oral fluids (ORS). If fever >3 days, consult doctor.');
  } else if(syms.indexOf('cough')!==-1&&(syms.indexOf('blood')!==-1||syms.indexOf('3 week')!==-1)){
    risk='HIGH'; disease='Possible Tuberculosis';
    lines.push('Cough with blood: TB screening required. Sputum test + chest X-ray.');
    lines.push('Refer to nearest government DOTS TB clinic immediately.');
  } else if(syms.indexOf('breathless')!==-1||syms.indexOf('short')!==-1&&syms.indexOf('breath')!==-1){
    risk='HIGH'; disease='Respiratory Distress';
    lines.push('Breathing difficulty - urgent evaluation needed.');
    lines.push('Check SpO2. Below 94% = emergency. Call 108.');
  } else if(syms.indexOf('headache')!==-1){
    risk='LOW'; disease='Headache / Possible Migraine';
    lines.push('Causes: tension, dehydration, migraine, fever.');
    lines.push('Rest, hydration, Paracetamol if needed. If sudden severe or with vision changes, see doctor urgently.');
  } else {
    risk='LOW'; disease='General Illness';
    lines.push('Symptoms noted. No immediate emergency signs detected.');
    lines.push('Monitor symptoms. Consult a doctor if condition worsens.');
  }
  lines.push('\nBased on ICMR Standard Treatment Guidelines.');
  lines.push('This is an AI triage aid. Always consult a qualified doctor for proper diagnosis and treatment.');
  renderDiagnosisResult(risk,disease,lines.join('\n'),'ICMR Guidelines (Offline)');
}

function renderDiagnosisResult(risk,disease,summary,source) {
  var el=$('diag-output'); if(!el) return;
  var rc=risk==='EMERGENCY'?'insight-urgent':risk==='HIGH'?'insight-warning':risk==='LOW'?'insight-good':'insight-info';
  el.innerHTML='<div class="insight-card '+rc+'" style="margin-bottom:1rem">'
    +'<strong>Risk Level: '+risk+'</strong>'+(disease?' - '+disease:'')
    +'<span style="float:right;font-size:.75rem;opacity:.7">'+source+'</span></div>'
    +'<div style="font-size:.875rem;line-height:1.8;white-space:pre-wrap;color:var(--text)">'+summary+'</div>';
}

function recordVoice() { showToast('Voice input requires microphone permission. Please use the text box.','info'); }

/* ══ SHARE WITH DOCTOR ════════════════════════════════════ */
function renderShareSection() {
  var codeEl=$('share-code-value'); var expEl=$('share-code-exp');
  if(!codeEl||!expEl) return;
  var registry={}; try{ registry=JSON.parse(localStorage.getItem('sah_code_registry')||'{}'); }catch(e){}
  var myCode=null;
  for(var code in registry){ if(registry[code]&&registry[code].patient_id===PID){ myCode=code; break; } }
  if(myCode){ codeEl.textContent=myCode; expEl.textContent='Share this code with your doctor to give them access to your records.'; S.shareCode=myCode; }
  else { codeEl.textContent='SAHA-????'; expEl.textContent='Generate a code to share with your doctor.'; S.shareCode=null; }
  renderDoctorAccessList();
}

function generateShareCode() {
  var num=Math.floor(1000+Math.random()*9000); var code='SAHA-'+num;
  var registry={}; try{ registry=JSON.parse(localStorage.getItem('sah_code_registry')||'{}'); }catch(e){}
  for(var old in registry){ if(registry[old]&&registry[old].patient_id===PID) delete registry[old]; }
  var name=(S.profile&&S.profile.name)||PNAME;
  registry[code]={ patient_id:PID, name:name, email:EMAIL };
  localStorage.setItem('sah_code_registry',JSON.stringify(registry));
  S.shareCode=code;
  setText('share-code-value',code);
  setText('share-code-exp','Share this code with your doctor. Generate a new code to revoke this one.');
  showToast('Code '+code+' generated!','success');
}

function copyShareCode() {
  if(!S.shareCode){ showToast('Generate a code first.','error'); return; }
  if(navigator.clipboard){ navigator.clipboard.writeText(S.shareCode).then(function(){ showToast('Code copied to clipboard!','success'); }); }
  else { var t=document.createElement('textarea'); t.value=S.shareCode; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); showToast('Code copied!','success'); }
}

function revokeCode() {
  if(!S.shareCode) return;
  if(!confirm('Revoke code '+S.shareCode+'? Your doctor will lose access.')) return;
  var registry={}; try{ registry=JSON.parse(localStorage.getItem('sah_code_registry')||'{}'); }catch(e){}
  for(var old in registry){ if(registry[old]&&registry[old].patient_id===PID) delete registry[old]; }
  localStorage.setItem('sah_code_registry',JSON.stringify(registry));
  S.shareCode=null;
  setText('share-code-value','SAHA-????');
  setText('share-code-exp','Code revoked. Generate a new code when needed.');
  showToast('Access code revoked.','success');
}

function renderDoctorAccessList() {
  var el = document.getElementById('doctor-access-list');
  if (!el) return;
  el.innerHTML = '<div style="font-size:.875rem;color:var(--muted);padding:.5rem 0">' +
    (S.shareCode ? '✅ Your code is active. Share it verbally or by message -- never upload to public platforms.' : 'No active share code. Generate one to allow doctor access.') +
    '</div>';
}

/* ══ PDF REPORT ═══════════════════════════════════════════ */
function generatePatientPDF(reportId) {
  loadData();
  var report=null;
  for(var i=0;i<S.reports.length;i++){ if(S.reports[i].id===reportId){ report=S.reports[i]; break; } }
  if(!report){ showToast('Report not found.','error'); return; }
  /* Use report_generator.js if available */
  if(typeof buildPatientReportHTML==='function'){
    var html=buildPatientReportHTML(report,S.reports,S.profile||{name:PNAME});
    var win=window.open('','_blank');
    if(win){ win.document.write(html); win.document.close(); return; }
  }
  
  var profile=S.profile||{}; var risk=rf(report,"aiRisk","ai_risk")||computeLocalRisk(report);
  var riskColor=risk==='EMERGENCY'?'#dc2626':risk==='HIGH'?'#d97706':risk==='MEDIUM'?'#2563eb':'#16a34a';
  var patientName=rf(profile,'name','full_name')||PNAME;
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sahayak AI - Health Report</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f8f9fa;color:#1a1a1a}'
    +'.page{max-width:900px;margin:0 auto;background:#fff;box-shadow:0 0 40px rgba(0,0,0,.1)}'
    +'.header{background:linear-gradient(135deg,#e35a2c 0%,#f97316 100%);color:#fff;padding:2.5rem 3rem}'
    +'.header-top{display:flex;align-items:center;gap:1.5rem;margin-bottom:1.5rem}'
    +'.header-logo{width:52px;height:52px;background:rgba(255,255,255,.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:900;flex-shrink:0}'
    +'.header-brand{font-size:1.5rem;font-weight:800;letter-spacing:-.5px}'
    +'.header-brand span{opacity:.75;font-weight:500;font-size:1rem}'
    +'.header-meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem}'
    +'.meta-item{background:rgba(255,255,255,.15);border-radius:10px;padding:.875rem 1.25rem}'
    +'.meta-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;opacity:.8;margin-bottom:.35rem}'
    +'.meta-value{font-size:.95rem;font-weight:700}'
    +'.body{padding:2.5rem 3rem}'
    +'.risk-banner{padding:1.25rem 1.75rem;border-radius:14px;border:2px solid '+riskColor+';background:'+riskColor+'12;color:'+riskColor+';font-weight:700;font-size:1rem;margin-bottom:2rem;display:flex;align-items:center;gap:1rem}'
    +'.risk-icon{width:36px;height:36px;border-radius:50%;background:'+riskColor+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}'
    +'.section{margin-bottom:2rem}'
    +'.section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#e35a2c;border-bottom:2px solid #e35a2c;padding-bottom:.5rem;margin-bottom:1.25rem}'
    +'.vitals{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}'
    +'.vital{background:#fff7f4;border:1.5px solid rgba(227,90,44,.15);padding:1.25rem;border-radius:12px;text-align:center}'
    +'.vital-val{font-size:1.375rem;font-weight:800;color:#e35a2c;letter-spacing:-.5px}'
    +'.vital-name{font-size:.72rem;color:#6b7280;margin-top:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}'
    +'.summary-box{background:#f9fafb;border:1px solid #e5e7eb;padding:1.5rem;border-radius:12px;white-space:pre-wrap;font-size:.875rem;line-height:1.8;color:#374151}'
    +'.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}'
    +'.info-item{padding:.875rem 1rem;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb}'
    +'.info-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:.35rem}'
    +'.info-value{font-size:.9rem;font-weight:600;color:#1a1a1a}'
    +'.footer{padding:2rem 3rem;border-top:2px solid #f3f4f6;text-align:center;color:#9ca3af;font-size:.775rem;line-height:1.7}'
    +'@media print{.page{box-shadow:none}}'
    +'</style></head><body><div class="page">'
    +'<div class="header">'
    +'<div class="header-top"><div class="header-logo">S</div><div><div class="header-brand">Sahayak <span>AI Health Report</span></div><div style="opacity:.85;font-size:.85rem;margin-top:.25rem">Powered by LLaMA 70B · ICMR/WHO Guidelines</div></div></div>'
    +'<div class="header-meta">'
    +'<div class="meta-item"><div class="meta-label">Patient</div><div class="meta-value">'+patientName+(profile.age?', '+profile.age+' yrs':'')+'</div></div>'
    +'<div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">'+fmtDate(report.date)+'</div></div>'
    +'<div class="meta-item"><div class="meta-label">Generated</div><div class="meta-value">'+fmtDate(new Date().toISOString())+'</div></div>'
    +'</div></div>'
    +'<div class="body">'
    +'<div class="risk-banner"><div class="risk-icon">'+(risk==='EMERGENCY'?'🚨':risk==='HIGH'?'⚠':'✓')+'</div><div><div>Risk Level: '+risk+(rf(report,"aiDisease","ai_disease")?' - '+rf(report,"aiDisease","ai_disease"):'')+'</div><div style="font-weight:400;font-size:.825rem;margin-top:.2rem;opacity:.85">Source: ICMR Standard Treatment Guidelines &amp; WHO Protocols</div></div></div>'
    +'<div class="section"><div class="section-title">Report Details</div>'
    +'<div class="info-grid">'
    +'<div class="info-item"><div class="info-label">Report Type</div><div class="info-value">'+(report.type||'Health Report')+'</div></div>'
    +(report.hospital?'<div class="info-item"><div class="info-label">Hospital / Clinic</div><div class="info-value">'+report.hospital+'</div></div>':'')
    +(report.doctor?'<div class="info-item"><div class="info-label">Doctor</div><div class="info-value">Dr. '+report.doctor+'</div></div>':'')
    +(rf(report,"nextDate","next_checkup_date")?'<div class="info-item"><div class="info-label">Next Checkup</div><div class="info-value">'+fmtDate(rf(report,"nextDate","next_checkup_date"))+'</div></div>':'')
    +'</div></div>'
    +'<div class="section"><div class="section-title">Vital Signs</div><div class="vitals">';
  var vitalsAll=[['Blood Pressure',report.bp?report.bp+' mmHg':null],['Blood Sugar',rf(report,"sugar","blood_sugar")?rf(report,"sugar","blood_sugar")+' mg/dL':null],['Haemoglobin',rf(report,"hb","hemoglobin")?rf(report,"hb","hemoglobin")+' g/dL':null],['SpO2',report.spo2?report.spo2+'%':null],['Cholesterol',report.cholesterol?report.cholesterol+' mg/dL':null],['Heart Rate',report.hr?report.hr+' BPM':null],['Temperature',report.temp?report.temp+' C':null],['Weight',report.weight?report.weight+' kg':null]];
  var hasAnyVital=false;
  for(var v=0;v<vitalsAll.length;v++){ if(vitalsAll[v][1]){ hasAnyVital=true; html+='<div class="vital"><div class="vital-val">'+vitalsAll[v][1]+'</div><div class="vital-name">'+vitalsAll[v][0]+'</div></div>'; } }
  if(!hasAnyVital) html+='<p style="color:#6b7280;font-size:.875rem">No vital signs recorded for this report.</p>';
  html+='</div></div>';
  if(rf(report,"aiSummary","ai_summary")) html+='<div class="section"><div class="section-title">AI Clinical Analysis (LLaMA 70B)</div><div class="summary-box">'+rf(report,"aiSummary","ai_summary")+'</div></div>';
  if(report.symptoms||report.diagnosis||rf(report,"meds","medications")){
    html+='<div class="section"><div class="section-title">Clinical Notes</div><div class="info-grid">';
    if(report.symptoms)  html+='<div class="info-item" style="grid-column:1/-1"><div class="info-label">Symptoms</div><div class="info-value" style="font-weight:400">'+report.symptoms+'</div></div>';
    if(report.diagnosis) html+='<div class="info-item" style="grid-column:1/-1"><div class="info-label">Doctor Diagnosis</div><div class="info-value">'+report.diagnosis+'</div></div>';
    if(rf(report,"meds","medications")) html+='<div class="info-item" style="grid-column:1/-1"><div class="info-label">Medications Prescribed</div><div class="info-value" style="font-weight:400">'+rf(report,"meds","medications")+'</div></div>';
    html+='</div></div>';
  }
  html+='<div class="footer">'
    +'<strong style="color:#e35a2c">Sahayak AI</strong> | Team DreamAlpha | AMD Slingshot Hackathon 2026<br>'
    +'ICMR Standard Treatment Guidelines &amp; WHO Protocols | '+new Date().toLocaleDateString('en-IN')+'<br>'
    +'<span style="font-style:italic">This report is AI-assisted and not a substitute for qualified medical consultation. Always consult your doctor before making any health decisions.</span>'
    +'</div></div></body></html>';
  var win=window.open('','_blank');
  if(win){ win.document.write(html); win.document.close(); }
  else showToast('Allow pop-ups to view the PDF.','error');
}

/* ── Show abnormal values banner after PDF auto-fill ── */
function showAbnormalBanner(findings, redFlags) {
  var existing = $('abnormal-banner');
  if(existing) existing.parentNode.removeChild(existing);

  var div = document.createElement('div');
  div.id = 'abnormal-banner';
  div.style.cssText = 'background:#fff7f4;border:2px solid #e35a2c;border-radius:12px;padding:1rem 1.25rem;margin:1rem 0;font-size:.85rem;line-height:1.7;';

  var html = '<div style="font-weight:700;color:#e35a2c;margin-bottom:.5rem">';
  if(redFlags && redFlags.length > 0) {
    html += '<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:6px;font-size:.75rem;margin-right:.5rem">CRITICAL</span>';
    html += redFlags.length + ' critical value' + (redFlags.length>1?'s':'') + ' detected</div>';
    for(var i=0;i<redFlags.length;i++) {
      html += '<div style="color:#dc2626;font-weight:600">! ' + redFlags[i] + '</div>';
    }
  } else {
    html += findings.length + ' abnormal value' + (findings.length>1?'s':'') + ' detected</div>';
  }
  for(var j=0;j<findings.length;j++) {
    html += '<div style="color:#d97706">* ' + findings[j] + '</div>';
  }
  html += '<div style="color:#6b7280;font-size:.775rem;margin-top:.5rem">Please review these values carefully before saving.</div>';
  div.innerHTML = html;

  var btn = $('submit-report-btn');
  if(btn && btn.parentNode) btn.parentNode.insertBefore(div, btn);
}


/* ══ LOGOUT ═══════════════════════════════════════════════ */
function logout() {
  // Sign out from Firebase
  try {
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
      .then(function(m){ var a=m.getAuth(); if(a) m.signOut(a).catch(function(){}); })
      .catch(function(){});
  } catch(e){}
  // Clear user-namespaced data
  var uid = localStorage.getItem('sahayak_user_id') || '';
  if (uid) {
    var pfx = 'u_'+uid+'_', rm=[];
    for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.startsWith(pfx)) rm.push(k); }
    rm.forEach(function(k){localStorage.removeItem(k);});
  }
  ['sahayak_token','sahayak_role','sahayak_name','sahayak_user_id','sahayak_email',
   'sahayak_patient_id','sahayak_spec','sahayak_firebase_uid']
    .forEach(function(k){localStorage.removeItem(k);});
  window.location.href='auth.html';
}

/* ══ BOOT ═════════════════════════════════════════════════ */
/* ── AI key setup (called once to store Groq key) ── */
function setGroqKey(key) {
  if(key && key.trim()) {
    /* legacy - not used */
    showToast('Groq API key saved! AI analysis now uses LLaMA 70B.','success');
  }
}
/* -- Store Groq keys - names match .env exactly ─────────── */
/* Run once in browser console:                                  */
/* setGroqKeys('your_GROQ_API_KEY_1', 'your_GROQ_API_KEY_2')   */
function setGroqKeys(key1, key2) {
  if(key1) localStorage.setItem('GROQ_API_KEY_1', key1.trim());
  if(key2) localStorage.setItem('GROQ_API_KEY_2', key2.trim());
  showToast('Groq keys saved! PDF upload now uses LLaMA 3.1 70B offline.','success');
  checkAIStatus();
}

function checkAIStatus() {
  /* Ping backend to check if it's running */
  var badge = $('rate-badge');
  fetch(API+'/health', {method:'GET', headers: {'Authorization': 'Bearer '+(TOKEN||'')}})
    .then(function(){ 
      if(badge){ badge.textContent='AI Ready (LLaMA 70B)'; badge.style.background='rgba(22,163,74,.1)'; badge.style.color='#15803d'; }
    })
    .catch(function(){ 
      if(badge){ badge.textContent='AI Ready (Offline)'; badge.style.background='rgba(251,191,36,.15)'; badge.style.color='#92400e'; }
    });
}

document.addEventListener('DOMContentLoaded',function(){
  var dt=$('r-date'); if(dt) dt.value=new Date().toISOString().split('T')[0];
  switchUploadMode('manual'); /* ensure manual form shows by default */

  var dropZone=$('drop-zone'); var fileInput=$('report-file-input');
  if(dropZone&&fileInput){
    dropZone.addEventListener('click',function(){ fileInput.click(); });
    dropZone.addEventListener('dragover',function(e){ e.preventDefault(); dropZone.style.borderColor='#e35a2c'; });
    dropZone.addEventListener('dragleave',function(){ dropZone.style.borderColor=''; });
    dropZone.addEventListener('drop',function(e){ e.preventDefault(); dropZone.style.borderColor=''; var f=e.dataTransfer.files[0]; if(f) handleFileUpload(f); });
    fileInput.addEventListener('change',function(){ if(fileInput.files[0]) handleFileUpload(fileInput.files[0]); });
  }

  loadData();
  renderDashboard();
  updateNavBadges();
  populateProfileFields();
  checkAIStatus();
  if(S.reports.length) showToast('Welcome back, '+((S.profile&&S.profile.name)||PNAME)+'!','success');
});

/* ══ PDF / IMAGE UPLOAD - sends file directly to backend ═════════ */

function handleFileUpload(file) {
  switchUploadMode('manual');
  var progress  = $('upload-progress');
  var indicator = $('processing-indicator');
  var fill      = progress ? progress.querySelector('.progress-fill') : null;
  var label     = $('progress-label');
  var fname     = $('upload-filename');
  if(fname) fname.textContent = file.name;
  if(progress)  progress.style.display  = 'block';
  if(indicator) indicator.style.display = 'flex';

  function setProgress(pct, msg) {
    if(fill)  fill.style.width  = pct + '%';
    if(label) label.textContent = msg;
  }
  function done(msg, type) {
    if(progress)  progress.style.display  = 'none';
    if(indicator) indicator.style.display = 'none';
    showToast(msg, type || 'success');
  }

  var isMedia = file.type === 'application/pdf'
    || file.name.toLowerCase().endsWith('.pdf')
    || file.type.indexOf('image/') === 0;

  if(!isMedia) {
    done('Unsupported file type. Please upload a PDF or image.', 'error');
    return;
  }

  /* Check file size (5MB) */
  if(file.size > 5 * 1024 * 1024) {
    done('File too large (max 5 MB). Please compress and try again.', 'error');
    return;
  }

  setProgress(15, 'Uploading to server...');

  /* Build multipart form */
  var formData = new FormData();
  formData.append('file', file, file.name);

  /* Timeout controller - 30 seconds */
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function() {
    if(controller) controller.abort();
    setProgress(100, '');
    /* Fall back to local text extraction */
    done('Server timeout - trying local extraction...', 'info');
    handleFileUploadLocal(file);
  }, 30000);

  var opts = { method: 'POST', body: formData, headers: {'Authorization': 'Bearer ' + (TOKEN||'')} };
  if(controller) opts.signal = controller.signal;
  /* Note: no Content-Type header - browser sets it with boundary for multipart */

  setProgress(30, 'Server reading file...');

  fetch(API+'/diagnose/extract-file', opts)
  .then(function(res) {
    if(!res.ok) throw new Error('HTTP ' + res.status);
    setProgress(65, 'LLaMA 70B analysing...');
    return res.json();
  })
  .then(function(result) {
    clearTimeout(timer);
    if(!result.success) {
      setProgress(100, '');
      /* Server returned error - try local */
      done('Server: ' + (result.error || 'extraction failed') + '. Trying offline...', 'info');
      handleFileUploadLocal(file);
      return;
    }
    setProgress(90, 'Filling form...');
    var filled = fillFormFromLLM(result.data);
    setProgress(100, '');

    var pct      = result.completion_pct || Math.round(filled / 17 * 100);
    var abnormal = result.abnormal_count || 0;
    var msg      = 'Auto-filled ' + filled + ' fields (' + pct + '%) via LLaMA 70B';
    if(abnormal > 0) msg += ' | ' + abnormal + ' abnormal value' + (abnormal > 1 ? 's' : '');
    done(msg, abnormal > 0 ? 'warning' : 'success');

    if(abnormal > 0 && result.abnormal_findings && result.abnormal_findings.length) {
      showAbnormalBanner(result.abnormal_findings, result.red_flags || []);
    }
    /* Switch to manual view so the filled form is visible */
    switchUploadMode('manual');
    var form = $('report-form');
    if(form) form.scrollIntoView({behavior:'smooth'});
  })
  .catch(function(err) {
    clearTimeout(timer);
    if(err && err.name === 'AbortError') return; /* Timeout already handled */
    /* Backend not running - fall through to local extraction */
    done('Backend offline - trying local extraction...', 'info');
    handleFileUploadLocal(file);
  });
}

/* ── Offline fallback: read file in browser, send text to Groq ── */
function handleFileUploadLocal(file) {
  var progress  = $('upload-progress');
  var indicator = $('processing-indicator');
  var fill      = progress ? progress.querySelector('.progress-fill') : null;
  var label     = $('progress-label');
  if(progress)  progress.style.display  = 'block';
  if(indicator) indicator.style.display = 'flex';

  function setProgress(pct, msg) {
    if(fill)  fill.style.width  = pct + '%';
    if(label) label.textContent = msg;
  }
  function done(msg, type) {
    if(progress)  progress.style.display  = 'none';
    if(indicator) indicator.style.display = 'none';
    showToast(msg, type || 'success');
  }

  if(file.type.indexOf('image/') === 0) {
    setProgress(100, '');
    done('Image received. Please fill in the values from the report manually.', 'info');
    return;
  }

  setProgress(20, 'Reading PDF locally...');
  var reader = new FileReader();
  reader.onload = function(e) {
    setProgress(40, 'Extracting text...');
    var bytes = new Uint8Array(e.target.result);
    extractPDFTextAsync(bytes, function(rawText) {
      var clean = cleanPDFText(rawText || '');
      if(!clean || clean.replace(/\s/g,'').length < 30) {
        setProgress(100, '');
        done('Could not read PDF text. Please use Manual Entry to fill the form.', 'info');
        return;
      }
      setProgress(65, 'Sending to Groq AI...');
      tryGroqExtract(clean, function(llmData, source) {
        if(llmData) {
          var mapped = mapLLMToForm(llmData);
          var filled = fillFormFromLLM(mapped);
          setProgress(100, '');
          done('Auto-filled ' + filled + ' fields via ' + source + '. Verify and Save!', 'success');
          var form = $('report-form');
          if(form) form.scrollIntoView({behavior:'smooth'});
        } else {
          setProgress(100, '');
          done('AI offline. Please fill in the form manually.', 'info');
        }
      });
    });
  };
  reader.onerror = function() {
    setProgress(100, '');
    done('Could not read file. Please use Manual Entry.', 'error');
  };
  reader.readAsArrayBuffer(file);
}



/* ══════════════════════════════════════════════════════════════════════
   OFFLINE FALLBACK — All 5 functions required by handleFileUploadLocal
   These were missing from the codebase — causing silent ReferenceErrors
   ══════════════════════════════════════════════════════════════════════ */

/* ── 1. Extract raw text from PDF bytes using PDF.js ─────────────────── */
function extractPDFTextAsync(uint8Array, callback) {
  if (typeof pdfjsLib === 'undefined') {
    console.warn('PDF.js not loaded');
    callback('');
    return;
  }
  var loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  loadingTask.promise.then(function(pdf) {
    var totalPages = Math.min(pdf.numPages, 3);
    var pageTexts  = new Array(totalPages);
    var loaded     = 0;
    if (totalPages === 0) { callback(''); return; }
    for (var i = 1; i <= totalPages; i++) {
      (function(pageNum) {
        pdf.getPage(pageNum).then(function(page) {
          page.getTextContent().then(function(content) {
            pageTexts[pageNum - 1] = content.items.map(function(item) {
              return item.str;
            }).join(' ');
            if (++loaded === totalPages) callback(pageTexts.join('\n'));
          });
        });
      })(i);
    }
  }).catch(function(err) {
    console.warn('PDF.js failed:', err);
    callback('');
  });
}

/* ── 2. Clean raw PDF text ─────────────────────────────────────────────── */
function cleanPDFText(text) {
  if (!text) return '';
  return text
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s{3,}/g, ' ')
    .trim();
}

/* ── 3. Try Groq API with key rotation ────────────────────────────────── */
function tryGroqExtract(text, callback) {
  var keys = [
    localStorage.getItem('GROQ_API_KEY_1') || '',
    localStorage.getItem('GROQ_API_KEY_2') || ''
  ].filter(function(k) { return k.trim().length > 0; });

  if (!keys.length) {
    console.warn('No Groq keys in localStorage');
    callback(null, null);
    return;
  }

  var prompt =
    'Extract ALL medical data from this Indian patient report.\n' +
    'Return ONLY raw JSON:\n' +
    '{"patient_info":{"name":null,"age":null,"gender":null},' +
    '"report_meta":{"date":null,"report_type":null,"hospital":null,"doctor":null},' +
    '"vitals":{"bp":null,"hr":null,"temp":null,"spo2":null,"weight":null},' +
    '"lab_tests":[{"test_name":"name","value":"val"}],' +
    '"clinical":{"symptoms":null,"diagnosis":null,"medications":null,"notes":null},' +
    '"derived":{"sugar":null,"hb":null,"cholesterol":null}}\n\nREPORT:\n' +
    text.slice(0, 3000);

  function tryKey(idx) {
    if (idx >= keys.length) { callback(null, null); return; }
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys[idx] },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0, max_tokens: 1000
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var raw    = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
      var parsed = parseGroqJSON(raw);
      if (parsed) callback(parsed, 'Groq LLaMA 70B');
      else tryKey(idx + 1);
    })
    .catch(function() { tryKey(idx + 1); });
  }
  tryKey(0);
}

/* ── 4. Parse JSON from Groq/LLM response ─────────────────────────────── */
function parseGroqJSON(raw) {
  if (!raw) return null;
  var clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch(e) {
    var m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch(e2) {} }
  }
  return null;
}

/* ── 5a. Map nested LLM/Gemini JSON → flat form field IDs ─────────────── */
function mapLLMToForm(data) {
  if (!data) return {};
  function get(obj, path) {
    var v = obj;
    for (var i = 0; i < path.length; i++) {
      if (!v || typeof v !== 'object') return null;
      v = v[path[i]];
    }
    if (v === null || v === undefined) return null;
    var s = String(v).toLowerCase().trim();
    return (s === 'null' || s === 'none' || s === '') ? null : String(v).trim();
  }
  var f = {};
  f['r-date']       = get(data, ['report_meta','date']);
  f['r-hospital']   = get(data, ['report_meta','hospital']);
  f['r-doctor']     = get(data, ['report_meta','doctor']);
  f['r-type']       = get(data, ['report_meta','report_type']);
  f['r-bp']         = get(data, ['vitals','bp']);
  f['r-hr']         = get(data, ['vitals','hr']);
  f['r-temp']       = get(data, ['vitals','temp']);
  f['r-spo2']       = get(data, ['vitals','spo2']);
  f['r-weight']     = get(data, ['vitals','weight']);
  f['r-sugar']      = get(data, ['derived','sugar']);
  f['r-hb']         = get(data, ['derived','hb']);
  f['r-cholesterol']= get(data, ['derived','cholesterol']);
  f['r-symptoms']   = get(data, ['clinical','symptoms']);
  f['r-diagnosis']  = get(data, ['clinical','diagnosis']);
  f['r-meds']       = get(data, ['clinical','medications']);
  f['r-notes']      = get(data, ['clinical','notes']);
  /* pull from lab_tests if derived was empty */
  var labs = data.lab_tests || [];
  for (var i = 0; i < labs.length; i++) {
    var n = (labs[i].test_name || '').toLowerCase();
    var v = labs[i].value;
    if (!v) continue;
    if (!f['r-sugar']       && /glucose|sugar|fbs|rbs|ppbs/.test(n)) f['r-sugar'] = v;
    if (!f['r-hb']          && /haemoglobin|hemoglobin|\bhgb\b|\bhb\b/.test(n)) f['r-hb'] = v;
    if (!f['r-cholesterol'] && /cholesterol/.test(n)) f['r-cholesterol'] = v;
  }
  return f;
}

/* ── 5b. Fill HTML form fields, return count filled ───────────────────── */
function fillFormFromLLM(mapped) {
  if (!mapped) return 0;
  /* Also accept flat backend keys (bp, sugar, hb …) */
  var backendToForm = {
    bp:'r-bp', hr:'r-hr', temp:'r-temp', spo2:'r-spo2', weight:'r-weight',
    sugar:'r-sugar', hb:'r-hb', cholesterol:'r-cholesterol',
    date:'r-date', hospital:'r-hospital', doctor:'r-doctor',
    symptoms:'r-symptoms', diagnosis:'r-diagnosis',
    medications:'r-meds', notes:'r-notes', report_type:'r-type',
    patient_name:'pe-name'
  };
  var numeric = ['r-hr','r-temp','r-spo2','r-weight','r-sugar','r-hb','r-cholesterol'];
  var filled  = 0;
  Object.keys(mapped).forEach(function(key) {
    var val = mapped[key];
    if (!val) return;
    var id  = backendToForm[key] || key;
    var el  = document.getElementById(id);
    if (!el) return;
    if (numeric.indexOf(id) !== -1) {
      var m = String(val).match(/\d+(?:\.\d+)?/);
      val = m ? m[0] : val;
    }
    if (el.tagName === 'SELECT') {
      var opts = Array.from(el.options);
      var hit  = opts.find(function(o) {
        return o.text.toLowerCase().includes(String(val).toLowerCase()) ||
               o.value.toLowerCase() === String(val).toLowerCase();
      });
      if (hit) { el.value = hit.value; filled++; }
      return;
    }
    el.value = val;
    filled++;
  });
  return filled;
}

/* ══ VAPI VOICE HEALTH ASSISTANT ═══════════════════════════════════════════ */
var _vapiP = null;
var _vapiPLoaded = false;

(function loadVapiPatient() {
  import('https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/vapi.js')
    .then(function(mod) {
      window.VapiPatient = mod.default || mod.Vapi || mod;
      _vapiPLoaded = true;
    }).catch(function() { console.log('VAPI SDK not loaded — demo mode active'); });
})();

async function startPatientVapiCall() {
  var key = localStorage.getItem('patient_vapi_key') || localStorage.getItem('vapi_public_key') || '';
  var overlay = document.getElementById('patient-call-overlay');
  var statusEl = document.getElementById('p-call-status');
  var transEl  = document.getElementById('p-call-transcript');

  if (overlay) overlay.style.display = 'flex';
  if (statusEl) statusEl.textContent = 'Connecting to Health Assistant…';
  if (transEl) transEl.textContent = '';

  // Fetch personalised agent config from backend
  try {
    var cfgUrl = API + '/vapi/agent-config/patient?user_id=' + encodeURIComponent(PID||'')
               + '&name=' + encodeURIComponent(PNAME||'Patient');
    var cfgRes = await fetch(cfgUrl);
    var cfgData = cfgRes.ok ? await cfgRes.json() : null;
    var agentConfig = cfgData && cfgData.config ? cfgData.config : null;
  } catch(e) { agentConfig = null; }

  if (key && _vapiPLoaded && window.VapiPatient) {
    try {
      if (!_vapiP) { _vapiP = new window.VapiPatient(key); }
      _vapiP.on('speech-start', function() { if(statusEl) statusEl.textContent = 'Listening…'; });
      _vapiP.on('speech-end',   function() { if(statusEl) statusEl.textContent = 'Processing…'; });
      _vapiP.on('message', function(msg) {
        if (msg.type === 'transcript' && msg.role === 'assistant' && transEl) {
          transEl.textContent = msg.transcript || '';
        }
      });
      _vapiP.on('call-end', function() { endPatientCall(); });
      _vapiP.on('error', function(e) {
        console.error('VAPI error:', e);
        if(statusEl) statusEl.textContent = 'Connection issue — try again';
      });

      if (agentConfig) {
        await _vapiP.start(agentConfig);
      } else {
        // Fallback: use assistant ID from localStorage
        var aid = localStorage.getItem('patient_vapi_aid') || '';
        if (aid) { await _vapiP.start(aid); }
        else { throw new Error('no_config'); }
      }
      if(statusEl) statusEl.textContent = 'Connected — ask your question!';
    } catch(e) {
      console.warn('VAPI call failed, using chat fallback:', e);
      endPatientCall();
      openHealthAssistant();
    }
  } else {
    // Demo: open chat assistant instead
    if(overlay) overlay.style.display = 'none';
    openHealthAssistant();
  }
}

function endPatientCall() {
  try { if (_vapiP) _vapiP.stop(); } catch(e) {}
  var overlay = document.getElementById('patient-call-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openHealthAssistant() {
  window.open('chatbot_patient.html?pid=' + encodeURIComponent(PID||'')
    + '&name=' + encodeURIComponent(PNAME||''), '_blank',
    'width=440,height=700,resizable=yes');
}
