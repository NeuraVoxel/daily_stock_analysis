from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_flow import router as flow_router
from app.api.routes_index import router as index_router
from app.settings import get_settings

settings = get_settings()
app = FastAPI(title="Market Flow", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(flow_router, prefix="/api")
app.include_router(index_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
