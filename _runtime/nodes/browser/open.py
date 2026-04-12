"""``browser/open`` — ブラウザを起動してURLに移動する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/open",
    label="ブラウザを開く",
    labels={"ja": "ブラウザを開く", "en": "Open Browser"},
    category="browser",
    version="0.2.0",
    ports={
        "url": {"kind": "in", "type": "string", "required": False},
        "browser": {"kind": "out", "type": "string"},
        "title": {"kind": "out", "type": "string"},
    },
    params={
        "name": {"type": "string", "default": "default"},
        "url": {"type": "string", "default": "https://www.google.com"},
        "headless": {"type": "boolean", "default": False},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, open_session

    name = params.get("name", "default")
    url = ports.get("url") or params.get("url", "https://www.google.com")
    headless = params.get("headless", False)
    ctx.log("info", f"ブラウザ「{name}」を開いています: {url}")

    def _do():
        page = open_session(name, headless=headless)
        page.goto(url, wait_until="domcontentloaded")
        return page.title()

    title = run_on_browser(_do)
    ctx.log("info", f"タイトル: {title}")
    return {"browser": name, "title": title}
