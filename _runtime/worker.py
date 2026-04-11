"""FLOWLINE per-track Python worker.

Spawned once per track by the Electron main process and kept alive
between Run invocations. Listens on stdin for JSON-line commands
from the engine and streams events back on stdout. See
docs/03-nodes.md (rev2) for the high-level design.

Protocol
========

Every line on either side is a complete JSON object terminated by
``\\n``. Extra whitespace inside the JSON is fine. Anything that
cannot be parsed is ignored on both sides (with a warning logged
to stderr).

Engine → worker::

    { "type": "hello" }
    { "type": "run_node",
      "reqId":   "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "nodeId":  "debug/log",
      "params":  { "message": "hello" },
      "ports":   { "message": "hello" },
      "timeout": 5 }
    { "type": "cancel",   "reqId": "r-7" }
    { "type": "reset" }
    { "type": "shutdown" }

Worker → engine::

    { "type": "ready",
      "nodes": [ { "id": "debug/log", "label": "...", "ports": {...}, ... }, ... ] }
    { "type": "log",
      "reqId": "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "level": "info",
      "message": "..." }
    { "type": "result",
      "reqId":   "r-7",
      "blockId": "b-3",
      "trackId": "t-main",
      "ok":      true,
      "missing": false,
      "outputs": { ... },
      "error":   null }
    { "type": "fatal", "message": "..." }

**Error policy lives in the engine.** The worker reports
``ok: false`` + ``error`` when something goes wrong; it never
decides between abort / skip / ignore / retry — that's resolved
engine-side from the block's effective ``onError``. ``missing:
true`` is the only hint the worker provides, so the engine can
apply ``skipIfMissing`` without the worker knowing that flag
exists.

Only one node runs per worker at a time — tracks are serial by
design, parallelism lives at the scenario level in the TS engine.
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


def discover_nodes() -> list[Dict[str, Any]]:
    """Import every ``*.py`` under ``_runtime/nodes/`` so their
    ``@flowline.node`` decorators populate ``flowline.REGISTRY``.

    Returns a list of load-error records for files that failed to
    import, so the engine can surface them in the node editor
    instead of silently dropping a broken node. The exception is
    ``NodeIdCollisionError``, which is a hard-error the worker
    re-raises so main() converts it to a ``fatal`` frame.

    Each error record carries the relative path to the source
    file (from ``_runtime/``), the exception message, and the
    full traceback so the editor can show a meaningful diagnostic.
    """
    errors: list[Dict[str, Any]] = []
    base = _ROOT / "nodes"
    if not base.exists():
        return errors
    for py in sorted(base.rglob("*.py")):
        if py.name.startswith("_"):
            continue
        rel = py.relative_to(_ROOT).with_suffix("")
        module_name = ".".join(rel.parts)
        rel_path = str(py.relative_to(_ROOT)).replace(os.sep, "/")
        try:
            spec = importlib.util.spec_from_file_location(module_name, py)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        except flowline.NodeIdCollisionError:
            # Bubble up so main() converts it to a ``fatal`` frame.
            raise
        except Exception as exc:
            tb = traceback.format_exc()
            log_stderr(f"failed to load {module_name}: {exc}")
            log_stderr(tb)
            errors.append(
                {
                    "path": rel_path,
                    "module": module_name,
                    "message": f"{type(exc).__name__}: {exc}",
                    "traceback": tb,
                }
            )
    return errors


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


def _resolve_params(
    spec: flowline.NodeSpec, override: Dict[str, Any]
) -> Dict[str, Any]:
    """Overlay JSON overrides on top of the decorator's defaults.

    The decorator stores params as ``{"name": {"default": ..., ...}}``.
    For Phase 2a we only consume the ``default`` entry; full schema
    validation comes later. JSON overrides always win (docs §
    "デコレータ vs JSON の優先順位").
    """
    merged: Dict[str, Any] = {}
    for key, meta in spec.params.items():
        if isinstance(meta, dict) and "default" in meta:
            merged[key] = meta["default"]
    for key, value in (override or {}).items():
        merged[key] = value
    return merged


def _filter_outputs(
    spec: flowline.NodeSpec,
    raw: Any,
    warn: Any,
) -> Dict[str, Any]:
    """Keep only keys declared as out-ports on the node.

    Non-dict return values degrade to ``{}``. Keys that aren't
    declared as out-ports are dropped with a warning log so node
    authors catch typos early. ``warn`` is a callback (so we can
    route to ``ctx.log`` without threading the context through).
    """
    if not isinstance(raw, dict):
        return {}
    allowed = {
        name
        for name, meta in spec.ports.items()
        if isinstance(meta, dict) and meta.get("kind") == "out"
    }
    filtered: Dict[str, Any] = {}
    for key, value in raw.items():
        if key in allowed:
            filtered[key] = value
        else:
            try:
                warn(
                    "warn",
                    f"node {spec.id!r} returned undeclared output key "
                    f"{key!r}; drop or declare it as an out port",
                )
            except Exception:
                pass
    return filtered


def _run_node_thread(
    execution: Execution,
    node_id: str,
    ports: Dict[str, Any],
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
                "outputs": {},
                "error": {
                    "message": f"unknown node id: {node_id}",
                    "traceback": None,
                },
            }
        )
        _clear_current(execution)
        return

    resolved_params = _resolve_params(spec, params_override)
    ok = True
    missing = False
    error_payload: Optional[Dict[str, Any]] = None
    outputs: Dict[str, Any] = {}

    try:
        # Install the stdlib logging bridge for the duration of the
        # call so third-party library logs show up in the engine.
        with flowline.logging_bridge(ctx):
            result = spec.run(ports, resolved_params, ctx)
        outputs = _filter_outputs(spec, result, ctx.log)
    except FileNotFoundError as exc:
        ok = False
        missing = True
        error_payload = {
            "message": f"target not found: {exc}",
            "traceback": traceback.format_exc(),
        }
    except Exception as exc:
        ok = False
        error_payload = {
            "message": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
        }
        log_stderr(error_payload["traceback"])

    # If the node raised AND the user also hit cancel, prefer the
    # "cancelled" label so the engine can distinguish user abort
    # from genuine crashes. A cancel that arrived after a clean
    # completion is a no-op — we don't second-guess a node that
    # already returned its outputs successfully.
    if not ok and execution.cancel_event.is_set():
        error_payload = {"message": "cancelled", "traceback": None}

    emit(
        {
            "type": "result",
            "reqId": execution.req_id,
            "blockId": execution.block_id,
            "trackId": execution.track_id,
            "ok": ok,
            "missing": missing,
            "outputs": outputs,
            "error": error_payload,
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
    ports = msg.get("ports") or {}
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
                    "outputs": {},
                    "error": {
                        "message": "worker busy",
                        "traceback": None,
                    },
                }
            )
            return
        exe = Execution(req_id=req_id, block_id=block_id, track_id=track_id)
        _current = exe

    thread = threading.Thread(
        target=_run_node_thread,
        args=(exe, node_id, ports, params, timeout),
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


def handle_reset() -> None:
    """Clear per-run state between scenario executions.

    Phase 2a keeps this minimal: the worker holds no track-scope
    variables yet (those live in the engine). We do signal-cancel
    any straggler execution so a run that ended on abort doesn't
    leak into the next one.
    """
    with _current_lock:
        if _current is not None:
            _current.cancel_event.set()


def handle_reload() -> None:
    """Re-scan ``_runtime/nodes/`` and rebuild the registry.

    Used by the node editor after a file is created or saved.
    We purge the previous ``flowline.REGISTRY`` and anything we
    loaded under the ``nodes.*`` module namespace from
    ``sys.modules`` so a second ``discover_nodes()`` picks up
    changed source. Emits a fresh ``ready`` frame with the new
    manifest + load errors so the main process can update its
    cache and the renderer's editor can show import failures
    inline.
    """
    with _current_lock:
        if _current is not None:
            # Don't reload while a node is running — the new
            # registry pointer could swap under the thread. Just
            # signal cancel and bail; the caller will retry.
            _current.cancel_event.set()
    flowline.REGISTRY.clear()
    for mod_name in list(sys.modules.keys()):
        if mod_name.startswith("nodes."):
            del sys.modules[mod_name]
    try:
        errors = discover_nodes()
    except flowline.NodeIdCollisionError as exc:
        emit({"type": "fatal", "message": str(exc)})
        log_stderr(f"node id collision on reload: {exc}")
        return
    emit(
        {
            "type": "ready",
            "reloaded": True,
            "nodes": [
                _manifest_entry(spec) for spec in flowline.REGISTRY.values()
            ],
            "loadErrors": errors,
        }
    )


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


def _manifest_entry(spec: flowline.NodeSpec) -> Dict[str, Any]:
    """Serialisable description of a registered node for ``ready``.

    The engine uses this to populate the AddBlockModal palette
    without having to re-read node source files.
    """
    return {
        "id": spec.id,
        "label": spec.label,
        "labels": dict(spec.labels),
        "category": spec.category,
        "version": spec.version,
        "ports": {k: dict(v) for k, v in spec.ports.items()},
        "params": {k: dict(v) if isinstance(v, dict) else v for k, v in spec.params.items()},
        "onError": spec.on_error,
    }


def main() -> None:
    try:
        errors = discover_nodes()
    except flowline.NodeIdCollisionError as exc:
        # Fatal: refuse to start rather than serve an ambiguous
        # registry. The engine surfaces this as a startup error.
        emit({"type": "fatal", "message": str(exc)})
        log_stderr(f"node id collision: {exc}")
        sys.exit(1)

    emit(
        {
            "type": "ready",
            "nodes": [
                _manifest_entry(spec) for spec in flowline.REGISTRY.values()
            ],
            "loadErrors": errors,
        }
    )

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
            elif kind == "reset":
                handle_reset()
            elif kind == "reload":
                handle_reload()
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
