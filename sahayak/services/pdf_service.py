import os
import uuid
from datetime import datetime
from fpdf import FPDF

OUTPUT_DIR = "static/referrals"
os.makedirs(OUTPUT_DIR, exist_ok=True)


class ReferralPDF(FPDF):
    """Custom PDF layout for medical referral letters."""

    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.cell(
            0, 10, "Medical Referral Letter",
            align="C", new_x="LMARGIN", new_y="NEXT",
        )
        self.ln(5)
        self.set_draw_color(41, 128, 185)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(10)

    def footer(self):
        self.set_y(-25)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(
            0, 5,
            "This is an AI-assisted referral. Professional medical review is required.",
            align="C", new_x="LMARGIN", new_y="NEXT",
        )
        self.cell(
            0, 5,
            f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} | Page {self.page_no()}",
            align="C",
        )

    # ── helpers ───────────────────────────────────────────
    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(41, 128, 185)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.set_font("Helvetica", "", 11)

    def field(self, label: str, value: str):
        self.cell(0, 7, f"{label}: {value}", new_x="LMARGIN", new_y="NEXT")


def generate_referral_pdf(
    patient_name: str,
    patient_age: int,
    patient_gender: str,
    diagnosis: str,
    recommendations: str,
    referring_doctor: str,
    referred_to: str,
    notes: str = None,
) -> str:
    """Generate a referral letter PDF and return its file path."""
    pdf = ReferralPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=30)

    # Date
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(
        0, 8,
        f"Date: {datetime.now().strftime('%B %d, %Y')}",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(5)

    # Patient Information
    pdf.section_title("Patient Information")
    pdf.field("Name", patient_name)
    pdf.field("Age / Gender", f"{patient_age} | {patient_gender}")
    pdf.ln(5)

    # Referral Details
    pdf.section_title("Referral Details")
    pdf.field("Referring Doctor", f"Dr. {referring_doctor}")
    pdf.field("Referred To", f"Dr. {referred_to}")
    pdf.ln(5)

    # Diagnosis
    pdf.section_title("Diagnosis")
    pdf.multi_cell(0, 7, diagnosis)
    pdf.ln(5)

    # Recommendations
    pdf.section_title("Recommendations")
    pdf.multi_cell(0, 7, recommendations)
    pdf.ln(5)

    # Notes (optional)
    if notes:
        pdf.section_title("Additional Notes")
        pdf.multi_cell(0, 7, notes)

    # Save
    filename = f"referral_{uuid.uuid4().hex[:8]}.pdf"
    filepath = os.path.join(OUTPUT_DIR, filename)
    pdf.output(filepath)
    return filepath
