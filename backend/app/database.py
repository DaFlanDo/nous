"""
Database Connection and Management
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
import logging
import asyncio
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure

from .config import settings

logger = logging.getLogger(__name__)


class Database:
    """MongoDB database connection manager"""
    
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    _connected: bool = False
    
    async def connect(self, max_retries: int = 3, retry_delay: int = 2):
        """Establish database connection with retry logic"""
        if self.client is not None:
            return
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to MongoDB (attempt {attempt + 1}/{max_retries}): {settings.mongo_url}")
                self.client = AsyncIOMotorClient(
                    settings.mongo_url,
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=5000
                )
                self.db = self.client[settings.db_name]
                
                # Проверяем подключение
                await self.client.admin.command('ping')
                self._connected = True
                logger.info(f"Connected to database: {settings.db_name}")
                return
                
            except (ServerSelectionTimeoutError, ConnectionFailure) as e:
                logger.warning(f"MongoDB connection attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error("Failed to connect to MongoDB after all retries")
                    self._connected = False
                    # Не поднимаем исключение, чтобы приложение могло запуститься
    
    async def disconnect(self):
        """Close database connection"""
        if self.client is not None:
            self.client.close()
            self.client = None
            self.db = None
            logger.info("Disconnected from MongoDB")
    
    def get_db(self) -> AsyncIOMotorDatabase:
        """Get database instance"""
        if self.db is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self.db
    
    def is_connected(self) -> bool:
        """Check if database is connected"""
        return self._connected
    
    async def check_connection(self) -> bool:
        """Check if database connection is alive"""
        if not self._connected or self.client is None:
            return False
        try:
            await self.client.admin.command('ping')
            return True
        except Exception:
            self._connected = False
            return False


# Singleton instance
database = Database()


async def get_database() -> AsyncIOMotorDatabase:
    """Dependency for getting database in routes"""
    return database.get_db()


# Collection accessors for convenience
def get_users_collection():
    return database.get_db().users


def get_notes_collection():
    return database.get_db().notes


def get_templates_collection():
    return database.get_db().templates


def get_checklists_collection():
    return database.get_db().checklists


def get_chat_sessions_collection():
    return database.get_db().chat_sessions


def get_states_collection():
    return database.get_db().states
