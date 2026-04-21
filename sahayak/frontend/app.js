/**
 * Sahayak AI — Complete Client Application
 * All features working: voice, diagnosis, reports, PDF, TTS, analytics
 */

const API_BASE = '';  // Same-origin — works both local and deployed

// ── State ─────────────────────────────────────────────────
const state = {
  patients: [],
  selectedPatient: null,
  currentDiagnosis: null,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  lang: 'en',
  callsRemaining: 10,  // Tracks rate limit display
};

// ── DOM helper ────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupLanguage();
  setupTextarea();
  setupVoice();
  setupDiagnosisButtons();
  setupPatientModal();
  setupReportModal();
  setupReportsView();
  await fetchPatients();
  await fetchRateLimitStatus();
});

// ── Language selector ─────────────────────────────────────
function setupLanguage() {
  const sel = $('lang-select');
  if (!sel) return;
  sel.addEventListener('change', (e) => { state.lang = e.target.value; });
}

// ── Textarea char counter ─────────────────────────────────
function setupTextarea() {
  const ta = $('symptom-textarea');
  const counter = $('char-count');
  if (!ta) return;
  ta.addEventListener('input', () => {
    const n = ta.value.length;
    counter.textContent = n;
    counter.style.color = n > 1800 ? '#dc2626' : '';
  });
}

// ── Voice Recording ───────────────────────────────────────
function setupVoice() {
  const btn = $('record-btn');
  if (!btn) return;
  btn.addEventListener('click', toggleRecording);
}

async function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone not supported in this browser.', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];

    // Prefer webm/ogg; fallback to default
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : '';

    state.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    state.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
    });
    state.mediaRecorder.addEventListener('stop', processAudio);
    state.mediaRecorder.start(250);  // collect every 250ms

    state.isRecording = true;
    updateRecordBtn(true);
    showVoiceStatus('Recording… tap again to stop');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('Microphone access denied. Please allow it in your browser settings.', 'error');
    } else {
      showToast('Could not access microphone: ' + err.message, 'error');
    }
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.isRecording) {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    state.isRecording = false;
    updateRecordBtn(false);
    showVoiceStatus('Processing audio…');
  }
}

