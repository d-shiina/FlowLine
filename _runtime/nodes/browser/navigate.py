"""``browser/navigate`` — 現在のページで別のURLに移動する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/navigate",
    label="ページ移動",
    labels={"ja": "ページ移動", "en": "Navigate"},
    category="browser",
    version="0.1.0",
    ports={
        "url": {"kind": "in", "type": "string", "required": True},
        "title": {"kind": "out", "type": "string"},
    },
    params={
        "wait_until": {
            "type": "enum",
            "choices": ["domcontentloaded", "load", "networkidle"],
            "default": "domcontentloaded",
        },
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import get_page

    url = ports["url"]
    wait = params.get("wait_until", "domcontentloaded")
    ctx.log("info", f"移動: {url}")

    page = get_page()
    page.goto(url, wait_until=wait)

    title = page.title()
    ctx.log("info", f"タイトル: {title}")
    return {"title": title}
