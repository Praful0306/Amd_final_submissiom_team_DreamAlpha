/**
 * Sahayak AI — Professional PDF Report Generator
 * Generates a full structured HTML report in a new window with charts,
 * comparison tables, trend analysis and one-click PDF download.
 */

/* ── MAIN ENTRY POINTS ─────────────────────────────────── */

// Called from patient portal — single report + all history
// Called from patient portal — single report + all history
function generatePatientPDFReport(reportId) {
  var r       = window.S && S.reports.find(function(x){ return x.id === reportId; });
  var profile = window.S && S.profile || {};
  var allReports = window.S && S.reports || [];
  if (!r) { if (window.showToast) showToast('Report not found.', 'error'); return; }
  openReportWindow(r, profile, allReports, 'patient');
}

// Called from doctor portal — pass patient object
function generateDoctorPDFReport(patientId) {
  var p = window.S && S.patients && S.patients.find(function(x){ return x.id === patientId; });
  if (!p) { if (window.showToast) showToast('Patient not found.', 'error'); return; }
  var r = p.reports[0];
  if (!r) { if (window.showToast) showToast('No reports available.', 'error'); return; }
  openReportWindow(r, p.profile || {}, p.reports, 'doctor');
}

/* ── CORE WINDOW BUILDER ───────────────────────────────── */
function openReportWindow(report, profile, allReports, mode) {
  var win = window.open('', '_blank');
  if (!win) { alert('Allow popups for this site to generate PDF reports.'); return; }
  var html = buildReportHTML(report, profile, allReports, mode);
  win.document.write(html);
  win.document.close();
}

