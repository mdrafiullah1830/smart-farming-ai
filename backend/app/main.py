from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.cache import weather_cache
from app.api.v1.router import api_router
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.middleware.logging import LoggingMiddleware
from app.middleware.i18n import I18nMiddleware
import structlog


logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Smart Farming AI Platform...")
    await init_db()
    logger.info("Database initialized")
    await weather_cache.connect()
    logger.info("Redis cache connected")
    yield
    logger.info("Shutting down...")
    await weather_cache.disconnect()
    await close_db()


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.APP_NAME,
        description="AI-Powered Agricultural Decision Support System for Bangladesh",
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings.DEBUG:
        application.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

    application.add_middleware(RateLimiterMiddleware)
    application.add_middleware(LoggingMiddleware)
    application.add_middleware(I18nMiddleware)

    application.include_router(api_router, prefix="/api/v1")

    @application.get("/health")
    async def health_check():
        return {"status": "healthy", "version": settings.APP_VERSION}

    return application


app = create_app()
