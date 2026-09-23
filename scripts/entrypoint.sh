#!/bin/sh
set -e

echo "Running migrations..."
alembic upgrade head

echo "Ensuring admin user exists..."
python scripts/create_admin.py

echo "Starting application..."
exec "$@"