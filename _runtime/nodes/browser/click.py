"""``browser/click`` — 指定セレクタの要素をクリックする。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/click",
    label="クリック",
    labels={"ja": "クリック", "en": "Click"},
    category="browser",
    version="0.2.0",
    ports={
        "browser": {"kind": "in", "type": "string", "required": True},
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

    browser_name = ports["browser"]
    selector = ports.get("selector") or params.get("selector", "")
    if not selector:
        raise ValueError("selector が未指定です")

    timeout = int(params.get("timeout", 10000))
    ctx.log("info", f"[{browser_name}] クリック: {selector}")

    def _do():
        get_page(browser_name).click(selector, timeout=timeout)

    run_on_browser(_do)
    ctx.log("info", "クリック完了")
    return {}
