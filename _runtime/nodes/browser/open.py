"""``browser/open`` — ブラウザを起動してURLに移動する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/open",
    label="ブラウザを開く",
    labels={"ja": "ブラウザを開く", "en": "Open Browser"},
    category="browser",
    version="0.1.0",
    ports={
        "url": {"kind": "in", "type": "string", "required": False},
        "title": {"kind": "out", "type": "string"},
    },
    params={
        "url": {
            "type": "string",
            "default": "https://www.google.com",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    url = ports.get("url") or params.get("url", "https://www.google.com")
    ctx.log("info", f"ブラウザを開いています: {url}")

    def _do():
        page = get_page()
        page.goto(url, wait_until="domcontentloaded")
        return page.title()

    title = run_on_browser(_do)
    ctx.log("info", f"ページタイトル: {title}")
    return {"title": title}
