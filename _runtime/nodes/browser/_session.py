"""Shared browser session manager for FLOWLINE browser nodes.

Playwright's sync_api is greenlet-based and must run on the same
thread where it was started. Since the FLOWLINE worker dispatches
each node invocation on a fresh thread, we run Playwright on a
dedicated long-lived thread and route all calls through it.

Nodes call ``run_on_browser(fn)`` which marshals ``fn`` to the
browser thread, waits for the result, and returns it.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future
from queue import Queue
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")

_browser_thread: Optional[threading.Thread] = None
_task_queue: Queue[Optional[tuple]] = Queue()

# Playwright objects — only accessed from the browser thread.
_pw = None
_browser = None
_context = None
_page = None


def _browser_loop():
    """Runs on the dedicated browser thread. Processes tasks from the queue."""
    global _pw, _browser, _context, _page

    while True:
        item = _task_queue.get()
        if item is None:
            # Shutdown signal.
            _cleanup()
            break

        fn, future = item
        try:
            result = fn()
            future.set_result(result)
        except Exception as exc:
            future.set_exception(exc)


def _cleanup():
    """Close Playwright resources. Called on the browser thread."""
    global _pw, _browser, _context, _page
    if _page:
        try:
            _page.close()
        except Exception:
            pass
        _page = None
    if _context:
        try:
            _context.close()
        except Exception:
            pass
        _context = None
    if _browser:
        try:
            _browser.close()
        except Exception:
            pass
        _browser = None
    if _pw:
        try:
            _pw.stop()
        except Exception:
            pass
        _pw = None


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
    """Execute ``fn`` on the dedicated browser thread and return its result.

    This is the only public entry point nodes should use. The callable
    has access to ``get_page()`` and all Playwright APIs because it
    runs on the correct thread.
    """
    _ensure_thread()
    future: Future[T] = Future()
    _task_queue.put((fn, future))
    return future.result(timeout=120)


def get_page():
    """Return the active Playwright page, launching the browser if needed.

    MUST be called from the browser thread (inside ``run_on_browser``).
    """
    global _pw, _browser, _context, _page
    if _page is not None:
        return _page

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "playwright がインストールされていません。\n"
            "下部パネルの「パッケージ」タブからインストールしてください。"
        )

    _pw = sync_playwright().start()
    _browser = _pw.chromium.launch(headless=False)
    _context = _browser.new_context()
    _page = _context.new_page()
    return _page


def close():
    """Close the browser session. Safe to call from any thread."""
    global _browser_thread
    if _browser_thread is not None and _browser_thread.is_alive():
        _task_queue.put(None)  # Shutdown signal
        _browser_thread.join(timeout=10)
        _browser_thread = None
