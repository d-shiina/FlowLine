"""Shared browser session manager for FLOWLINE browser nodes.

Manages multiple named browser sessions. Each ``browser/open`` creates
a session with a user-specified name (e.g. "main", "sub"). Subsequent
nodes specify which session to operate on via the ``browser`` port.

Playwright's sync_api is greenlet-based and must run on the thread
where it was started. All Playwright calls are dispatched to a
dedicated long-lived thread via ``run_on_browser(fn)``.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future
from queue import Queue
from typing import Any, Callable, Dict, Optional, TypeVar

T = TypeVar("T")

_browser_thread: Optional[threading.Thread] = None
_task_queue: Queue[Optional[tuple]] = Queue()

# Playwright objects — only accessed from the browser thread.
_pw = None
_sessions: Dict[str, dict] = {}  # name → {"browser", "context", "page"}


def _browser_loop():
    """Runs on the dedicated browser thread. Processes tasks from the queue."""
    while True:
        item = _task_queue.get()
        if item is None:
            _cleanup_all()
            break
        fn, future = item
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


def _cleanup_all():
    """Close all sessions and Playwright. Called on browser thread."""
    global _pw, _sessions
    for name in list(_sessions.keys()):
        _close_session(name)
    if _pw:
        try:
            _pw.stop()
        except Exception:
            pass
        _pw = None


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
    global _sessions
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

    Must be called inside ``run_on_browser``.
    Raises if the session doesn't exist.
    """
    session = _sessions.get(name)
    if not session:
        raise ValueError(
            f"ブラウザ「{name}」が見つかりません。先に browser/open で起動してください。"
        )
    return session["page"]


def close_session(name: str):
    """Close a named session. Must be called inside ``run_on_browser``."""
    _close_session(name)


def list_sessions() -> list:
    """Return list of active session names. Must be called inside ``run_on_browser``."""
    return list(_sessions.keys())


def close_all():
    """Close all browser sessions. Safe to call from any thread."""
    global _browser_thread
    if _browser_thread is not None and _browser_thread.is_alive():
        _task_queue.put(None)
        _browser_thread.join(timeout=10)
        _browser_thread = None