/* ── HTML BUILDER ──────────────────────────────────────── */
function buildReportHTML(r, profile, allReports, mode) {
  var name      = profile.name || profile.full_name || 'Patient';
  var age       = profile.age  ? profile.age + ' years' : 'N/A';
  var gender    = profile.gender || 'N/A';
  var blood     = profile.blood_group || 'N/A';
  var location  = [profile.village, profile.district].filter(Boolean).join(', ') || 'N/A';
  var history   = profile.medical_history || 'None recorded';
  var genDate   = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  // Sort reports oldest → newest for charts
  var sorted = allReports.slice().sort(function(a,b){ return new Date(a.date)-new Date(b.date); });

  // Risk styling
  var riskColors = { EMERGENCY:'#dc2626', HIGH:'#c2410c', MEDIUM:'#b45309', LOW:'#15803d', NONE:'#6b7280' };
  var riskBgs    = { EMERGENCY:'#fef2f2', HIGH:'#fff7ed', MEDIUM:'#fffbeb', LOW:'#f0fdf4',  NONE:'#f9fafb' };
  var riskColor  = riskColors[r.ai_risk] || riskColors.NONE;
  var riskBg     = riskBgs[r.ai_risk]    || riskBgs.NONE;

  // Vital status helper
  function vitalStatus(key, val) {
    if (!val) return { label: 'N/A', color: '#9ca3af', bg: '#f9fafb', ok: null };
    var v = parseFloat(val);
    if (key === 'blood_sugar') {
      if (v >= 200) return { label: 'Diabetic', color: '#dc2626', bg: '#fef2f2', ok: false };
      if (v >= 126) return { label: 'Pre-Diabetic', color: '#c2410c', bg: '#fff7ed', ok: false };
      if (v >= 100) return { label: 'Borderline', color: '#b45309', bg: '#fffbeb', ok: null };
      if (v < 70)   return { label: 'Low', color: '#7c3aed', bg: '#f5f3ff', ok: false };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    if (key === 'hemoglobin') {
      var low = (profile.gender === 'Female') ? 12 : 13;
      if (v < low - 2) return { label: 'Severe Anaemia', color: '#dc2626', bg: '#fef2f2', ok: false };
      if (v < low)     return { label: 'Anaemia', color: '#c2410c', bg: '#fff7ed', ok: false };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    if (key === 'spo2') {
      if (v < 90) return { label: 'Critical', color: '#dc2626', bg: '#fef2f2', ok: false };
      if (v < 95) return { label: 'Low', color: '#c2410c', bg: '#fff7ed', ok: false };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    if (key === 'bp') {
      var sys = parseInt(String(val));
      if (sys >= 180) return { label: 'Crisis', color: '#dc2626', bg: '#fef2f2', ok: false };
      if (sys >= 140) return { label: 'High', color: '#c2410c', bg: '#fff7ed', ok: false };
      if (sys >= 130) return { label: 'Elevated', color: '#b45309', bg: '#fffbeb', ok: null };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    if (key === 'cholesterol') {
      if (v >= 240) return { label: 'High', color: '#dc2626', bg: '#fef2f2', ok: false };
      if (v >= 200) return { label: 'Borderline', color: '#b45309', bg: '#fffbeb', ok: null };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    if (key === 'hr') {
      if (v > 100) return { label: 'High', color: '#c2410c', bg: '#fff7ed', ok: false };
      if (v < 60)  return { label: 'Low', color: '#7c3aed', bg: '#f5f3ff', ok: false };
      return { label: 'Normal', color: '#15803d', bg: '#f0fdf4', ok: true };
    }
    return { label: 'Recorded', color: '#374151', bg: '#f9fafb', ok: null };
  }

  // Vital card builder
  function vitalCard(label, value, unit, key, normalRange) {
    if (!value) return '';
    var st = vitalStatus(key, value);
    return '<div style="background:' + st.bg + ';border:1.5px solid ' + st.color + '33;border-radius:12px;padding:1rem;text-align:center;min-width:130px">' +
      '<div style="font-size:.65rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.375rem">' + label + '</div>' +
      '<div style="font-size:1.625rem;font-weight:800;color:#111;letter-spacing:-1px">' + value + '</div>' +
      '<div style="font-size:.7rem;color:#6b7280;margin-top:1px">' + unit + '</div>' +
      '<div style="margin-top:.5rem;display:inline-block;background:' + st.color + ';color:#fff;font-size:.65rem;font-weight:700;padding:2px 10px;border-radius:100px">' + st.label + '</div>' +
      '<div style="font-size:.6rem;color:#9ca3af;margin-top:.375rem">Normal: ' + (normalRange||'') + '</div>' +
    '</div>';
  }

  // Comparison table between reports (all reports side by side)
  function buildComparisonTable() {
    if (sorted.length < 2) return '<p style="color:#6b7280;font-size:.875rem;text-align:center;padding:1rem 0">Only 1 report available. Upload more reports to see trend comparisons.</p>';
    var metrics = [
      { key: 'blood_sugar', label: 'Blood Sugar', unit: 'mg/dL', good: function(v){ return v < 100; }, warn: function(v){ return v < 126; } },
      { key: 'hemoglobin',  label: 'Haemoglobin', unit: 'g/dL',  good: function(v){ var l = profile.gender==='Female'?12:13; return v >= l; }, warn: function(v){ var l=profile.gender==='Female'?12:13; return v >= l-2; } },
      { key: 'bp',          label: 'Blood Pressure (Sys)', unit: 'mmHg', good: function(v){ return parseInt(v)<130; }, warn: function(v){ return parseInt(v)<140; } },
      { key: 'spo2',        label: 'SpO2', unit: '%', good: function(v){ return v >= 95; }, warn: function(v){ return v >= 90; } },
      { key: 'cholesterol', label: 'Cholesterol', unit: 'mg/dL', good: function(v){ return v < 200; }, warn: function(v){ return v < 240; } },
      { key: 'hr',          label: 'Heart Rate', unit: 'BPM', good: function(v){ return v >= 60 && v <= 100; }, warn: function(v){ return true; } },
      { key: 'weight',      label: 'Weight', unit: 'kg', good: function(){ return true; }, warn: function(){ return true; } },
    ];
    // Show max last 5 reports, newest first for display but check trend
    var showReports = allReports.slice(0, 5).reverse(); // oldest to newest
    var cols = showReports.length;
    var headerCols = showReports.map(function(rep, i) {
      var isLatest = i === cols - 1;
      return '<th style="padding:.625rem .875rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:' + (isLatest ? '#e35a2c' : '#f5f4f0') + ';color:' + (isLatest ? '#fff' : '#6b7280') + ';text-align:center;white-space:nowrap">' + fmtDateReport(rep.date) + (isLatest ? '<br><span style="font-size:.6rem;opacity:.8">LATEST</span>' : '') + '</th>';
    }).join('');
    var rows = metrics.map(function(m) {
      var hasAny = showReports.some(function(rep){ return rep[m.key]; });
      if (!hasAny) return '';
      var cells = showReports.map(function(rep, i) {
        var val = rep[m.key];
        if (!val) return '<td style="padding:.625rem .875rem;text-align:center;color:#d1d5db;font-size:.8125rem">N/A</td>';
        var numVal = parseFloat(String(val));
        var prevRep = i > 0 ? showReports[i-1] : null;
        var prevVal = prevRep ? prevRep[m.key] : null;
        // Trend arrow
        var trendHtml = '';
        if (prevVal) {
          var prevNum = parseFloat(String(prevVal));
          var diff = numVal - prevNum;
          var pct  = Math.abs(Math.round(diff/Math.abs(prevNum)*100));
          var isGood = m.key === 'hemoglobin' || m.key === 'spo2' ? diff > 0 : diff < 0;
          var isNeutral = Math.abs(diff) < 1;
          if (!isNeutral) {
            var arrowColor = isGood ? '#15803d' : '#dc2626';
            var arrow      = diff > 0 ? '&#8593;' : '&#8595;';
            trendHtml = '<span style="font-size:.6rem;color:' + arrowColor + ';font-weight:700;margin-left:3px">' + arrow + pct + '%</span>';
          }
        }
        var isLatest = i === cols - 1;
        var cellBg = '';
        if (isLatest) {
          cellBg = m.good(numVal) ? '#f0fdf4' : (!m.warn(numVal) ? '#fef2f2' : '#fffbeb');
        }
        return '<td style="padding:.625rem .875rem;text-align:center;font-size:.8125rem;font-weight:' + (isLatest?'700':'500') + ';background:' + cellBg + ';border-left:' + (isLatest?'2px solid #e35a2c':'none') + '">' + val + ' <span style="font-size:.65rem;color:#9ca3af">' + m.unit + '</span>' + trendHtml + '</td>';
      }).join('');
      // Overall trend label
      var firstValid = showReports.find(function(rep){ return rep[m.key]; });
      var lastRep    = showReports[cols-1];
      var trendLabel = '';
      if (firstValid && lastRep && firstValid !== lastRep && lastRep[m.key]) {
        var fv = parseFloat(String(firstValid[m.key]));
        var lv = parseFloat(String(lastRep[m.key]));
        var improving = m.key === 'hemoglobin' || m.key === 'spo2' ? lv > fv : lv < fv;
        var change    = Math.abs(Math.round((lv-fv)/Math.abs(fv)*100));
        var controlled = m.good(lv);
        if (controlled)  trendLabel = '<span style="background:#dcfce7;color:#15803d;font-size:.6rem;font-weight:700;padding:2px 7px;border-radius:100px">IN CONTROL</span>';
        else if (improving) trendLabel = '<span style="background:#dbeafe;color:#1d4ed8;font-size:.6rem;font-weight:700;padding:2px 7px;border-radius:100px">IMPROVING (' + change + '%)</span>';
        else             trendLabel = '<span style="background:#fef2f2;color:#dc2626;font-size:.6rem;font-weight:700;padding:2px 7px;border-radius:100px">NEEDS ATTENTION</span>';
      }
      return '<tr>' +
        '<td style="padding:.625rem .875rem;font-weight:600;font-size:.8125rem;background:#fafafa;white-space:nowrap;border-right:1px solid #e5e7eb">' + m.label + '<br>' + trendLabel + '</td>' +
        cells +
      '</tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.875rem">' +
      '<thead><tr><th style="padding:.625rem .875rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#f5f4f0;color:#6b7280;text-align:left">Metric</th>' + headerCols + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';
  }

  // Chart.js data for inline charts
  var chartLabels  = JSON.stringify(sorted.map(function(rep){ return fmtDateReport(rep.date); }));
  var sugarData    = JSON.stringify(sorted.map(function(rep){ return rep.blood_sugar || null; }));
  var hbData       = JSON.stringify(sorted.map(function(rep){ return rep.hemoglobin  || null; }));
  var bpData       = JSON.stringify(sorted.map(function(rep){ return rep.bp ? parseInt(rep.bp) : null; }));
  var cholData     = JSON.stringify(sorted.map(function(rep){ return rep.cholesterol || null; }));
  var pointCount   = sorted.length;

  // Build history table
  function buildHistoryRows() {
    return allReports.map(function(rep) {
      var rc = riskColors[rep.ai_risk] || '#6b7280';
      var rb = riskBgs[rep.ai_risk]   || '#f9fafb';
      return '<tr style="border-bottom:1px solid #f3f4f6">' +
        '<td style="padding:.625rem .875rem;font-size:.8rem;white-space:nowrap">' + fmtDateReport(rep.date) + '</td>' +
        '<td style="padding:.625rem .875rem;font-size:.8rem">' + (rep.type||'Blood Test') + '</td>' +
        '<td style="padding:.625rem .875rem;font-size:.8rem">' + (rep.hospital||'N/A') + '</td>' +
        '<td style="padding:.625rem .875rem;font-size:.8rem">' + (rep.doctor ? 'Dr. '+rep.doctor : 'N/A') + '</td>' +
        '<td style="padding:.625rem .875rem;text-align:center"><span style="background:' + rb + ';color:' + rc + ';font-size:.65rem;font-weight:700;padding:2px 10px;border-radius:100px;border:1px solid ' + rc + '33">' + (rep.ai_risk||'N/A') + '</span></td>' +
        '<td style="padding:.625rem .875rem;font-size:.8rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (rep.ai_disease||rep.diagnosis||'N/A') + '</td>' +
      '</tr>';
    }).join('');
  }

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>Sahayak AI Health Report - ' + name + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>' +
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>' +
    '<style>' +
      '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}' +
      'html{font-size:14px}' +
      'body{font-family:"Outfit",sans-serif;background:#f5f4f0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.page{max-width:900px;margin:0 auto;background:#fff}' +
      '.header{background:linear-gradient(135deg,#e35a2c 0%,#f97316 60%,#fb923c 100%);padding:2.5rem 2.5rem 2rem;color:#fff;position:relative;overflow:hidden}' +
      '.header::before{content:"";position:absolute;top:-60px;right:-60px;width:220px;height:220px;background:rgba(255,255,255,.06);border-radius:50%}' +
      '.header::after{content:"";position:absolute;bottom:-40px;right:80px;width:140px;height:140px;background:rgba(255,255,255,.04);border-radius:50%}' +
      '.logo-row{display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem;position:relative}' +
      '.logo-icon{width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.25rem}' +
      '.logo-text{font-size:1.25rem;font-weight:800;letter-spacing:-.3px}' +
      '.logo-sub{font-size:.75rem;opacity:.8;margin-top:1px}' +
      '.report-title{font-size:2rem;font-weight:900;letter-spacing:-1px;margin-bottom:.375rem;position:relative}' +
      '.report-meta{font-size:.875rem;opacity:.85;display:flex;gap:1.5rem;flex-wrap:wrap;position:relative}' +
      '.section{padding:2rem 2.5rem;border-bottom:1px solid #f3f4f6}' +
      '.section:last-child{border-bottom:none}' +
      '.section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#e35a2c;margin-bottom:1.25rem;display:flex;align-items:center;gap:.5rem}' +
      '.section-title::after{content:"";flex:1;height:1px;background:#f97316;opacity:.3}' +
      '.patient-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem}' +
      '.patient-field{background:#fafafa;border-radius:10px;padding:.75rem 1rem;border:1px solid #f3f4f6}' +
      '.patient-label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.25rem}' +
      '.patient-value{font-size:.9375rem;font-weight:700;color:#111}' +
      '.vitals-wrap{display:flex;flex-wrap:wrap;gap:1rem}' +
      '.risk-banner{border-radius:14px;padding:1.25rem 1.75rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem}' +
      '.risk-main{font-size:1.375rem;font-weight:800;letter-spacing:-.4px}' +
      '.risk-disease{font-size:.875rem;margin-top:.25rem;opacity:.85}' +
      '.risk-badge{font-size:1rem;font-weight:800;padding:.5rem 1.5rem;border-radius:100px;background:rgba(255,255,255,.3);backdrop-filter:blur(4px)}' +
      '.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}' +
      '.chart-box{background:#fafafa;border:1px solid #f3f4f6;border-radius:14px;padding:1.25rem}' +
      '.chart-title{font-size:.8125rem;font-weight:700;margin-bottom:.25rem;color:#111}' +
      '.chart-sub{font-size:.7rem;color:#9ca3af;margin-bottom:1rem}' +
      '.chart-area{position:relative;height:180px}' +
      '.ai-box{background:linear-gradient(135deg,#fff7f4,#fff);border:1.5px solid rgba(227,90,44,.2);border-radius:14px;padding:1.5rem}' +
      '.ai-label{display:inline-flex;align-items:center;gap:.375rem;background:#e35a2c;color:#fff;font-size:.65rem;font-weight:700;padding:.25rem .75rem;border-radius:100px;margin-bottom:.875rem}' +
      '.ai-text{font-size:.9rem;line-height:1.8;color:#374151}' +
      '.history-table{width:100%;border-collapse:collapse;font-size:.875rem}' +
      '.history-table th{text-align:left;padding:.625rem .875rem;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;background:#fafafa;border-bottom:2px solid #f3f4f6}' +
      '.disclaimer{background:#fafafa;border-left:3px solid #e35a2c;border-radius:0 10px 10px 0;padding:1rem 1.25rem;font-size:.8rem;color:#6b7280;line-height:1.6}' +
      '.print-bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:.75rem 1.5rem;display:flex;align-items:center;justify-content:space-between;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.06)}' +
      '.btn-print{background:#e35a2c;color:#fff;border:none;padding:.625rem 1.75rem;border-radius:100px;font-family:"Outfit",sans-serif;font-size:.875rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.5rem;box-shadow:0 4px 14px rgba(227,90,44,.3)}' +
      '.btn-print:hover{background:#c94d23}' +
      '.btn-close{background:#f5f4f0;color:#374151;border:none;padding:.625rem 1.25rem;border-radius:100px;font-family:"Outfit",sans-serif;font-size:.875rem;font-weight:600;cursor:pointer}' +
      'body{padding-top:56px}' +
      '@media print{' +
        '.print-bar{display:none!important}' +
        'body{padding-top:0!important;background:#fff!important}' +
        '.page{max-width:100%!important;box-shadow:none!important}' +
        '.section{page-break-inside:avoid}' +
        '.chart-grid{page-break-inside:avoid}' +
      '}' +
    '</style>' +
  '</head><body>' +

  /* Print Bar */
  '<div class="print-bar">' +
    '<div style="display:flex;align-items:center;gap:.75rem">' +
      '<div style="width:28px;height:28px;background:linear-gradient(135deg,#e35a2c,#f97316);border-radius:8px;display:flex;align-items:center;justify-content:center">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 4v4m0 8v4M4 12h4m8 0h4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>' +
      '</div>' +
      '<span style="font-weight:700;font-size:.9375rem">Sahayak AI Health Report</span>' +
    '</div>' +
    '<div style="display:flex;gap:.75rem">' +
      '<button class="btn-close" onclick="window.close()">Close</button>' +
      '<button class="btn-print" onclick="window.print()">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
        'Download / Print PDF' +
      '</button>' +
    '</div>' +
  '</div>' +

  /* Page Wrapper */
  '<div class="page">' +

  /* HEADER */
  '<div class="header">' +
    '<div class="logo-row">' +
      '<div class="logo-icon">&#x2695;</div>' +
      '<div><div class="logo-text">Sahayak AI</div><div class="logo-sub">Powered by LLaMA 70B &middot; ICMR/WHO Guidelines &middot; AMD Ryzen AI NPU</div></div>' +
    '</div>' +
    '<div class="report-title">Patient Health Report</div>' +
    '<div class="report-meta">' +
      '<span>&#128197; Report Date: ' + fmtDateReport(r.date) + '</span>' +
      '<span>&#127973; ' + (r.hospital||'N/A') + '</span>' +
      '<span>&#128203; ' + (r.type||'Blood Test') + '</span>' +
      '<span>&#128116; Dr. ' + (r.doctor||'N/A') + '</span>' +
      '<span style="opacity:.6;font-size:.75rem;margin-top:1px">Generated: ' + genDate + '</span>' +
    '</div>' +
  '</div>' +

  /* PATIENT INFORMATION */
  '<div class="section">' +
    '<div class="section-title">Patient Information</div>' +
    '<div class="patient-grid">' +
      '<div class="patient-field"><div class="patient-label">Full Name</div><div class="patient-value">' + esc(name) + '</div></div>' +
      '<div class="patient-field"><div class="patient-label">Age / Gender</div><div class="patient-value">' + esc(age) + ' / ' + esc(gender) + '</div></div>' +
      '<div class="patient-field"><div class="patient-label">Blood Group</div><div class="patient-value" style="color:#e35a2c">' + esc(blood) + '</div></div>' +
      '<div class="patient-field"><div class="patient-label">Location</div><div class="patient-value">' + esc(location) + '</div></div>' +
      '<div class="patient-field" style="grid-column:2/-1"><div class="patient-label">Known Medical History</div><div class="patient-value" style="font-weight:500;font-size:.875rem;line-height:1.5">' + esc(history) + '</div></div>' +
    '</div>' +
  '</div>' +

  /* AI RISK ASSESSMENT */
  '<div class="section">' +
    '<div class="section-title">AI Risk Assessment</div>' +
    '<div class="risk-banner" style="background:' + riskBg + ';border:2px solid ' + riskColor + '44;color:' + riskColor + '">' +
      '<div>' +
        '<div class="risk-main">' + esc(r.ai_disease || r.diagnosis || 'Not assessed') + '</div>' +
        '<div class="risk-disease">AI-identified condition based on ICMR Standard Treatment Guidelines</div>' +
      '</div>' +
      '<div class="risk-badge" style="background:' + riskColor + ';color:#fff">' + (r.ai_risk||'N/A') + ' RISK</div>' +
    '</div>' +
    '<div class="ai-box">' +
      '<div class="ai-label">LLaMA 70B Analysis &middot; ICMR Guidelines</div>' +
      '<div class="ai-text">' + esc(r.ai_summary || 'AI analysis was not run for this report. Go to AI Health Reports and run analysis to see insights.') + '</div>' +
    '</div>' +
  '</div>' +

  /* CURRENT VITALS */
  '<div class="section">' +
    '<div class="section-title">Current Vitals — ' + fmtDateReport(r.date) + '</div>' +
    '<div class="vitals-wrap">' +
      vitalCard('Blood Pressure', r.bp,          'mmHg',   'bp',          '< 130/80') +
      vitalCard('Blood Sugar',    r.blood_sugar,  'mg/dL',  'blood_sugar', '70 – 99') +
      vitalCard('Haemoglobin',    r.hemoglobin,   'g/dL',   'hemoglobin',  gender==='Female'?'>12':'>13') +
      vitalCard('SpO2',           r.spo2,         '%',      'spo2',        '95 – 100') +
      vitalCard('Heart Rate',     r.hr,           'BPM',    'hr',          '60 – 100') +
      vitalCard('Cholesterol',    r.cholesterol,  'mg/dL',  'cholesterol', '< 200') +
      vitalCard('Temperature',    r.temp,         '°C',     'temp',        '36 – 37.5') +
      vitalCard('Weight',         r.weight,       'kg',     'weight',      '') +
    '</div>' +
  '</div>' +

  /* TREND CHARTS */
  '<div class="section">' +
    '<div class="section-title">Health Trends — All Reports</div>' +
    '<div class="chart-grid">' +
      '<div class="chart-box">' +
        '<div class="chart-title">Blood Sugar Trend</div>' +
        '<div class="chart-sub">mg/dL over all visits &nbsp;|&nbsp; Normal: &lt;100 &nbsp; Diabetic: &ge;200</div>' +
        '<div class="chart-area"><canvas id="chartSugar"></canvas></div>' +
      '</div>' +
      '<div class="chart-box">' +
        '<div class="chart-title">Haemoglobin Trend</div>' +
        '<div class="chart-sub">g/dL over all visits &nbsp;|&nbsp; Normal: &gt;' + (gender==='Female'?'12':'13') + ' g/dL</div>' +
        '<div class="chart-area"><canvas id="chartHb"></canvas></div>' +
      '</div>' +
      '<div class="chart-box">' +
        '<div class="chart-title">Blood Pressure (Systolic)</div>' +
        '<div class="chart-sub">mmHg over all visits &nbsp;|&nbsp; Normal: &lt;130 &nbsp; High: &ge;140</div>' +
        '<div class="chart-area"><canvas id="chartBP"></canvas></div>' +
      '</div>' +
      '<div class="chart-box">' +
        '<div class="chart-title">Cholesterol Trend</div>' +
        '<div class="chart-sub">mg/dL over all visits &nbsp;|&nbsp; Normal: &lt;200 &nbsp; High: &ge;240</div>' +
        '<div class="chart-area"><canvas id="chartChol"></canvas></div>' +
      '</div>' +
    '</div>' +
  '</div>' +

  /* COMPARISON TABLE */
  '<div class="section">' +
    '<div class="section-title">Report-by-Report Comparison</div>' +
    '<p style="font-size:.8rem;color:#6b7280;margin-bottom:1rem">Each metric shows value per visit with trend arrow (up/down vs previous visit). Latest column highlighted. Control status shown on left.</p>' +
    buildComparisonTable() +
  '</div>' +

  /* CLINICAL DETAILS */
  '<div class="section">' +
    '<div class="section-title">Clinical Details — This Report</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">' +
      '<div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.5rem">Symptoms Reported</div>' +
        '<div style="font-size:.9rem;line-height:1.65;color:#374151">' + esc(r.symptoms || 'None reported') + '</div></div>' +
      '<div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.5rem">Diagnosis</div>' +
        '<div style="font-size:.9rem;line-height:1.65;color:#374151">' + esc(r.diagnosis || 'N/A') + '</div></div>' +
      '<div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.5rem">Medications Prescribed</div>' +
        '<div style="font-size:.9rem;line-height:1.65;color:#374151">' + esc(r.medications || 'None') + '</div></div>' +
      '<div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.5rem">Doctor\'s Notes</div>' +
        '<div style="font-size:.9rem;line-height:1.65;color:#374151">' + esc(r.notes || 'None') + '</div></div>' +
      (r.next_checkup ? '<div><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:.5rem">Next Checkup</div><div style="font-size:.9rem;font-weight:700;color:#e35a2c">' + esc(r.next_checkup) + '</div></div>' : '') +
    '</div>' +
  '</div>' +

  /* VISIT HISTORY TABLE */
  (allReports.length > 1 ? '<div class="section"><div class="section-title">All Visit History</div>' +
    '<div style="overflow-x:auto"><table class="history-table"><thead><tr>' +
      '<th>Date</th><th>Type</th><th>Hospital</th><th>Doctor</th><th style="text-align:center">Risk Level</th><th>Condition</th>' +
    '</tr></thead><tbody>' +
    buildHistoryRows() +
    '</tbody></table></div></div>' : '') +

  /* DISCLAIMER */
  '<div class="section">' +
    '<div class="disclaimer">' +
      '<strong>&#9888; Medical Disclaimer:</strong> This report is generated by Sahayak AI using LLaMA 70B language model grounded in ICMR (Indian Council of Medical Research) and WHO Standard Treatment Guidelines. It is intended to assist qualified medical professionals and is <strong>not a substitute for professional medical consultation, diagnosis, or treatment.</strong> Always consult a licensed physician before making any health decisions. AI analysis may have limitations and should be used as a decision-support tool only.' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;padding-top:1rem;border-top:1px solid #f3f4f6">' +
      '<div style="font-size:.75rem;color:#9ca3af">Generated by <strong style="color:#e35a2c">Sahayak AI</strong> &middot; Team DreamAlpha &middot; AMD Slingshot Hackathon 2026</div>' +
      '<div style="font-size:.75rem;color:#9ca3af">Running on AMD Ryzen AI NPU &middot; Offline &middot; Private</div>' +
    '</div>' +
  '</div>' +

  '</div>' + /* end .page */

  /* Chart.js Initialization Script */
  '<script>' +
  '(function() {' +
    'var labels = ' + chartLabels + ';' +
    'var n = labels.length;' +
    'var opts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{grid:{display:false},ticks:{font:{size:10}}}, y:{grid:{color:"rgba(0,0,0,.05)"},ticks:{font:{size:10}}} } };' +
    'function lineDs(data,color,fill){ return [{label:"Value",data:data,borderColor:color,backgroundColor:color.replace(")",",0.1)").replace("rgb","rgba"),borderWidth:2,pointRadius:4,pointBackgroundColor:color,fill:fill,tension:0.4}]; }' +

    // Sugar Chart
    'var sc = document.getElementById("chartSugar");' +
    'if(sc && window.Chart){ new Chart(sc.getContext("2d"),{ type:"line",' +
      'data:{ labels:labels, datasets:[' +
        '{ label:"Sugar",data:' + sugarData + ',borderColor:"#e35a2c",backgroundColor:"rgba(227,90,44,.1)",borderWidth:2.5,pointRadius:4,pointBackgroundColor:"#e35a2c",fill:true,tension:0.4 },' +
        '{ label:"Normal",data:Array(n).fill(100),borderColor:"#16a34a",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 },' +
        '{ label:"Diabetic",data:Array(n).fill(200),borderColor:"#dc2626",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 }' +
      '] },' +
      'options:{ responsive:true,maintainAspectRatio:false,plugins:{ legend:{ labels:{boxWidth:10,font:{size:9}} } },scales:{ x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:"rgba(0,0,0,.05)"},ticks:{font:{size:10}}} } }' +
    '}); }' +

    // Hb Chart
    'var hbc = document.getElementById("chartHb");' +
    'var hbLow = ' + (gender==='Female'?12:13) + ';' +
    'if(hbc && window.Chart){ new Chart(hbc.getContext("2d"),{ type:"line",' +
      'data:{ labels:labels, datasets:[' +
        '{ label:"Hb",data:' + hbData + ',borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,.1)",borderWidth:2.5,pointRadius:4,pointBackgroundColor:"#3b82f6",fill:true,tension:0.4 },' +
        '{ label:"Min Normal",data:Array(n).fill(hbLow),borderColor:"#d97706",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 }' +
      '] },' +
      'options:{ responsive:true,maintainAspectRatio:false,plugins:{ legend:{ labels:{boxWidth:10,font:{size:9}} } },scales:{ x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:"rgba(0,0,0,.05)"},ticks:{font:{size:10}}} } }' +
    '}); }' +

    // BP Chart
    'var bpc = document.getElementById("chartBP");' +
    'if(bpc && window.Chart){ new Chart(bpc.getContext("2d"),{ type:"line",' +
      'data:{ labels:labels, datasets:[' +
        '{ label:"Systolic",data:' + bpData + ',borderColor:"#8b5cf6",backgroundColor:"rgba(139,92,246,.1)",borderWidth:2.5,pointRadius:4,pointBackgroundColor:"#8b5cf6",fill:true,tension:0.4 },' +
        '{ label:"Normal",data:Array(n).fill(130),borderColor:"#16a34a",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 },' +
        '{ label:"High",data:Array(n).fill(140),borderColor:"#dc2626",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 }' +
      '] },' +
      'options:{ responsive:true,maintainAspectRatio:false,plugins:{ legend:{ labels:{boxWidth:10,font:{size:9}} } },scales:{ x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:"rgba(0,0,0,.05)"},ticks:{font:{size:10}}} } }' +
    '}); }' +

    // Cholesterol Chart
    'var cholc = document.getElementById("chartChol");' +
    'if(cholc && window.Chart){ new Chart(cholc.getContext("2d"),{ type:"line",' +
      'data:{ labels:labels, datasets:[' +
        '{ label:"Cholesterol",data:' + cholData + ',borderColor:"#f59e0b",backgroundColor:"rgba(245,158,11,.1)",borderWidth:2.5,pointRadius:4,pointBackgroundColor:"#f59e0b",fill:true,tension:0.4 },' +
        '{ label:"Normal",data:Array(n).fill(200),borderColor:"#16a34a",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 },' +
        '{ label:"High",data:Array(n).fill(240),borderColor:"#dc2626",borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1.5 }' +
      '] },' +
      'options:{ responsive:true,maintainAspectRatio:false,plugins:{ legend:{ labels:{boxWidth:10,font:{size:9}} } },scales:{ x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:"rgba(0,0,0,.05)"},ticks:{font:{size:10}}} } }' +
    '}); }' +

  '})();' +
  '<\/script>' +

  '</body></html>';
}

/* ── HELPERS ───────────────────────────────────────────── */
function esc(s) { if (!s && s !== 0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }
function fmtDateReport(iso) {
  if (!iso) return 'N/A';
  try { return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch(_){ return iso; }
}
