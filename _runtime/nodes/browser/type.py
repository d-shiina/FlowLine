"""``browser/type`` — テキストフィールドに文字を入力する。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/type",
    label="テキスト入力",
    labels={"ja": "テキスト入力", "en": "Type Text"},
    category="browser",
    version="0.1.0",
    ports={
        "selector": {"kind": "in", "type": "string", "required": True},
        "text": {"kind": "in", "type": "string", "required": True},
    },
    params={
        "selector": {"type": "string", "default": ""},
        "text": {"type": "string", "default": ""},
        "clear_first": {"type": "boolean", "default": True},
        "delay": {"type": "number", "default": 0},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, get_page

    selector = ports.get("selector") or params.get("selector", "")
    text = ports.get("text") or params.get("text", "")
    if not selector:
        raise ValueError("selector が未指定です")

    clear_first = params.get("clear_first", True)
    delay = float(params.get("delay", 0))
    ctx.log("info", f"入力: {selector} ← '{text}'")

    def _do():
        page = get_page()
        if clear_first:
            page.fill(selector, text)
        else:
            page.type(selector, text, delay=delay)

    run_on_browser(_do)
    ctx.log("info", "入力完了")
    return {}
