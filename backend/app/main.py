"""
Nous Backend - Main Application Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .config import settings
from .database import database
from .services.encryption import init_encryption
from .routes import (
    auth_router,
    notes_router,
    checklists_router,
    chat_router,
    state_router,
)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Nous Backend...")
    
    # Connect to database
    await database.connect()
    
    if database.is_connected():
        logger.info("✓ Database connected successfully")
    else:
        logger.warning("⚠ Database connection failed - running in degraded mode")
        logger.warning("Some features may not be available")
    
    # Initialize encryption
    init_encryption(settings.encryption_key)
    logger.info("Encryption initialized")
    
    # Log configuration
    logger.info(f"OpenAI Base URL: {settings.openai_base_url}")
    logger.info(f"OpenAI API Key configured: {'Yes' if settings.openai_api_key else 'No'}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Nous Backend...")
    await database.disconnect()


# Create FastAPI app
app = FastAPI(
    title="Nous API",
    description="API для приложения рефлексии и самоанализа",
    version="2.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.allowed_origins.split(",") if settings.allowed_origins != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(checklists_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(state_router, prefix="/api")


# Health check endpoints
@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Nous API", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint with database status"""
    db_connected = await database.check_connection()
    
    return {
        "status": "healthy" if db_connected else "degraded",
        "database": "connected" if db_connected else "disconnected",
        "version": "2.0.0"
    }


@app.get("/api")
async def api_root():
    """API root endpoint"""
    return {"message": "Reflection Diary API", "status": "running"}
