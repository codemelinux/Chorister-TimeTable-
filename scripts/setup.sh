#!/usr/bin/env bash
# Chorister TimeTable - Setup Script
# Developed by Benedict U.
set -e

echo "=== Chorister TimeTable Setup ==="

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
else
    echo "Virtual environment already exists."
fi

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Installing dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt

echo ""
echo "Setup complete! Run the app with:"
echo "  bash scripts/start.sh"
