/**
 * Sahayak AI — PDF Report Generator
 * Generates a professional medical report PDF using jsPDF (client-side, no server needed).
 */
import jsPDF from "jspdf"
import type { MedicalReport, Patient } from "./api"

function formatDateShort(dt?: string | null) {
  if (!dt) return "—"
  try { return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) }
  catch { return dt }
}

function riskColor(level?: string | null): [number, number, number] {
  switch (level) {
    case "EMERGENCY": return [239, 68, 68]
    case "HIGH":      return [249, 115, 22]
    case "MEDIUM":    return [234, 179, 8]
    case "LOW":       return [34, 197, 94]
    default:          return [107, 114, 128]
  }
}

export function downloadPatientReportPDF(
  patient: Patient,
  reports: MedicalReport[],
  reportIndex?: number
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const w = 210
  const margin = 18
  let y = margin

  // ── Header band ──────────────────────────────────────────────────────────────
  doc.setFillColor(249, 115, 22)
  doc.rect(0, 0, w, 22, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("SAHAYAK AI — MEDICAL REPORT", margin, 14)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, w - margin, 14, { align: "right" })
  y = 30

  // ── Patient info ──────────────────────────────────────────────────────────────
  doc.setTextColor(20, 20, 20)
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text(patient.name ?? "Patient", margin, y)
  y += 6

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(80, 80, 80)
  const infoLine = [
    patient.age ? `${patient.age} yrs` : null,
    patient.gender === "F" ? "Female" : patient.gender === "M" ? "Male" : null,
    patient.blood_group ? `Blood: ${patient.blood_group}` : null,
    patient.village ? `📍 ${patient.village}${patient.district ? ", " + patient.district : ""}` : null,
    patient.phone ? `📞 ${patient.phone}` : null,
  ].filter(Boolean).join("  ·  ")
  doc.text(infoLine, margin, y)
  y += 5

  // Risk badge
  const [r, g, b] = riskColor(patient.risk_level)
  doc.setFillColor(r, g, b)
  doc.roundedRect(margin, y, 28, 6, 2, 2, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.text(patient.risk_level ?? "LOW", margin + 14, y + 4.2, { align: "center" })

  if (patient.health_score !== undefined && patient.health_score !== null) {
    doc.setFillColor(230, 230, 230)
    doc.roundedRect(margin + 32, y, 32, 6, 2, 2, "F")
    doc.setTextColor(40, 40, 40)
    doc.text(`Health Score: ${patient.health_score}/100`, margin + 48, y + 4.2, { align: "center" })
  }
  y += 12

  // Separator
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, w - margin, y)
  y += 6

  // Medical history
  if (patient.medical_history) {
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(60, 60, 60)
    doc.text("Medical History", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setTextColor(80, 80, 80)
    const histLines = doc.splitTextToSize(patient.medical_history, w - margin * 2)
    doc.text(histLines, margin, y)
    y += histLines.length * 4 + 4
  }

  // Current diagnosis
  if (patient.diagnosis) {
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(60, 60, 60)
    doc.text("Current Diagnosis", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setTextColor(249, 115, 22)
    doc.text(patient.diagnosis, margin, y)
    y += 8
  }

  // ── Reports ───────────────────────────────────────────────────────────────────
  const reportsList = reportIndex !== undefined ? [reports[reportIndex]] : reports
  if (reportsList.length === 0) {
    doc.setTextColor(120, 120, 120)
    doc.setFontSize(9)
    doc.text("No reports on file.", margin, y)
  } else {
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(20, 20, 20)
    doc.text(reportIndex !== undefined ? "Report Details" : `Clinical Reports (${reportsList.length})`, margin, y)
    y += 6

    reportsList.forEach((rep, idx) => {
      if (y > 260) { doc.addPage(); y = 20 }

      // Report header
      doc.setFillColor(245, 245, 245)
      doc.rect(margin, y - 3, w - margin * 2, 8, "F")
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(40, 40, 40)
      doc.text(`Report ${idx + 1}: ${rep.diagnosis ?? "General Assessment"}`, margin + 2, y + 2)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 100, 100)
      doc.text(formatDateShort(rep.created_at), w - margin, y + 2, { align: "right" })
      y += 10

      // Vitals table
      const vitals = [
        ["Heart Rate", rep.heart_rate ? `${rep.heart_rate} bpm` : "—", rep.heart_rate && rep.heart_rate > 100 ? "⚠ Elevated" : "Normal"],
        ["SpO₂",       rep.spo2 ? `${rep.spo2}%` : "—",               rep.spo2 && rep.spo2 < 95 ? "⚠ Low" : "Normal"],
        ["Temperature",rep.temperature ? `${rep.temperature}°C` : "—", rep.temperature && rep.temperature > 38 ? "⚠ Fever" : "Normal"],
        ["Blood Pressure", rep.bp_systolic ? `${rep.bp_systolic}/${rep.bp_diastolic} mmHg` : "—",
         rep.bp_systolic && rep.bp_systolic > 140 ? "⚠ High" : "Normal"],
      ]

      const colW = (w - margin * 2) / 3
      doc.setFontSize(8)
      // Header row
      doc.setFillColor(60, 60, 60)
      doc.rect(margin, y - 2, w - margin * 2, 6, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFont("helvetica", "bold")
      ;["Vital Sign", "Value", "Status"].forEach((h, ci) => doc.text(h, margin + ci * colW + 2, y + 2))
      y += 7
      doc.setFont("helvetica", "normal")

      vitals.forEach(([label, val, status], vi) => {
        if (vi % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(margin, y - 2, w - margin * 2, 6, "F") }
        doc.setTextColor(40, 40, 40)
        doc.text(label, margin + 2, y + 2)
        doc.text(val, margin + colW + 2, y + 2)
        if (status.startsWith("⚠")) {
          doc.setTextColor(220, 100, 0)
        } else {
          doc.setTextColor(34, 150, 80)
        }
        doc.text(status, margin + colW * 2 + 2, y + 2)
        y += 6
      })

      // Risk level for this report
      if (rep.risk_level) {
        const [rr, rg, rb] = riskColor(rep.risk_level)
        doc.setFillColor(rr, rg, rb)
        doc.roundedRect(margin, y + 2, 22, 5, 1, 1, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(7)
        doc.text(rep.risk_level, margin + 11, y + 5.5, { align: "center" })
        doc.setFont("helvetica", "normal")
        doc.setTextColor(80, 80, 80)
      }
      y += 12
    })
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(
      "Sahayak AI — Powered by AMD Ryzen AI NPU · ICMR-Grounded Clinical Engine · Confidential Medical Record",
      w / 2,
      293,
      { align: "center" }
    )
    doc.text(`Page ${i} of ${totalPages}`, w - margin, 293, { align: "right" })
  }

  const fileName = `sahayak_${(patient.name ?? "patient").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(fileName)
}
