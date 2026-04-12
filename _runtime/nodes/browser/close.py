"""``browser/close`` — 指定のブラウザセッションを閉じる。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/close",
    label="ブラウザを閉じる",
    labels={"ja": "ブラウザを閉じる", "en": "Close Browser"},
    category="browser",
    version="0.2.0",
    ports={
        "browser": {"kind": "in", "type": "string", "required": True},
    },
    params={},
    on_error="ignore",
)
def run(ports, params, ctx):
    from ._session import run_on_browser, close_session

    browser_name = ports["browser"]
    ctx.log("info", f"ブラウザ「{browser_name}」を閉じています")

    def _do():
        close_session(browser_name)

    run_on_browser(_do)
    ctx.log("info", f"ブラウザ「{browser_name}」を閉じました")
    return {}