function updateRecordBtn(recording) {
  const btn = $('record-btn');
  if (!btn) return;
  if (recording) {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#e35a2c" stroke="none">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
      Stop
    `;
    btn.style.borderColor = '#e35a2c';
    btn.style.color = '#e35a2c';
  } else {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
      Voice
    `;
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

function showVoiceStatus(text) {
  const box = $('voice-status');
  const txt = $('voice-status-text');
  if (!box) return;
  if (text) {
    box.style.display = 'flex';
    txt.textContent = text;
  } else {
    box.style.display = 'none';
  }
}

async function processAudio() {
  const mimeType = state.mediaRecorder?.mimeType || 'audio/webm';
  const ext = mimeType.includes('ogg') ? '.ogg' : '.webm';
  const blob = new Blob(state.audioChunks, { type: mimeType });

  const formData = new FormData();
  formData.append('audio', blob, `recording${ext}`);
  formData.append('lang', state.lang);

  try {
    const res = await fetch(`${API_BASE}/transcribe/`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Transcription failed');
    const data = await res.json();
    const text = (data.text || '').trim();
    if (text) {
      $('symptom-textarea').value = text;
      $('char-count').textContent = text.length;
      showVoiceStatus(null);
      showToast('Voice transcribed successfully!', 'success');
    } else {
      showVoiceStatus('Could not understand audio. Please try again or type symptoms.');
    }
  } catch (err) {
    showVoiceStatus(null);
    showToast('Transcription failed: ' + err.message, 'error');
    console.error(err);
  }
}

// ── Diagnosis ─────────────────────────────────────────────
function setupDiagnosisButtons() {
  const examBtn = $('examine-btn');
  const ttsBtn  = $('play-tts-btn');
  const pdfBtn  = $('gen-pdf-btn');
  if (examBtn) examBtn.addEventListener('click', startAnalysis);
  if (ttsBtn)  ttsBtn.addEventListener('click', playTTS);
  if (pdfBtn)  pdfBtn.addEventListener('click', generateReferral);
}

async function startAnalysis() {
  const text = $('symptom-textarea').value.trim();
  if (!text) {
    showToast('Please describe patient symptoms first.', 'warning');
    return;
  }

  showLoadingDiagnosis();
  const btn = $('examine-btn');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      symptoms: text,
      patient_id: state.selectedPatient?.id || null,
      lang: state.lang,
      additional_context: null,
      vitals: null,
    };

    const res = await fetch(`${API_BASE}/diagnose/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const err = await res.json();
      showRateLimitError(err.detail || 'Rate limit reached. Please try again later.');
      return;
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Diagnosis failed');
    }

    state.currentDiagnosis = await res.json();
    renderDiagnosis(state.currentDiagnosis);
    await fetchRateLimitStatus();
  } catch (err) {
    showErrorDiagnosis(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showLoadingDiagnosis() {
  $('diag-actions').style.display = 'none';
  $('sources-output').style.display = 'none';
  $('diagnosis-output').innerHTML = `
    <div style="margin-top:1rem">
      <div style="height:1.75rem;width:45%;margin-bottom:1rem" class="loading-shimmer"></div>
      <div style="height:1rem;width:100%;margin-bottom:0.5rem" class="loading-shimmer"></div>
      <div style="height:1rem;width:90%;margin-bottom:0.5rem" class="loading-shimmer"></div>
      <div style="height:1rem;width:95%;margin-bottom:1.5rem" class="loading-shimmer"></div>
      <div style="height:1rem;width:60%;margin-bottom:0.5rem" class="loading-shimmer"></div>
      <div style="height:1rem;width:80%" class="loading-shimmer"></div>
      <p style="margin-top:1.5rem;color:var(--accent-orange);font-weight:500;font-size:0.9rem">
        Querying ICMR/WHO guidelines…
      </p>
    </div>
  `;
}

function showErrorDiagnosis(msg) {
  $('diagnosis-output').innerHTML = `
    <div style="padding:1.5rem;background:#fef2f2;border:1px solid #fecaca;border-radius:14px;color:#dc2626">
      <strong>Analysis failed:</strong> ${escHtml(msg)}
      <p style="margin-top:0.5rem;font-size:0.875rem;color:#b91c1c">
        Please check your connection and try again.
      </p>
    </div>
  `;
}

function showRateLimitError(msg) {
  $('diagnosis-output').innerHTML = `
    <div style="padding:1.5rem;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;color:#d97706">
      <strong>Rate limit reached</strong><br>
      <span style="font-size:0.875rem">${escHtml(msg)}</span>
    </div>
  `;
}

// ── Render Diagnosis (handles both old and new response formats) ─────────────
function renderDiagnosis(d) {
  const output = $('diagnosis-output');

  // Check if we have structured response (new backend)
  const isStructured = d.risk_level && d.disease_name;

  if (isStructured) {
    renderStructuredDiagnosis(d);
  } else {
    renderLegacyDiagnosis(d);
  }

  // Sources
  const src = $('sources-output');
  if (d.sources && d.sources.length) {
    src.innerHTML = d.sources.map((s) => `<span class="s-badge">${escHtml(s)}</span>`).join('');
    src.style.display = 'flex';
  } else {
    src.style.display = 'none';
  }

  // Show action buttons
  $('diag-actions').style.display = 'flex';
}

function renderStructuredDiagnosis(d) {
  const riskMap = {
    EMERGENCY: { cls: 'risk-emergency', badgeCls: 'badge-emergency', label: 'EMERGENCY' },
    HIGH:      { cls: 'risk-high',      badgeCls: 'badge-high',      label: 'HIGH RISK' },
    MEDIUM:    { cls: 'risk-medium',    badgeCls: 'badge-medium',    label: 'MEDIUM RISK' },
    LOW:       { cls: 'risk-low',       badgeCls: 'badge-low',       label: 'LOW RISK' },
  };
  const risk = riskMap[d.risk_level] || riskMap.MEDIUM;

  // Action items HTML
  let actionHTML = '';
  if (d.action_items && d.action_items.length) {
    actionHTML = `
      <div class="action-items">
        <p style="font-size:0.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Action Items</p>
        ${d.action_items.map((a) => `
          <div class="action-item">
            <div class="action-dot dot-${a.urgency}"></div>
            <span style="font-size:0.9rem">${escHtml(a.step)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Warning signs HTML
  let warnHTML = '';
  if (d.warning_signs && d.warning_signs.length) {
    warnHTML = `
      <div class="warning-signs">
        <h4>⚠ Red Flag Signs — Refer immediately if any of these appear</h4>
        ${d.warning_signs.map((w) => `<div class="warning-sign-item">${escHtml(w)}</div>`).join('')}
      </div>
    `;
  }

  // Medications HTML
  let medsHTML = '';
  if (d.medications_suggested && d.medications_suggested.length) {
    medsHTML = `
      <div>
        <p style="font-size:0.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Suggested Medications</p>
        <div class="meds-pills">
          ${d.medications_suggested.map((m) => `<span class="med-pill">${escHtml(m)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // Community alert
  let alertHTML = '';
  if (d.community_alert) {
    alertHTML = `<div class="community-alert-box">🚨 ${escHtml(d.community_alert)}</div>`;
  }

  // Full diagnosis (collapsible)
  let fullDiagHTML = '';
  if (d.diagnosis) {
    const formatted = formatMarkdown(d.diagnosis);
    fullDiagHTML = `
      <div class="full-diag-section">
        <div class="full-diag-toggle" onclick="toggleFullDiag(this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          View full clinical report
        </div>
        <div class="full-diag-body" style="display:none;margin-top:1rem;font-size:0.9rem;line-height:1.7;color:var(--text-main)">${formatted}</div>
      </div>
    `;
  }

  $('diagnosis-output').innerHTML = `
    <div class="animate-up">
      <!-- Risk card -->
      <div class="risk-card ${risk.cls}">
        <span class="risk-badge ${risk.badgeCls}">${risk.label}</span>
        <span class="risk-disease-name">${escHtml(d.disease_name)}</span>
        ${d.confidence_pct ? `<span class="confidence-pill">${d.confidence_pct}% confidence</span>` : ''}
        ${d.refer_to_hospital ? `<span class="refer-hospital-badge">🏥 Refer to Hospital</span>` : ''}
      </div>
      <!-- Summary -->
      ${d.clinical_summary ? `<p style="font-size:1rem;line-height:1.7;margin-bottom:1rem;padding:1rem 1.25rem;background:rgba(0,0,0,0.02);border-left:3px solid var(--accent-orange);border-radius:0 12px 12px 0">${escHtml(d.clinical_summary)}</p>` : ''}
      ${actionHTML}
      ${warnHTML}
      ${medsHTML}
      ${alertHTML}
      ${fullDiagHTML}
    </div>
  `;
}

function renderLegacyDiagnosis(d) {
  const formatted = formatMarkdown(d.diagnosis || '');
  $('diagnosis-output').innerHTML = `<div class="animate-up"><div style="line-height:1.75;font-size:0.9375rem">${formatted}</div></div>`;
}

function toggleFullDiag(toggle) {
  const body = toggle.nextElementSibling;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  toggle.querySelector('svg').style.transform = isOpen ? '' : 'rotate(180deg)';
  toggle.querySelector('svg').style.transition = 'transform 0.2s';
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul style="padding-left:1.25rem;margin:0.5rem 0">$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(<h2>|<ul>)/, '$1')
    .replace(/^(?!<)/, '<p>')
    .replace(/(?<!>)$/, '</p>');
}

// ── TTS Playback ──────────────────────────────────────────
async function playTTS() {
  if (!state.currentDiagnosis) return;

  const btn = $('play-tts-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Generating…`;

  try {
    const text = state.currentDiagnosis.clinical_summary
      || state.currentDiagnosis.diagnosis
      || '';

    const res = await fetch(`${API_BASE}/diagnose/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: state.lang }),
    });

    if (!res.ok) throw new Error('TTS generation failed');
    const data = await res.json();
    const audio = new Audio(`${API_BASE}/${data.file_path}`);
    audio.play();
    showToast('Playing audio…', 'success');
  } catch (err) {
    showToast('Audio failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Listen`;
  }
}

// ── Referral PDF ──────────────────────────────────────────
async function generateReferral() {
  if (!state.currentDiagnosis) {
    showToast('Please run a diagnosis first.', 'warning');
    return;
  }
  if (!state.selectedPatient) {
    showToast('Please select a patient first.', 'warning');
    return;
  }

  const btn = $('gen-pdf-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const d = state.currentDiagnosis;
    const urgencyMap = { EMERGENCY: 'EMERGENCY', HIGH: 'URGENT', MEDIUM: 'ROUTINE', LOW: 'ROUTINE' };
    const payload = {
      patient_id: state.selectedPatient.id,
      diagnosis: d.diagnosis || d.disease_name || 'See attached clinical notes',
      recommendations: (d.recommendations || []).join('\n'),
      referring_doctor: 'ASHA Worker (Sahayak AI)',
      referred_to: d.refer_to_hospital ? 'District Hospital / CHC' : 'PHC / Sub-centre',
      urgency: urgencyMap[d.risk_level] || 'ROUTINE',
      notes: d.community_alert || null,
    };

    const res = await fetch(`${API_BASE}/referral/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error((await res.json()).detail || 'PDF generation failed');
    const data = await res.json();
    window.open(`${API_BASE}${data.download_url || '/' + data.file_path}`, '_blank');
    showToast('Referral PDF ready!', 'success');
  } catch (err) {
    showToast('PDF failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Referral PDF`;
  }
}

// ── Patient Management ─────────────────────────────────────
async function fetchPatients() {
  try {
    const res = await fetch(`${API_BASE}/patient/`);
    if (!res.ok) return;
    state.patients = await res.json();
    renderPatientList();
  } catch (err) {
    console.error('Failed to fetch patients:', err);
  }
}

function renderPatientList() {
  const sel = $('patient-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML =
    '<option value="">Select a patient to begin analysis…</option>' +
    state.patients
      .map(
        (p) =>
          `<option value="${p.id}">${escHtml(p.name)} (${p.age}y, ${p.gender})</option>`
      )
      .join('');
  if (prev) sel.value = prev;
  sel.removeEventListener('change', handlePatientChange);
  sel.addEventListener('change', handlePatientChange);
}

function handlePatientChange() {
  const id = parseInt($('patient-select').value);
  state.selectedPatient = state.patients.find((p) => p.id === id) || null;

  const card = $('patient-detail-card');
  const addBtn = $('add-report-btn');

  if (state.selectedPatient) {
    const p = state.selectedPatient;
    const tags = [];
    if (p.is_pregnant) tags.push(`<span style="font-size:0.7rem;background:#fce7f3;border:1px solid #fbcfe8;color:#9d174d;padding:2px 8px;border-radius:100px;font-weight:600">Pregnant</span>`);
    if (p.medical_history) tags.push(`<span style="font-size:0.7rem;background:var(--accent-pale);border:1px solid var(--accent-border);color:var(--accent-orange);padding:2px 8px;border-radius:100px;font-weight:600">Has History</span>`);

    card.innerHTML = `
      <div class="animate-up">
        <p style="font-size:1.1rem;font-weight:600;margin-bottom:0.4rem">${escHtml(p.name)}</p>
        <div style="display:flex;gap:1.25rem;font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.6rem;flex-wrap:wrap">
          <span>Age: <strong style="color:var(--text-main)">${p.age}</strong></span>
          <span>Gender: <strong style="color:var(--text-main)">${escHtml(p.gender)}</strong></span>
          ${p.village ? `<span>Village: <strong style="color:var(--text-main)">${escHtml(p.village)}</strong></span>` : ''}
        </div>
        ${tags.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:0.75rem">${tags.join('')}</div>` : ''}
        <div style="padding:0.875rem;background:rgba(0,0,0,0.02);border-radius:12px;font-size:0.8125rem;color:var(--text-muted);line-height:1.6">
          <strong style="color:var(--text-main)">History:</strong> ${escHtml(p.medical_history || 'No prior history recorded.')}
        </div>
      </div>
    `;
    if (addBtn) addBtn.style.display = 'block';
  } else {
    card.innerHTML = `<p style="color:var(--text-muted);font-style:italic;font-size:0.875rem">Select a patient to view details</p>`;
    if (addBtn) addBtn.style.display = 'none';
  }
}

// ── Patient Registration Modal ─────────────────────────────
function setupPatientModal() {
  const newBtn = $('new-patient-btn');
  const modal  = $('patient-modal');
  const form   = $('patient-form');
  const close  = $('close-modal-btn');

  if (!modal) return;

  newBtn?.addEventListener('click', () => { modal.style.display = 'flex'; });
  close?.addEventListener('click', closePatientModal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePatientModal();
  });

  form?.addEventListener('submit', registerPatient);
}

function closePatientModal() {
  const modal = $('patient-modal');
  if (modal) modal.style.display = 'none';
  $('patient-form')?.reset();
}

async function registerPatient(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Registering…';

  const payload = {
    name:            $('p-name').value.trim(),
    age:             parseInt($('p-age').value),
    gender:          $('p-gender').value,
    phone:           $('p-phone').value.trim() || null,
    village:         $('p-village').value.trim() || null,
    district:        $('p-district').value.trim() || null,
    medical_history: $('p-history').value.trim() || null,
    is_pregnant:     $('p-pregnant').checked,
  };

  try {
    const res = await fetch(`${API_BASE}/patient/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Registration failed');
    }
    const newP = await res.json();
    state.patients.unshift(newP);
    renderPatientList();
    $('patient-select').value = newP.id;
    handlePatientChange();
    closePatientModal();
    showToast(`${newP.name} registered successfully!`, 'success');
  } catch (err) {
    showToast('Registration failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Patient';
  }
}

// ── Clinical Report Modal ──────────────────────────────────
function setupReportModal() {
  const addBtn     = $('add-report-btn');
  const modal      = $('report-modal');
  const form       = $('report-form');
  const closeBtn   = $('close-report-modal');
  const manualBtn  = $('mode-manual-btn');
  const uploadBtn  = $('mode-upload-btn');
  const dropZone   = $('drop-zone');
  const fileInput  = $('report-file-input');

  if (!modal) return;

  addBtn?.addEventListener('click', () => {
    if (!state.selectedPatient) {
      showToast('Please select a patient first.', 'warning');
      return;
    }
    modal.classList.add('active');
  });

  closeBtn?.addEventListener('click', closeReportModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeReportModal();
  });

  // Mode toggle
  manualBtn?.addEventListener('click', () => {
    manualBtn.classList.add('active');
    uploadBtn.classList.remove('active');
    $('upload-section').style.display = 'none';
    form.style.display = 'block';
  });

  uploadBtn?.addEventListener('click', () => {
    uploadBtn.classList.add('active');
    manualBtn.classList.remove('active');
    $('upload-section').style.display = 'block';
    form.style.display = 'none';
  });

  // Drag and drop
  dropZone?.addEventListener('click', () => fileInput?.click());
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleReportUpload(e.dataTransfer.files[0]);
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) handleReportUpload(e.target.files[0]);
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveReport();
  });
}

function closeReportModal() {
  const modal = $('report-modal');
  if (modal) modal.classList.remove('active');
  $('report-form')?.reset();
}

async function handleReportUpload(file) {
  // Validate type
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
    showToast('Only PDF, JPG, and PNG files are supported.', 'error');
    return;
  }

  $('processing-indicator').style.display = 'flex';
  $('drop-zone').style.display = 'none';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/upload-report`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Extraction failed');
    const data = await res.json();

    // Auto-fill the form with extracted data
    if (data.vitals_bp)       $('r-bp').value       = data.vitals_bp;
    if (data.vitals_hr)       $('r-hr').value        = data.vitals_hr;
    if (data.vitals_temp)     $('r-temp').value      = data.vitals_temp;
    if (data.vitals_spo2)     $('r-spo2').value      = data.vitals_spo2;
    if (data.symptoms)        $('r-symptoms').value  = data.symptoms;
    if (data.medical_history) $('r-history').value   = data.medical_history;
    if (data.diagnosis)       $('r-diagnosis').value = data.diagnosis;
    if (data.medications)     $('r-meds').value      = data.medications;

    // Switch to manual view to let user review
    $('mode-manual-btn').classList.add('active');
    $('mode-upload-btn').classList.remove('active');
    $('report-form').style.display = 'block';
    $('upload-section').style.display = 'none';

    showToast('Report data extracted! Please review and save.', 'success');
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
  } finally {
    $('processing-indicator').style.display = 'none';
    $('drop-zone').style.display = 'flex';
  }
}

async function saveReport() {
  if (!state.selectedPatient) {
    showToast('No patient selected.', 'warning');
    return;
  }

  const btn = $('report-form').querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {
    patient_id:      state.selectedPatient.id,
    bp:              $('r-bp').value || null,
    hr:              parseInt($('r-hr').value) || null,
    temp:            $('r-temp').value || null,
    spo2:            parseInt($('r-spo2').value) || null,
    symptoms:        $('r-symptoms').value || null,
    medical_history: $('r-history').value || null,
    diagnosis:       $('r-diagnosis').value || null,
    medications:     $('r-meds').value || null,
    is_ai_extracted: 0,
  };

  try {
    const res = await fetch(`${API_BASE}/reports/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
    closeReportModal();
    showToast('Report saved successfully!', 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Clinical Findings';
  }
}

// ── View Reports Modal ─────────────────────────────────────
function setupReportsView() {
  const viewBtn   = $('view-reports-btn');
  const modal     = $('reports-view-modal');
  const closeBtn  = $('close-reports-modal');

  if (!modal) return;

  viewBtn?.addEventListener('click', async () => {
    if (!state.selectedPatient) {
      showToast('Select a patient first.', 'warning');
      return;
    }
    await loadPatientReports();
    modal.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

async function loadPatientReports() {
  const list = $('reports-list');
  list.innerHTML = `<div style="display:flex;align-items:center;gap:0.75rem;padding:1rem;color:var(--text-muted)"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div> Loading reports…</div>`;

  try {
    const res = await fetch(`${API_BASE}/patient/${state.selectedPatient.id}`);
    // Fetch reports specifically
    const rRes = await fetch(`${API_BASE}/patient/${state.selectedPatient.id}/reports`);

    let reports = [];
    if (rRes.ok) {
      reports = await rRes.json();
    }

    if (!reports.length) {
      list.innerHTML = `<p style="color:var(--text-muted);font-style:italic;font-size:0.875rem">No reports yet for ${escHtml(state.selectedPatient.name)}. Add a clinical report to get started.</p>`;
      return;
    }

    list.innerHTML = reports.map((r) => `
      <div class="report-card">
        <div class="report-card-header">
          <span class="report-date">${formatDate(r.created_at)}</span>
          ${r.is_ai_extracted ? '<span class="report-ai-badge">AI Extracted</span>' : ''}
        </div>
        <div class="report-vitals">
          ${r.bp   ? `BP: <span>${escHtml(r.bp)}</span>` : ''}
          ${r.hr   ? `HR: <span>${r.hr} BPM</span>` : ''}
          ${r.temp ? `Temp: <span>${escHtml(r.temp)}</span>` : ''}
          ${r.spo2 ? `SpO2: <span>${r.spo2}%</span>` : ''}
        </div>
        ${r.symptoms  ? `<p style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.5rem"><strong>Symptoms:</strong> ${escHtml(r.symptoms)}</p>` : ''}
        ${r.diagnosis ? `<p style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.25rem"><strong>Assessment:</strong> ${escHtml(r.diagnosis)}</p>` : ''}
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem">Could not load reports: ${escHtml(err.message)}</p>`;
  }
}

// ── Rate Limit Status ──────────────────────────────────────
async function fetchRateLimitStatus() {
  try {
    const res = await fetch(`${API_BASE}/rate-limit/status`);
    if (!res.ok) return;
    const data = await res.json();
    const pill = $('rate-limit-indicator');
    const txt  = $('rate-limit-text');
    if (!pill) return;
    if (data.remaining !== undefined) {
      pill.style.display = 'flex';
      txt.textContent = `${data.remaining} AI calls remaining today`;
      if (data.remaining <= 2) {
        pill.style.background = 'rgba(220,38,38,0.08)';
        pill.style.borderColor = 'rgba(220,38,38,0.25)';
        pill.style.color = '#dc2626';
      }
    }
  } catch {
    // Rate limit endpoint optional — don't error
  }
}

// ── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3200);
}

// ── Utils ──────────────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
