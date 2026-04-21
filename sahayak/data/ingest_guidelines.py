"""
Sahayak AI — FAISS Index Builder
Reads all ICMR guideline .txt files from data/ and builds:
  - data/faiss_index/index.faiss
  - data/faiss_index/chunks.pkl

Run with:
  uv run python data/ingest_guidelines.py
"""

import os
import pickle
import pathlib
import textwrap

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR   = pathlib.Path(__file__).parent
INDEX_DIR  = DATA_DIR / "faiss_index"
INDEX_PATH = INDEX_DIR / "index.faiss"
CHUNKS_PATH = INDEX_DIR / "chunks.pkl"

# ── Chunking params (match config.py defaults) ────────────────────────────────
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE", "200"))     # words per chunk
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "20"))   # word overlap


def load_guidelines() -> list[dict]:
    """Read all .txt files in DATA_DIR, return list of {source, text} dicts."""
    docs = []
    for path in sorted(DATA_DIR.glob("*.txt")):
        text = path.read_text(encoding="utf-8").strip()
        if text:
            docs.append({"source": path.stem, "text": text})
            print(f"  Loaded: {path.name} ({len(text.split())} words)")
    return docs


def chunk_document(doc: dict) -> list[dict]:
    """Split a document into overlapping word-window chunks."""
    words  = doc["text"].split()
    chunks = []
    step   = CHUNK_SIZE - CHUNK_OVERLAP
    for i in range(0, max(1, len(words) - CHUNK_OVERLAP), step):
        chunk_words = words[i : i + CHUNK_SIZE]
        chunk_text  = " ".join(chunk_words)
        chunks.append({
            "source": doc["source"],
            "text":   chunk_text,
            "start":  i,
        })
        if i + CHUNK_SIZE >= len(words):
            break
    return chunks


def build_index():
    try:
        from sentence_transformers import SentenceTransformer
        import faiss
        import numpy as np
    except ImportError as e:
        print(f"\nMissing dependency: {e}")
        print("Run: uv pip install sentence-transformers faiss-cpu")
        return False

    print("\n=== Sahayak AI — FAISS Index Builder ===\n")

    # 1. Load all guideline files
    print("Loading guideline files...")
    docs = load_guidelines()
    if not docs:
        print("No .txt files found in data/. Aborting.")
        return False
    print(f"  Total documents: {len(docs)}")

    # 2. Chunk
    print("\nChunking documents...")
    all_chunks = []
    for doc in docs:
        chunks = chunk_document(doc)
        all_chunks.extend(chunks)
        print(f"  {doc['source']}: {len(chunks)} chunks")
    print(f"  Total chunks: {len(all_chunks)}")

    # 3. Embed
    embedding_model = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    print(f"\nEmbedding with {embedding_model} ...")
    model  = SentenceTransformer(embedding_model)
    texts  = [c["text"] for c in all_chunks]
    embeds = model.encode(texts, show_progress_bar=True, batch_size=32)
    embeds = np.array(embeds, dtype="float32")

    # 4. Build FAISS index (flat L2)
    print("\nBuilding FAISS index...")
    dim   = embeds.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeds)
    print(f"  Index size: {index.ntotal} vectors, dim={dim}")

    # 5. Save
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))
    with open(CHUNKS_PATH, "wb") as f:
        pickle.dump(all_chunks, f)

    print(f"\n✅ Saved:")
    print(f"   {INDEX_PATH}")
    print(f"   {CHUNKS_PATH}")
    return True


if __name__ == "__main__":
    success = build_index()
    if not success:
        raise SystemExit(1)
    print("\nIngest complete. RAG is ready.\n")
