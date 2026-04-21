#!/bin/bash
# ══════════════════════════════════════════════════════════
# Sahayak AI — Start with uv
# ══════════════════════════════════════════════════════════
set -e

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║     Sahayak AI — Team DreamAlpha             ║"
echo "║     AMD Slingshot Hackathon 2026             ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check uv
if ! command -v uv &> /dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
fi

# .env check
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    echo "Run: cp .env.example .env  then fill in your API keys."
    exit 1
fi

# Install ALL dependencies (safe to run every time)
echo "Syncing dependencies..."
uv sync 2>/dev/null || pip install -r requirements.txt

# Quick dependency check
echo "Checking dependencies..."
python check_startup.py || {
    echo ""
    echo "Run: pip install -r requirements.txt"
    echo "Then try ./run.sh again"
    exit 1
}

# Build FAISS index if missing
if [ ! -f "data/faiss_index/index.faiss" ]; then
    echo "Building FAISS index..."
    python data/ingest_guidelines.py || echo "FAISS build failed — RAG disabled"
fi

echo ""
echo "Starting Sahayak AI backend..."
echo "  API docs : http://localhost:8000/api/docs"
echo "  Patient  : open frontend/patient.html"
echo "  Doctor   : open frontend/doctor.html"
echo ""

uvicorn main:app --reload --host 0.0.0.0 --port 8000
