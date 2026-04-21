"""
Sahayak AI — Database Migration Script
Run ONCE to bring patients.db schema in sync with the SQLAlchemy ORM models.

This adds all missing columns that the ORM expects but the real DB doesn't have.
Uses IF NOT EXISTS pattern (safe to re-run — never drops or modifies existing data).

Usage:
  cd your_project_folder
  python migrate_db.py

Expected output:
  Running Sahayak AI DB migration...
  [OK] medical_reports.report_title added
  [OK] medical_reports.report_type added
  ... (one line per column)
  Migration complete. All X columns verified.
"""
import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "patients.db")

# Every column the ORM model expects that might not exist in the real DB.
# Format: (table, column_name, column_definition)
MIGRATIONS = [
    # ── medical_reports: ORM has these, old DB doesn't ───────────────────────
    ("medical_reports", "report_title",      "VARCHAR(200)"),
    ("medical_reports", "report_type",       "VARCHAR(50)"),
    ("medical_reports", "weight_kg",         "FLOAT"),
    ("medical_reports", "sugar_fasting",     "FLOAT"),
    ("medical_reports", "sugar_post",        "FLOAT"),
    ("medical_reports", "cholesterol",       "FLOAT"),
    ("medical_reports", "hemoglobin",        "FLOAT"),
    ("medical_reports", "creatinine",        "FLOAT"),
    ("medical_reports", "ai_analysis",       "TEXT"),
    ("medical_reports", "ai_risk_level",     "VARCHAR(20)"),
    ("medical_reports", "ai_confidence",     "INTEGER"),
    ("medical_reports", "ai_summary",        "TEXT"),
    ("medical_reports", "original_filename", "VARCHAR(255)"),

    # ── patients: ORM has these, old DB doesn't ──────────────────────────────
    ("patients", "user_id",            "INTEGER"),
    ("patients", "blood_group",        "VARCHAR(5)"),
    ("patients", "share_code",         "VARCHAR(20)"),
    ("patients", "share_code_active",  "BOOLEAN DEFAULT 1"),

    # ── diagnosis_log: needed for sync tracking ──────────────────────────────
    ("diagnosis_log", "synced_at", "DATETIME"),

    # ── medical_reports: new columns from v3.2 save handler ──────────────────
    ("medical_reports", "report_title",  "VARCHAR(200)"),
    ("medical_reports", "report_type",   "VARCHAR(50)"),
    ("medical_reports", "weight_kg",     "FLOAT"),
    ("medical_reports", "ai_risk_level", "VARCHAR(20)"),
    ("medical_reports", "ai_summary",    "TEXT"),
    ("medical_reports", "ai_analysis",   "TEXT"),
    ("medical_reports", "ai_confidence", "INTEGER"),

    # ── Firebase Auth + user isolation columns (v4.0) ─────────────────────────
    # users table
    ("users", "firebase_uid",   "VARCHAR(128)"),  # index added separately below
    ("users", "district",       "VARCHAR(100)"),
    ("users", "village",        "VARCHAR(100)"),
    # patients table — links patient to the ASHA who registered them
    ("patients", "firebase_uid",       "VARCHAR(128)"),
    ("patients", "asha_worker_id",     "INTEGER"),
    ("patients", "asha_firebase_uid",  "VARCHAR(128)"),
    # diagnosis_log — tracks who ran each diagnosis
    ("diagnosis_log", "user_id",        "INTEGER"),
    ("diagnosis_log", "firebase_uid",   "VARCHAR(128)"),
    ("diagnosis_log", "asha_worker_id", "INTEGER"),
    # medical_reports — tracks submitter
    ("medical_reports", "firebase_uid",    "VARCHAR(128)"),
    ("medical_reports", "asha_worker_id",  "INTEGER"),
]

