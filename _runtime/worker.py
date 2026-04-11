"""FLOWLINE per-track Python worker.

Spawned once per track by the Electron main process. Listens on
stdin for JSON-line commands from the engine and streams events
back on stdout. See docs/03-nodes.md for the high-level design.

Phase 2a protocol
=================

Every line on either side is a complete JSON object terminated by
``\\n``. Extra whitespace inside the JSON is fine. Anything that
cannot be parsed is ignored on both sides (with a warning logged
to stderr).

Engine → worker::

    { "type": "hello" }
    { "type": "run_node",
      "reqId": "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "nodeId": "debug/log",
      "params": { "message": "hello" },
      "timeout": 5 }
    { "type": "cancel", "reqId": "r-7" }
    { "type": "shutdown" }

Worker → engine::

    { "type": "ready",
      "nodes": [ { "id": "debug/log", "label": "..." }, ... ] }
    { "type": "log",
      "reqId": "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "level": "info",
      "message": "..." }
    { "type": "result",
      "reqId": "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "ok": true,
      "missing": false,
      "errorMessage": null,
      "outputs": { ... } }
    { "type": "fatal", "message": "..." }

The worker executes nodes on a background thread so cancellation
can be signalled through a threading.Event while the main thread
keeps reading stdin. Only one node runs per worker at a time —
tracks are serial by design, parallelism lives at the scenario
level in the TS engine.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import sys
import threading
import time
import traceback
from typing import Any, Dict, Optional

# Make this package importable when spawned from the project root
# (``python _runtime/worker.py``). We prepend the containing directory
# so ``import flowline`` and ``import nodes.x.y`` both resolve.
_ROOT = pathlib.Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import flowline  # noqa: E402  (after sys.path patch)


# ──────────────────────────────────────────────────────────────────
# IO helpers
# ──────────────────────────────────────────────────────────────────

_WRITE_LOCK = threading.Lock()


def emit(obj: Dict[str, Any]) -> None:
    """Write a single JSON object + newline to stdout atomically.

    The worker writes from both the stdin-reader thread (for
    ``ready``, ``fatal``) and the node-execution thread (for
    ``log``, ``result``), so we serialise through a lock.
    """
    line = json.dumps(obj, ensure_ascii=False, default=str)
    with _WRITE_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log_stderr(msg: str) -> None:
    try:
        sys.stderr.write(f"[worker] {msg}\n")
        sys.stderr.flush()
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────
# Node discovery
# ──────────────────────────────────────────────────────────────────


def discover_nodes() -> None:
    """Import every ``*.py`` under ``_runtime/nodes/`` so their
    ``@flowline.node`` decorators populate ``flowline.REGISTRY``.

    Failures on individual files log to stderr and are otherwise
    swallowed so a single broken node can't brick a worker.
    """
    base = _ROOT / "nodes"
    if not base.exists():
        return
    for py in sorted(base.rglob("*.py")):
        if py.name.startswith("_"):
            continue
        rel = py.relative_to(_ROOT).with_suffix("")
        module_name = ".".join(rel.parts)
        try:
            spec = importlib.util.spec_from_file_location(module_name, py)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        except Exception as exc:
            log_stderr(f"failed to load {module_name}: {exc}")
            log_stderr(traceback.format_exc())


# ──────────────────────────────────────────────────────────────────
# Execution state
# ──────────────────────────────────────────────────────────────────


class Execution:
    """Single in-flight node run tracked by the worker.

    One-at-a-time: the worker rejects new ``run_node`` requests
    while an execution is alive, matching the serial-track model.
    """

    def __init__(self, req_id: str, block_id: str, track_id: str) -> None:
        self.req_id = req_id
        self.block_id = block_id
        self.track_id = track_id
        self.cancel_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.started_at = time.monotonic()


_current: Optional[Execution] = None
_current_lock = threading.Lock()


def _resolve_params(spec: flowline.NodeSpec, override: Dict[str, Any]) -> Dict[str, Any]:
    """Overlay JSON overrides on top of the decorator's defaults.

    The decorator stores params as ``{"name": {"default": ..., ...}}``.
    For Phase 2a we only consume the ``default`` entry; full schema
    validation comes later.
    """
    merged: Dict[str, Any] = {}
    for key, meta in spec.params.items():
        if isinstance(meta, dict) and "default" in meta:
            merged[key] = meta["default"]
    for key, value in (override or {}).items():
        merged[key] = value
    return merged


def _run_node_thread(
    execution: Execution,
    node_id: str,
    params_override: Dict[str, Any],
    timeout: Optional[float],
) -> None:
    """Execute a single registered node on the worker's background
    thread. Streams logs and a final ``result`` envelope back to
    the engine. Always emits a result, even on exception, so the
    engine's waiter pattern never stalls.
    """

    def log_sink(level: str, message: str) -> None:
        emit(
            {
                "type": "log",
                "reqId": execution.req_id,
                "blockId": execution.block_id,
                "trackId": execution.track_id,
                "level": level,
                "message": message,
            }
        )

    ctx = flowline.NodeContext(
        block_id=execution.block_id,
        track_id=execution.track_id,
        timeout=timeout,
        _cancel_event=execution.cancel_event,
        _log_sink=log_sink,
    )

    spec = flowline.REGISTRY.get(node_id)

    if spec is None:
        emit(
            {
                "type": "result",
                "reqId": execution.req_id,
                "blockId": execution.block_id,
                "trackId": execution.track_id,
                "ok": False,
                "missing": False,
                "errorMessage": f"unknown node id: {node_id}",
                "outputs": {},
            }
        )
        _clear_current(execution)
        return

    resolved_params = _resolve_params(spec, params_override)
    ok = True
    missing = False
    error_message: Optional[str] = None
    outputs: Any = {}

    try:
        result = spec.run(resolved_params, ctx)
        if isinstance(result, dict):
            outputs = result
        else:
            outputs = {}
    except FileNotFoundError as exc:
        ok = False
        missing = True
        error_message = f"target not found: {exc}"
    except Exception as exc:
        ok = False
        error_message = f"{type(exc).__name__}: {exc}"
        log_stderr(traceback.format_exc())

    # Cancellation takes precedence in the reported status so the
    # engine can distinguish "crashed" from "user hit stop".
    if execution.cancel_event.is_set():
        ok = False
        if error_message is None:
            error_message = "cancelled"

    emit(
        {
            "type": "result",
            "reqId": execution.req_id,
            "blockId": execution.block_id,
            "trackId": execution.track_id,
            "ok": ok,
            "missing": missing,
            "errorMessage": error_message,
            "outputs": outputs,
        }
    )

    _clear_current(execution)


def _clear_current(execution: Execution) -> None:
    global _current
    with _current_lock:
        if _current is execution:
            _current = None


# ──────────────────────────────────────────────────────────────────
# Command dispatch
# ──────────────────────────────────────────────────────────────────


def handle_run_node(msg: Dict[str, Any]) -> None:
    global _current

    req_id = str(msg.get("reqId") or "")
    block_id = str(msg.get("blockId") or "")
    track_id = str(msg.get("trackId") or "")
    node_id = str(msg.get("nodeId") or "")
    params = msg.get("params") or {}
    timeout = msg.get("timeout")

    with _current_lock:
        if _current is not None:
            emit(
                {
                    "type": "result",
                    "reqId": req_id,
                    "blockId": block_id,
                    "trackId": track_id,
                    "ok": False,
                    "missing": False,
                    "errorMessage": "worker busy",
                    "outputs": {},
                }
            )
            return
        exe = Execution(req_id=req_id, block_id=block_id, track_id=track_id)
        _current = exe

    thread = threading.Thread(
        target=_run_node_thread,
        args=(exe, node_id, params, timeout),
        daemon=True,
        name=f"flowline-node-{req_id}",
    )
    exe.thread = thread
    thread.start()


def handle_cancel(msg: Dict[str, Any]) -> None:
    req_id = str(msg.get("reqId") or "")
    with _current_lock:
        if _current is None:
            return
        if req_id and _current.req_id != req_id:
            return
        _current.cancel_event.set()


def handle_shutdown() -> None:
    # Best-effort cancel any in-flight execution, then exit cleanly.
    with _current_lock:
        if _current is not None:
            _current.cancel_event.set()
    # Give the running thread a moment to wind down before we die
    # so its result envelope can still reach the engine.
    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        with _current_lock:
            if _current is None:
                break
        time.sleep(0.05)
    sys.exit(0)


def main() -> None:
    discover_nodes()

    nodes_payload = [
        {
            "id": spec.id,
            "label": spec.label,
            "category": spec.category,
            "version": spec.version,
        }
        for spec in flowline.REGISTRY.values()
    ]
    emit({"type": "ready", "nodes": nodes_payload})

    try:
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception as exc:
                log_stderr(f"bad JSON from engine: {exc}")
                continue
            if not isinstance(msg, dict):
                continue
            kind = msg.get("type")
            if kind == "hello":
                continue
            elif kind == "run_node":
                handle_run_node(msg)
            elif kind == "cancel":
                handle_cancel(msg)
            elif kind == "shutdown":
                handle_shutdown()
                return
            else:
                log_stderr(f"unknown message type: {kind!r}")
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        emit({"type": "fatal", "message": f"{type(exc).__name__}: {exc}"})
        log_stderr(traceback.format_exc())
    finally:
        # Ensure stdout is flushed on exit so the engine sees any
        # final result frame that was buffered by the OS.
        try:
            sys.stdout.flush()
        except Exception:
            pass


if __name__ == "__main__":
    main()
