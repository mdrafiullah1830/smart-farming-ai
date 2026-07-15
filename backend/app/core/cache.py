"""Redis Cache Layer for Weather Data."""
import json
import redis.asyncio as redis
from typing import Optional, Any
from app.core.config import settings


class WeatherCache:
    """Redis cache for weather data with 10-minute TTL."""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.ttl = 600  # 10 minutes

    async def connect(self):
        """Connect to Redis."""
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            await self.redis_client.ping()
        except Exception as e:
            print(f"Redis connection error: {e}")
            self.redis_client = None

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis_client:
            await self.redis_client.close()

    def _make_key(self, prefix: str, lat: float, lon: float) -> str:
        """Create cache key from coordinates."""
        return f"weather:{prefix}:{lat:.4f}:{lon:.4f}"

    async def get(self, prefix: str, lat: float, lon: float) -> Optional[dict]:
        """Get cached weather data."""
        if not self.redis_client:
            return None
        try:
            key = self._make_key(prefix, lat, lon)
            data = await self.redis_client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            print(f"Cache get error: {e}")
        return None

    async def set(self, prefix: str, lat: float, lon: float, data: dict, ttl: Optional[int] = None):
        """Set cached weather data."""
        if not self.redis_client:
            return
        try:
            key = self._make_key(prefix, lat, lon)
            await self.redis_client.setex(
                key,
                ttl or self.ttl,
                json.dumps(data, default=str),
            )
        except Exception as e:
            print(f"Cache set error: {e}")

    async def invalidate(self, prefix: str, lat: float, lon: float):
        """Invalidate cached data."""
        if not self.redis_client:
            return
        try:
            key = self._make_key(prefix, lat, lon)
            await self.redis_client.delete(key)
        except Exception as e:
            print(f"Cache invalidate error: {e}")


# Global cache instance
weather_cache = WeatherCache()
