"""
Sahayak AI — Reliable outbox sync service (SQLite → Supabase).

Local SQLite remains the source of truth.
Every important mutation is written locally first and queued in `local_changes`.
When connectivity and Supabase are available, queued changes are replayed to a
single remote staging table `sahayak_sync_events` using idempotent upserts.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from threading import Lock
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import create_engine, text

from db.database import engine

logger = logging.getLogger("sahayak.sync")

REMOTE_TABLE = "sahayak_sync_events"
SYNC_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC_WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(SYNC_BASE_DIR)))
SYNC_RUNTIME_DIR = (
    os.getenv("SAHAYAK_RUNTIME_DIR", "").strip()
    or os.path.join(
        SYNC_WORKSPACE_DIR,
        "_runtime",
        "sahayak",
    )
)
SYNC_QUEUE_DB_URL = (
    "sqlite:///"
    + os.path.join(
        SYNC_RUNTIME_DIR,
        "sync_outbox.db",
    ).replace(os.sep, "/")
)
SYNC_FALLBACK_FILE = os.path.join(SYNC_RUNTIME_DIR, "sync_outbox_fallback.json")
_fallback_lock = Lock()
sync_engine = create_engine(
    SYNC_QUEUE_DB_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_local_sync_schema() -> bool:
    try:
        with sync_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS local_changes ("
                    "id INTEGER PRIMARY KEY, "
                    "change_key TEXT NOT NULL UNIQUE, "
                    "entity_type TEXT NOT NULL, "
                    "entity_id INTEGER, "
                    "operation TEXT NOT NULL, "
                    "payload_json TEXT NOT NULL, "
                    "patient_id INTEGER, "
                    "actor_id INTEGER, "
                    "actor_role TEXT, "
                    "district TEXT, "
                    "village TEXT, "
                    "sync_status TEXT NOT NULL DEFAULT 'pending', "
                    "retry_count INTEGER NOT NULL DEFAULT 0, "
                    "last_error TEXT, "
                    "created_at TEXT NOT NULL, "
                    "updated_at TEXT NOT NULL, "
                    "last_attempt_at TEXT, "
                    "synced_at TEXT"
                    ")"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_local_changes_status "
                    "ON local_changes(sync_status)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_local_changes_entity "
                    "ON local_changes(entity_type, entity_id)"
                )
            )
        return True
    except Exception as exc:
        logger.warning("Local sync schema unavailable: %s", exc)
        return False


def _default_file_store() -> dict[str, Any]:
    return {"version": 1, "changes": {}}


def _ensure_file_store() -> bool:
    try:
        os.makedirs(os.path.dirname(SYNC_FALLBACK_FILE), exist_ok=True)
        if not os.path.exists(SYNC_FALLBACK_FILE):
            _write_file_store(_default_file_store())
        return True
    except Exception as exc:
        logger.warning("File-backed sync store unavailable: %s", exc)
        return False


def _load_file_store() -> dict[str, Any]:
    if not _ensure_file_store():
        raise RuntimeError("file sync store unavailable")
    try:
        with open(SYNC_FALLBACK_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        corrupt_path = f"{SYNC_FALLBACK_FILE}.corrupt-{int(_utcnow().timestamp())}"
        try:
            os.replace(SYNC_FALLBACK_FILE, corrupt_path)
        except Exception:
            logger.warning("Failed to rotate corrupt sync store: %s", SYNC_FALLBACK_FILE)
        logger.warning("Corrupt file-backed sync store moved to %s: %s", corrupt_path, exc)
        data = _default_file_store()
        _write_file_store(data)
    except FileNotFoundError:
        data = _default_file_store()
        _write_file_store(data)

    if not isinstance(data, dict):
        data = _default_file_store()
    if not isinstance(data.get("changes"), dict):
        data["changes"] = {}
    data.setdefault("version", 1)
    return data


def _write_file_store(data: dict[str, Any]) -> None:
    directory = os.path.dirname(SYNC_FALLBACK_FILE)
    os.makedirs(directory, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix="sync_outbox_", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=True, indent=2, sort_keys=True)
        try:
            os.replace(temp_path, SYNC_FALLBACK_FILE)
        except OSError:
            with open(SYNC_FALLBACK_FILE, "w", encoding="utf-8") as fallback_fh:
                json.dump(data, fallback_fh, ensure_ascii=True, indent=2, sort_keys=True)
            try:
                os.unlink(temp_path)
            except OSError:
                pass
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def _sync_store_mode() -> str:
    if _ensure_local_sync_schema():
        return "sqlite"
    if _ensure_file_store():
        return "file"
    return "unavailable"


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").strip()


def _supabase_key() -> str:
    return os.getenv("SUPABASE_KEY", "").strip()


def supabase_configured() -> bool:
    return bool(_supabase_url() and _supabase_key())


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _status_from_records(
    records: list[dict[str, Any]],
    *,
    store_mode: str,
    unavailable_message: Optional[str] = None,
) -> dict[str, Any]:
    counts: dict[str, int] = {}
    last_synced_at: Optional[str] = None
    for record in records:
        sync_status = str(record.get("sync_status") or "pending")
        counts[sync_status] = counts.get(sync_status, 0) + 1
        synced_at = record.get("synced_at")
        if synced_at and (last_synced_at is None or str(synced_at) > str(last_synced_at)):
            last_synced_at = str(synced_at)

    status = "ready" if supabase_configured() else "not_configured"
    if store_mode == "unavailable":
        status = "degraded"

    response = {
        "status": status,
        "supabase_configured": supabase_configured(),
        "pending": counts.get("pending", 0),
        "failed": counts.get("failed", 0),
        "syncing": counts.get("syncing", 0),
        "synced": counts.get("synced", 0),
        "last_synced_at": last_synced_at,
        "remote_table": REMOTE_TABLE,
        "setup_sql": get_setup_sql(),
        "local_store": store_mode,
    }
    if unavailable_message:
        response["message"] = unavailable_message
    elif store_mode == "file":
        response["message"] = "Using file-backed sync queue fallback on this device."
    return response


def _sqlite_pending_rows(batch_size: int):
    with sync_engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT id, change_key, entity_type, entity_id, operation, payload_json, patient_id, "
                "actor_id, actor_role, district, village, created_at, updated_at, retry_count "
                "FROM local_changes WHERE sync_status IN ('pending', 'failed') "
                "ORDER BY updated_at ASC LIMIT :limit"
            ),
            {"limit": batch_size},
        ).fetchall()


def _file_records() -> list[dict[str, Any]]:
    with _fallback_lock:
        store = _load_file_store()
        return list(store["changes"].values())


def _get_supabase_client():
    url = _supabase_url()
    key = _supabase_key()
    if not url or not key:
        return None
    try:
        from supabase import create_client

        return create_client(url, key)
    except ImportError:
        logger.warning("supabase-py not installed. Add `supabase` to requirements.txt.")
        return None
    except Exception as exc:
        logger.error("Supabase client init failed: %s", exc)
        return None


def get_setup_sql() -> str:
    return (
        "create table if not exists public.sahayak_sync_events ("
        "id bigserial primary key, "
        "change_key text not null unique, "
        "entity_type text not null, "
        "entity_id bigint, "
        "operation text not null, "
        "payload jsonb not null, "
        "patient_id bigint, "
        "actor_id bigint, "
        "actor_role text, "
        "district text, "
        "village text, "
        "source text not null default 'sahayak-sqlite', "
        "local_created_at timestamptz, "
        "local_updated_at timestamptz, "
        "synced_at timestamptz not null default now()"
        "); "
        "create index if not exists idx_sahayak_sync_events_entity "
        "on public.sahayak_sync_events(entity_type, entity_id);"
    )


def _row_to_dict(row, columns: list[str]) -> dict[str, Any]:
    return {col: _serialize_value(val) for col, val in zip(columns, row)}


def _fetch_one(query: str, params: dict[str, Any], columns: list[str]) -> Optional[dict[str, Any]]:
    with engine.connect() as conn:
        row = conn.execute(text(query), params).fetchone()
    if not row:
        return None
    return _row_to_dict(row, columns)


def _snapshot_user(user_id: int) -> Optional[dict[str, Any]]:
    cols = [
        "id", "email", "full_name", "role", "is_active", "firebase_uid",
        "specialization", "registration_num", "hospital", "district",
        "village", "created_at",
    ]
    return _fetch_one(
        "SELECT id, email, full_name, role, is_active, firebase_uid, "
        "specialization, registration_num, hospital, district, village, created_at "
        "FROM users WHERE id = :id",
        {"id": user_id},
        cols,
    )


def _snapshot_patient(patient_id: int) -> Optional[dict[str, Any]]:
    cols = [
        "id", "user_id", "name", "age", "gender", "phone", "email", "village",
        "district", "medical_history", "is_pregnant", "weight_kg", "blood_group",
        "share_code", "share_code_active", "firebase_uid", "asha_worker_id",
        "asha_firebase_uid", "created_at", "updated_at",
    ]
    return _fetch_one(
        "SELECT id, user_id, name, age, gender, phone, email, village, district, "
        "medical_history, is_pregnant, weight_kg, blood_group, share_code, "
        "share_code_active, firebase_uid, asha_worker_id, asha_firebase_uid, "
        "created_at, updated_at "
        "FROM patients WHERE id = :id",
        {"id": patient_id},
        cols,
    )


def _snapshot_report(report_id: int) -> Optional[dict[str, Any]]:
    cols = [
        "id", "patient_id", "report_title", "report_type", "bp", "hr", "temp",
        "spo2", "weight_kg", "sugar_fasting", "sugar_post", "cholesterol",
        "hemoglobin", "creatinine", "symptoms", "medical_history", "diagnosis",
        "medications", "notes", "risk_level", "ai_analysis", "ai_risk_level",
        "ai_confidence", "ai_summary", "file_path", "original_filename",
        "is_ai_extracted", "created_at",
    ]
    return _fetch_one(
        "SELECT id, patient_id, report_title, report_type, bp, hr, temp, spo2, "
        "weight_kg, sugar_fasting, sugar_post, cholesterol, hemoglobin, creatinine, "
        "symptoms, medical_history, diagnosis, medications, notes, risk_level, "
        "ai_analysis, ai_risk_level, ai_confidence, ai_summary, file_path, "
        "original_filename, is_ai_extracted, created_at "
        "FROM medical_reports WHERE id = :id",
        {"id": report_id},
        cols,
    )


def _snapshot_diagnosis(diagnosis_id: int) -> Optional[dict[str, Any]]:
    cols = [
        "id", "patient_id", "district", "disease_name", "risk_level",
        "confidence_pct", "user_id", "firebase_uid", "asha_worker_id",
        "created_at", "synced_at",
    ]
    return _fetch_one(
        "SELECT id, patient_id, district, disease_name, risk_level, confidence_pct, "
        "user_id, firebase_uid, asha_worker_id, created_at, synced_at "
        "FROM diagnosis_log WHERE id = :id",
        {"id": diagnosis_id},
        cols,
    )


def _snapshot_appointment(appointment_id: int) -> Optional[dict[str, Any]]:
    cols = [
        "id", "doctor_id", "patient_id", "patient_name", "patient_phone", "appt_date",
        "time_slot", "reason", "status", "is_manual", "firebase_uid",
        "created_at", "updated_at",
    ]
    return _fetch_one(
        "SELECT id, doctor_id, patient_id, patient_name, patient_phone, appt_date, "
        "time_slot, reason, status, COALESCE(is_manual, 0), firebase_uid, "
        "created_at, updated_at "
        "FROM appointments WHERE id = :id",
        {"id": appointment_id},
        cols,
    )


def _snapshot_doctor_access(doctor_id: int, patient_id: int) -> Optional[dict[str, Any]]:
    cols = ["doctor_id", "patient_id", "is_active", "granted_at"]
    return _fetch_one(
        "SELECT doctor_id, patient_id, COALESCE(is_active, 1), granted_at "
        "FROM doctor_patient_access WHERE doctor_id = :doctor_id AND patient_id = :patient_id",
        {"doctor_id": doctor_id, "patient_id": patient_id},
        cols,
    )


def _entity_payload(entity_type: str, entity_id: int, extra: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
    payload: Optional[dict[str, Any]]
    if entity_type == "user":
        payload = _snapshot_user(entity_id)
    elif entity_type == "patient":
        payload = _snapshot_patient(entity_id)
    elif entity_type == "medical_report":
        payload = _snapshot_report(entity_id)
    elif entity_type == "diagnosis":
        payload = _snapshot_diagnosis(entity_id)
    elif entity_type == "appointment":
        payload = _snapshot_appointment(entity_id)
    else:
        payload = None

    if payload and extra:
        payload.update(extra)
    return payload


def record_local_change(
    entity_type: str,
    entity_id: Optional[int],
    operation: str,
    payload: dict[str, Any],
    *,
    patient_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    change_key: Optional[str] = None,
) -> None:
    if not payload:
        return
    store_mode = _sync_store_mode()
    if store_mode == "unavailable":
        logger.error("Sync queue unavailable; change for %s was not queued", entity_type)
        return

    key = change_key or f"{entity_type}:{entity_id or 'new'}"
    now = _utcnow().isoformat()
    payload_json = json.dumps(payload, ensure_ascii=True, default=str)

    if store_mode == "sqlite":
        with sync_engine.begin() as conn:
            existing = conn.execute(
                text("SELECT id, retry_count FROM local_changes WHERE change_key = :key"),
                {"key": key},
            ).fetchone()

            values = {
                "key": key,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "operation": operation,
                "payload_json": payload_json,
                "patient_id": patient_id,
                "actor_id": actor_id,
                "actor_role": actor_role,
                "district": district,
                "village": village,
                "now": now,
            }

            if existing:
                conn.execute(
                    text(
                        "UPDATE local_changes SET entity_type=:entity_type, entity_id=:entity_id, "
                        "operation=:operation, payload_json=:payload_json, patient_id=:patient_id, "
                        "actor_id=:actor_id, actor_role=:actor_role, district=:district, village=:village, "
                        "sync_status='pending', last_error=NULL, updated_at=:now "
                        "WHERE change_key=:key"
                    ),
                    values,
                )
            else:
                conn.execute(
                    text(
                        "INSERT INTO local_changes (change_key, entity_type, entity_id, operation, payload_json, "
                        "patient_id, actor_id, actor_role, district, village, sync_status, retry_count, created_at, updated_at) "
                        "VALUES (:key, :entity_type, :entity_id, :operation, :payload_json, :patient_id, :actor_id, "
                        ":actor_role, :district, :village, 'pending', 0, :now, :now)"
                    ),
                    values,
                )
        return

    with _fallback_lock:
        store = _load_file_store()
        existing = store["changes"].get(key, {})
        store["changes"][key] = {
            "id": existing.get("id") or key,
            "change_key": key,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "operation": operation,
            "payload_json": payload_json,
            "patient_id": patient_id,
            "actor_id": actor_id,
            "actor_role": actor_role,
            "district": district,
            "village": village,
            "sync_status": "pending",
            "retry_count": int(existing.get("retry_count", 0)),
            "last_error": None,
            "created_at": existing.get("created_at") or now,
            "updated_at": now,
            "last_attempt_at": existing.get("last_attempt_at"),
            "synced_at": None,
        }
        _write_file_store(store)


def queue_snapshot_change(
    entity_type: str,
    entity_id: int,
    *,
    operation: str = "upsert",
    patient_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
) -> None:
    payload = _entity_payload(entity_type, entity_id)
    if not payload:
        return

    patient_id = patient_id if patient_id is not None else payload.get("patient_id")
    district = district if district is not None else payload.get("district")
    village = village if village is not None else payload.get("village")
    record_local_change(
        entity_type,
        entity_id,
        operation,
        payload,
        patient_id=patient_id,
        actor_id=actor_id,
        actor_role=actor_role,
        district=district,
        village=village,
    )


def queue_doctor_access_change(
    doctor_id: int,
    patient_id: int,
    *,
    actor_id: Optional[int] = None,
    actor_role: Optional[str] = None,
) -> None:
    payload = _snapshot_doctor_access(doctor_id, patient_id)
    if not payload:
        return
    record_local_change(
        "doctor_patient_access",
        patient_id,
        "upsert",
        payload,
        patient_id=patient_id,
        actor_id=actor_id,
        actor_role=actor_role,
        change_key=f"doctor_patient_access:{doctor_id}:{patient_id}",
    )


def queue_deleted_entity(
    entity_type: str,
    entity_id: int,
    *,
    patient_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor_role: Optional[str] = None,
) -> None:
    record_local_change(
        entity_type,
        entity_id,
        "delete",
        {"id": entity_id, "deleted": True, "deleted_at": _utcnow().isoformat()},
        patient_id=patient_id,
        actor_id=actor_id,
        actor_role=actor_role,
    )


def get_sync_status() -> dict[str, Any]:
    store_mode = _sync_store_mode()
    if store_mode == "sqlite":
        with sync_engine.connect() as conn:
            rows = conn.execute(
                text("SELECT sync_status, COUNT(*) FROM local_changes GROUP BY sync_status")
            ).fetchall()
            latest = conn.execute(
                text("SELECT MAX(synced_at) FROM local_changes WHERE synced_at IS NOT NULL")
            ).scalar()

        counts = {status: count for status, count in rows}
        return {
            "status": "ready" if supabase_configured() else "not_configured",
            "supabase_configured": supabase_configured(),
            "pending": counts.get("pending", 0),
            "failed": counts.get("failed", 0),
            "syncing": counts.get("syncing", 0),
            "synced": counts.get("synced", 0),
            "last_synced_at": _serialize_value(latest),
            "remote_table": REMOTE_TABLE,
            "setup_sql": get_setup_sql(),
            "local_store": "sqlite",
        }

    if store_mode == "file":
        return _status_from_records(_file_records(), store_mode="file")

    return _status_from_records(
        [],
        store_mode="unavailable",
        unavailable_message="Local sync queue is unavailable on this device right now.",
    )


async def sync_to_government(batch_size: int = 100) -> dict[str, Any]:
    store_mode = _sync_store_mode()
    if store_mode == "unavailable":
        return {
            **_status_from_records(
                [],
                store_mode="unavailable",
                unavailable_message="Local sync queue is unavailable, so nothing was pushed.",
            ),
            "records_found": 0,
            "records_pushed": 0,
        }
    client = _get_supabase_client()
    status = get_sync_status()

    if store_mode == "sqlite":
        pending = _sqlite_pending_rows(batch_size)
    else:
        pending = sorted(
            [
                record
                for record in _file_records()
                if record.get("sync_status") in {"pending", "failed"}
            ],
            key=lambda record: str(record.get("updated_at") or record.get("created_at") or ""),
        )[:batch_size]

    if not pending:
        return {
            **status,
            "status": "nothing_to_sync" if status["supabase_configured"] else status["status"],
            "records_found": 0,
            "records_pushed": 0,
            "message": "No pending local changes to sync.",
        }

    if not client:
        return {
            **status,
            "records_found": len(pending),
            "records_pushed": 0,
            "message": "Supabase not configured. Local data is safe and queued for later sync.",
        }

    # Verify remote table exists before mutating local status.
    try:
        client.table(REMOTE_TABLE).select("id").limit(1).execute()
    except Exception as exc:
        err = str(exc)
        if "does not exist" in err.lower() or "PGRST205" in err or "schema cache" in err.lower():
            return {
                **status,
                "status": "table_missing",
                "records_found": len(pending),
                "records_pushed": 0,
                "message": f"Supabase table `{REMOTE_TABLE}` is missing.",
                "setup_sql": get_setup_sql(),
            }
        return {
            **status,
            "status": "error",
            "records_found": len(pending),
            "records_pushed": 0,
            "error": err,
            "message": "Supabase connectivity check failed.",
        }

    pushed = 0
    errors = 0
    now = _utcnow().isoformat()
    if store_mode == "sqlite":
        with sync_engine.begin() as conn:
            for row in pending:
                row_id = row[0]
                change_key = row[1]
                payload = json.loads(row[5])
                remote_record = {
                    "change_key": change_key,
                    "entity_type": row[2],
                    "entity_id": row[3],
                    "operation": row[4],
                    "payload": payload,
                    "patient_id": row[6],
                    "actor_id": row[7],
                    "actor_role": row[8],
                    "district": row[9],
                    "village": row[10],
                    "source": "sahayak-sqlite",
                    "local_created_at": _serialize_value(row[11]),
                    "local_updated_at": _serialize_value(row[12]),
                    "synced_at": now,
                }

                conn.execute(
                    text(
                        "UPDATE local_changes SET sync_status='syncing', last_attempt_at=:now, updated_at=:now "
                        "WHERE id=:id"
                    ),
                    {"id": row_id, "now": now},
                )

                try:
                    client.table(REMOTE_TABLE).upsert(remote_record, on_conflict="change_key").execute()
                    conn.execute(
                        text(
                            "UPDATE local_changes SET sync_status='synced', synced_at=:now, "
                            "last_error=NULL, updated_at=:now WHERE id=:id"
                        ),
                        {"id": row_id, "now": now},
                    )
                    pushed += 1
                except Exception as exc:
                    conn.execute(
                        text(
                            "UPDATE local_changes SET sync_status='failed', retry_count=retry_count+1, "
                            "last_error=:error, updated_at=:now WHERE id=:id"
                        ),
                        {"id": row_id, "error": str(exc), "now": now},
                    )
                    errors += 1
                    logger.warning("Failed to sync change %s: %s", change_key, exc)
    else:
        with _fallback_lock:
            store = _load_file_store()
            for row in pending:
                change_key = str(row["change_key"])
                payload = json.loads(str(row["payload_json"]))
                remote_record = {
                    "change_key": change_key,
                    "entity_type": row.get("entity_type"),
                    "entity_id": row.get("entity_id"),
                    "operation": row.get("operation"),
                    "payload": payload,
                    "patient_id": row.get("patient_id"),
                    "actor_id": row.get("actor_id"),
                    "actor_role": row.get("actor_role"),
                    "district": row.get("district"),
                    "village": row.get("village"),
                    "source": "sahayak-file-outbox",
                    "local_created_at": _serialize_value(row.get("created_at")),
                    "local_updated_at": _serialize_value(row.get("updated_at")),
                    "synced_at": now,
                }
                record = store["changes"].get(change_key)
                if not record:
                    continue

                record["sync_status"] = "syncing"
                record["last_attempt_at"] = now
                record["updated_at"] = now

                try:
                    client.table(REMOTE_TABLE).upsert(remote_record, on_conflict="change_key").execute()
                    record["sync_status"] = "synced"
                    record["synced_at"] = now
                    record["last_error"] = None
                    record["updated_at"] = now
                    pushed += 1
                except Exception as exc:
                    record["sync_status"] = "failed"
                    record["retry_count"] = int(record.get("retry_count", 0)) + 1
                    record["last_error"] = str(exc)
                    record["updated_at"] = now
                    errors += 1
                    logger.warning("Failed to sync change %s: %s", change_key, exc)
            _write_file_store(store)

    refreshed = get_sync_status()
    return {
        **refreshed,
        "status": "success" if pushed else ("partial" if errors else refreshed["status"]),
        "records_found": len(pending),
        "records_pushed": pushed,
        "errors": errors,
        "message": (
            f"{pushed} change(s) synced to Supabase."
            if pushed
            else "No changes were pushed to Supabase."
        ),
    }
