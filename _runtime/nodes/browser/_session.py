"""Shared browser session manager for FLOWLINE browser nodes.

Manages a single Playwright browser instance that persists across
node invocations within a scenario run. Nodes call ``get_page()``
to obtain the active page, and ``close()`` to tear down at the end.

The session is lazily initialized on first use — no browser launches
until a browser node actually runs.
"""

from __future__ import annotations

from typing import Optional

# Playwright is imported lazily so the worker can boot even if
# playwright isn't installed yet. Nodes that need it will get a
# clear error message.
_browser = None
_context = None
_page = None


def get_page():
    """Return the active Playwright page, launching the browser if needed."""
    global _browser, _context, _page
    if _page is not None:
        return _page

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "playwright がインストールされていません。\n"
            "pip install playwright && playwright install chromium"
        )

    pw = sync_playwright().start()
    _browser = pw.chromium.launch(headless=False)
    _context = _browser.new_context()
    _page = _context.new_page()
    return _page


def close():
    """Close the browser session. Safe to call multiple times."""
    global _browser, _context, _page
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
