"""``browser/click`` — 指定セレクタの要素をクリックする。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/click",
    label="クリック",
    labels={"ja": "クリック", "en": "Click"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
    },
    params={
        "selector": {"type": "string", "default": ""},
        "timeout": {"type": "number", "default": 10000},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    selector = ports.get("selector") or params.get("selector", "")
    if not selector:
        raise ValueError("selector が未指定です")

    timeout = int(params.get("timeout", 10000))
    ctx.log("info", f"クリック: {selector}")

    def _do():
        get_page().click(selector, timeout=timeout)

    run_on_browser(_do)
    ctx.log("info", "クリック完了")
    return {}
