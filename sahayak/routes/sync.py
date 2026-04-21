from fastapi import APIRouter

from services.sync_service import get_setup_sql, get_sync_status, sync_to_government

router = APIRouter(prefix="/sync", tags=["Sync"])


@router.get("/status")
async def sync_status():
    return get_sync_status()


@router.get("/setup")
async def sync_setup():
    status = get_sync_status()
    return {
        "remote_table": status["remote_table"],
        "supabase_configured": status["supabase_configured"],
        "setup_sql": get_setup_sql(),
    }


@router.post("/flush")
async def flush_sync_queue():
    return await sync_to_government()
