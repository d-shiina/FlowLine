"""Shared browser session manager for FLOWLINE browser nodes.

Manages multiple named browser sessions. Each ``browser/open`` creates
a session with a user-specified name (e.g. "main", "sub"). Subsequent
nodes specify which session to operate on via the ``browser`` port.

Playwright's sync_api is greenlet-based and must run on the thread
where it was started. A single dedicated thread runs for the entire
lifetime of the worker process. All Playwright calls are dispatched
to it via ``run_on_browser(fn)``.

IMPORTANT: The browser thread is never terminated. Playwright's
greenlets are pinned to it, so creating a new thread after stopping
the old one causes "cannot switch to a different thread" crashes.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future
from queue import Queue
from typing import Any, Callable, Dict, Optional, TypeVar

T = TypeVar("T")

_browser_thread: Optional[threading.Thread] = None
_task_queue: Queue[tuple] = Queue()
_thread_lock = threading.Lock()

# Playwright objects — only accessed from the browser thread.
_pw = None
_sessions: Dict[str, dict] = {}  # name → {"browser", "context", "page"}


def _browser_loop():
    """Runs on the dedicated browser thread for the entire worker lifetime."""
    while True:
        fn, future = _task_queue.get()
        try:
            result = fn()
            future.set_result(result)
        except Exception as exc:
            future.set_exception(exc)


def _ensure_pw():
    """Ensure Playwright is started. Must be called on browser thread."""
    global _pw
    if _pw is not None:
        return _pw
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "playwright がインストールされていません。\n"
            "下部パネルの「パッケージ」タブからインストールしてください。"
        )
    _pw = sync_playwright().start()
    return _pw


def _close_session(name: str):
    """Close a single session by name. Called on browser thread."""
    session = _sessions.pop(name, None)
    if not session:
        return
    for key in ("page", "context", "browser"):
        obj = session.get(key)
        if obj:
            try:
                obj.close()
            except Exception:
                pass


def _ensure_thread():
    """Start the browser thread if it hasn't been started yet."""
    global _browser_thread
    with _thread_lock:
        if _browser_thread is not None and _browser_thread.is_alive():
            return
        _browser_thread = threading.Thread(
            target=_browser_loop, daemon=True, name="flowline-browser"
        )
        _browser_thread.start()


def run_on_browser(fn: Callable[[], T]) -> T:
    """Execute ``fn`` on the dedicated browser thread and return its result."""
    _ensure_thread()
    future: Future[T] = Future()
    _task_queue.put((fn, future))
    return future.result(timeout=120)


def open_session(name: str, headless: bool = False):
    """Open a new browser session with the given name.

    Must be called inside ``run_on_browser``.
    Returns the page object.
    """
    if name in _sessions:
        return _sessions[name]["page"]

    pw = _ensure_pw()
    browser = pw.chromium.launch(headless=headless)
    context = browser.new_context()
    page = context.new_page()
    _sessions[name] = {"browser": browser, "context": context, "page": page}
    return page


def get_page(name: str = "default"):
    """Return the page for the named session.

    Must be called from the browser thread (inside ``run_on_browser``).
    If the session doesn't exist yet, auto-creates it (headful).
    """
    session = _sessions.get(name)
    if not session:
        return open_session(name, headless=False)
    return session["page"]


def close_session(name: str):
    """Close a named session. Must be called inside ``run_on_browser``."""
    _close_session(name)


def close_all_sessions():
    """Close all browser sessions (but keep the thread + Playwright alive).

    Must be called inside ``run_on_browser``.
    """
    for name in list(_sessions.keys()):
        _close_session(name)


def list_sessions() -> list:
    """Return list of active session names. Must be called inside ``run_on_browser``."""
    return list(_sessions.keys())
