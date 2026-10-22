#!/bin/sh
set -eu
if [ "${CHRONOS_REQUIRED:-true}" = "true" ]; then
    "${CHRONOS_PYTHON_PATH:-/opt/venv/bin/python}" -I -B /app/deployment/check-models.py
fi
exec "$@"
