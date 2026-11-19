#!/usr/bin/env bash
# One-command launcher: creates a virtual-env on first run, installs deps, starts the site.
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3.12}; command -v "$PY" >/dev/null || PY=python3
[ -d .venv ] || { echo "Creating virtual environment..."; "$PY" -m venv .venv; .venv/bin/pip install -q -r requirements.txt; }
echo "SDG-3 AIML Studio -> http://localhost:5050"
(sleep 2 && (open http://localhost:5050 2>/dev/null || xdg-open http://localhost:5050 2>/dev/null || true)) &
exec .venv/bin/python server.py
