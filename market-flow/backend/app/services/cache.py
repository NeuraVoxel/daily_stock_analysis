from __future__ import annotations

import threading
import time
from typing import Any, Callable


class TtlCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._inflight: dict[str, threading.Event] = {}

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if time.time() >= expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, *, ttl_sec: float) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl_sec, value)

    def get_or_set(self, key: str, *, ttl_sec: float, factory: Callable[[], Any]) -> Any:
        hit = self.get(key)
        if hit is not None:
            return hit
        with self._lock:
            event = self._inflight.get(key)
            if event is None:
                event = threading.Event()
                self._inflight[key] = event
                owner = True
            else:
                owner = False
        if not owner:
            event.wait(timeout=60)
            return self.get(key)
        try:
            value = factory()
            self.set(key, value, ttl_sec=ttl_sec)
            return value
        finally:
            with self._lock:
                self._inflight.pop(key, None)
            event.set()