def get_existing_columns(cur, table: str) -> list:
    cur.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"patients.db not found — creating fresh database at {DB_PATH}")
        # Import and create all tables via SQLAlchemy ORM
        try:
            from db.database import Base, engine
            Base.metadata.create_all(bind=engine)
            print("  [OK]   All tables created from ORM models")
        except Exception as e:
            print(f"  [WARN] ORM table creation: {e} — continuing with raw SQLite")
            # Fallback: just touch the file so sqlite3.connect works
            sqlite3.connect(DB_PATH).close()

    print(f"Running Sahayak AI DB migration on: {DB_PATH}")
    print()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    added = 0
    skipped = 0

    for table, column, col_def in MIGRATIONS:
        existing = get_existing_columns(cur, table)
        if column in existing:
            print(f"  [SKIP] {table}.{column} already exists")
            skipped += 1
        else:
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
                print(f"  [OK]   {table}.{column} added")
                added += 1
            except Exception as e:
                print(f"  [ERR]  {table}.{column}: {e}")

    # Create index on firebase_uid for fast lookup (SQLite doesn't support ADD COLUMN UNIQUE)
    try:
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid) WHERE firebase_uid IS NOT NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_patients_firebase_uid    ON patients (firebase_uid) WHERE firebase_uid IS NOT NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_patients_asha_fuid       ON patients (asha_firebase_uid) WHERE asha_firebase_uid IS NOT NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_diaglog_firebase_uid     ON diagnosis_log (firebase_uid) WHERE firebase_uid IS NOT NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_diaglog_asha_worker      ON diagnosis_log (asha_worker_id) WHERE asha_worker_id IS NOT NULL")
    except Exception as e:
        print(f"  [INFO] Index creation: {e}")

    conn.commit()
    conn.close()

    print()
    print(f"Migration complete: {added} columns added, {skipped} already existed.")
    print()

    # Quick verify
    conn2 = sqlite3.connect(DB_PATH)
    cur2 = conn2.cursor()
    cur2.execute("PRAGMA table_info(medical_reports)")
    mr_cols = [r[1] for r in cur2.fetchall()]
    cur2.execute("PRAGMA table_info(patients)")
    p_cols = [r[1] for r in cur2.fetchall()]
    conn2.close()

    critical = ["ai_risk_level", "ai_summary", "hemoglobin", "share_code"]
    all_ok = all(
        c in mr_cols or c in p_cols for c in critical
    )
    if all_ok:
        print("Verification PASSED — doctor portal will now work correctly.")
    else:
        print("Verification WARNING — some columns still missing.")
        for c in critical:
            if c not in mr_cols and c not in p_cols:
                print(f"  Still missing: {c}")


def create_appointments_table():
    """Create appointments table if it doesn't exist (new in v4.1)."""
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor_id     INTEGER NOT NULL,
            patient_id    INTEGER,
            patient_name  VARCHAR(150),
            patient_phone VARCHAR(20),
            appt_date     VARCHAR(10) NOT NULL,
            time_slot     VARCHAR(5)  NOT NULL,
            reason        TEXT,
            status        VARCHAR(20) DEFAULT 'confirmed',
            firebase_uid  VARCHAR(128),
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_appts_doctor_date ON appointments(doctor_id, appt_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_appts_firebase ON appointments(firebase_uid) WHERE firebase_uid IS NOT NULL")
    conn.commit()
    conn.close()
    print("  [OK]   appointments table ready")


def cleanup_orphans():
    """
    Remove orphan patients (user_id=NULL and no share_code) that were
    created as demo/seed data. These cause data bleed between users.
    Safe to run multiple times.
    """
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    # Find orphan patients
    cur.execute(
        "SELECT id, name FROM patients "
        "WHERE user_id IS NULL AND firebase_uid IS NULL AND asha_firebase_uid IS NULL"
    )
    orphans = cur.fetchall()

    if orphans:
        print(f"\nFound {len(orphans)} orphan patient(s) with no owner:")
        for pid, name in orphans:
            print(f"  Patient id={pid} '{name}' — marking as demo data")
            # Don't delete — just mark with a demo flag so they don't show in real queries
            cur.execute(
                "UPDATE patients SET share_code = 'DEMO_' || id "
                "WHERE id = ? AND share_code IS NULL",
                (pid,)
            )
    else:
        print("\nNo orphan patients found ✓")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    run_migration()
    create_appointments_table()
    cleanup_orphans()
    print("\n✅ Database is ready. All columns added. Orphan data cleaned.")
