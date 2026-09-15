#!/bin/sh
# Serves ui/ for `tauri dev`.
#
# If something is already serving gitrove on this port — another `npm run dev`,
# an `npm run serve` you forgot about — reuse it instead of dying. If the port
# is held by something else entirely, say so plainly rather than dumping a
# Python traceback.
PORT="${PORT:-5173}"

if curl -fsS --max-time 2 "http://localhost:$PORT/index.html" 2>/dev/null | grep -q '<title>gitrove'; then
  echo "gitrove is already being served on :$PORT — reusing it"
  exit 0
fi

if curl -fsS --max-time 2 -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  echo "port $PORT is in use by something that is not gitrove." >&2
  echo "Stop it, or run with a different port:  PORT=5174 npm run dev" >&2
  exit 1
fi

exec python3 scripts/serve.py "$PORT" ui
