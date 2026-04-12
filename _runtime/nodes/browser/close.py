"""``browser/close`` — ブラウザセッションを閉じる。"""

from __future__ import annotations

from flowline import node


@node(
    id="browser/close",
    label="ブラウザを閉じる",
    labels={"ja": "ブラウザを閉じる", "en": "Close Browser"},
    category="browser",
    version="0.1.0",
    ports={},
    params={},
    on_error="ignore",
)
def run(ports, params, ctx):
    from ._session import close

    ctx.log("info", "ブラウザを閉じています")
    close()
    ctx.log("info", "ブラウザを閉じました")
    return {}
