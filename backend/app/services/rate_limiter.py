import time
from collections import defaultdict
from threading import Lock
from typing import Callable
from fastapi import HTTPException, Request, status
from app.deps import get_client_ip
from app.config import settings

import time
from threading import Lock
from typing import Callable, Optional
from fastapi import HTTPException, Request, status
from app.deps import get_client_ip
from app.config import settings

class InMemoryRateLimiter:
    """
    Thread-safe sliding-window in-memory rate limiter with automatic stale IP eviction.
    - Expired timestamps are removed per key.
    - Stale IP keys with no active requests in the retention window are deleted from memory.
    - Enforces a maximum key count to protect against memory exhaustion under distributed traffic.
    """

    def __init__(
        self,
        cleanup_interval_seconds: float = 60.0,
        max_idle_seconds: float = 300.0,
        max_keys: int = 10000,
    ):
        self._requests: dict[str, list[float]] = {}
        self._lock = Lock()
        self._last_cleanup = time.monotonic()
        self._cleanup_interval = cleanup_interval_seconds
        self._max_idle_seconds = max_idle_seconds
        self._max_keys = max_keys

    def _cleanup_locked(self, now: float, max_idle: Optional[float] = None) -> None:
        idle_limit = max_idle if max_idle is not None else self._max_idle_seconds
        cutoff = now - idle_limit

        keys_to_remove = []
        for key, timestamps in self._requests.items():
            valid = [t for t in timestamps if t > cutoff]
            if not valid:
                keys_to_remove.append(key)
            else:
                self._requests[key] = valid

        for key in keys_to_remove:
            del self._requests[key]

        # If capacity still exceeds max_keys, evict oldest entries
        if len(self._requests) > self._max_keys:
            sorted_keys = sorted(
                self._requests.keys(),
                key=lambda k: max(self._requests[k]) if self._requests[k] else 0.0,
            )
            excess = len(self._requests) - self._max_keys
            for k in sorted_keys[:excess]:
                del self._requests[k]

        self._last_cleanup = now

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        if not settings.RATE_LIMIT_ENABLED:
            return True

        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            # Trigger periodic cleanup if interval passed or capacity is high
            if now - self._last_cleanup >= self._cleanup_interval or len(self._requests) >= self._max_keys:
                self._cleanup_locked(now)

            timestamps = self._requests.get(key, [])
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                self._requests[key] = valid_timestamps
                return False

            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps

            # If capacity now exceeds max_keys, evict oldest entries
            if len(self._requests) > self._max_keys:
                self._cleanup_locked(now)

            return True

    def prune(self, max_idle_seconds: Optional[float] = None) -> int:
        """Explicitly purge stale entries and return number of remaining keys."""
        now = time.monotonic()
        with self._lock:
            self._cleanup_locked(now, max_idle=max_idle_seconds)
            return len(self._requests)

    def clear(self) -> None:
        with self._lock:
            self._requests.clear()
            self._last_cleanup = time.monotonic()

    @property
    def key_count(self) -> int:
        with self._lock:
            return len(self._requests)

limiter = InMemoryRateLimiter()

def rate_limit(max_requests: int, window_seconds: int = 60, key_prefix: str = "") -> Callable:
    """FastAPI dependency to rate-limit endpoints per client IP."""
    def dependency(request: Request):
        if not settings.RATE_LIMIT_ENABLED:
            return
        ip = get_client_ip(request)
        key = f"{key_prefix}:{ip}" if key_prefix else f"{request.url.path}:{ip}"
        if not limiter.check(key, max_requests, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down and try again later.",
                headers={"Retry-After": str(window_seconds)},
            )
    return dependency
