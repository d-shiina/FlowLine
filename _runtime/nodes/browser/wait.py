"""``browser/wait`` — 要素が表示されるまで待機する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/wait",
    label="要素を待機",
    labels={"ja": "要素を待機", "en": "Wait for Element"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
        "found": {"kind": "out", "type": "boolean"},
    },
    params={
        "selector": {"type": "string", "default": ""},
        "state": {
            "type": "enum",
            "choices": ["visible", "hidden", "attached", "detached"],
            "default": "visible",
        },
        "timeout": {"type": "number", "default": 30000},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    selector = ports.get("selector") or params.get("selector", "")
    if not selector:
        raise ValueError("selector が未指定です")

    state = params.get("state", "visible")
    timeout = int(params.get("timeout", 30000))
    ctx.log("info", f"待機: {selector} (state={state})")

    def _do():
        try:
            get_page().wait_for_selector(selector, state=state, timeout=timeout)
            return True
        except Exception:
            return False

    found = run_on_browser(_do)
    ctx.log("info", "要素が見つかりました" if found else f"タイムアウト: {selector}")
    return {"found": found}
