import os
try:
    import numpy as np
    import faiss
    import pickle
except ImportError:
    np = None
    faiss = None
    import pickle
# sentence_transformers imported lazily inside functions

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import FAISS_INDEX_DIR, EMBEDDING_MODEL, TOP_K


class RAGService:
    """Retrieval-Augmented Generation service using FAISS + sentence-transformers."""

    def __init__(self):
        self.model = None
        self.index = None
        self.chunks: list = []
        self.is_loaded = False

    def load(self):
        """Load the FAISS index and text chunks from disk."""
        from sentence_transformers import SentenceTransformer
        index_path = os.path.join(FAISS_INDEX_DIR, "index.faiss")
        chunks_path = os.path.join(FAISS_INDEX_DIR, "chunks.pkl")

        if not os.path.exists(index_path):
            raise FileNotFoundError(
                f"FAISS index not found at {index_path}. "
                "Run 'cd data && python ingest_guidelines.py' first."
            )

        self.model = SentenceTransformer(EMBEDDING_MODEL)
        self.index = faiss.read_index(index_path)

        with open(chunks_path, "rb") as f:
            self.chunks = pickle.load(f)

        self.is_loaded = True

    def retrieve(self, query: str, top_k: int = None) -> list:
        """Retrieve the top-k most relevant text chunks for a query.

        Args:
            query: The search query (e.g. patient symptoms).
            top_k: Number of chunks to return (defaults to config TOP_K).

        Returns:
            List of dicts with 'text', 'source', and 'score' keys.
        """
        if not self.is_loaded:
            self.load()

        k = top_k or TOP_K
        query_embedding = self.model.encode([query])
        distances, indices = self.index.search(
            np.array(query_embedding).astype("float32"), k
        )

        results = []
        for i, idx in enumerate(indices[0]):
            if idx < len(self.chunks):
                results.append(
                    {
                        "text": self.chunks[idx]["text"],
                        "source": self.chunks[idx].get("source", "unknown"),
                        "score": float(distances[0][i]),
                    }
                )
        return results


# Singleton - loaded once, reused across requests
rag_service = RAGService()

def query_rag(query: str, top_k: int = None) -> list:
    """Convenience wrapper for the singleton RAGService."""
    return rag_service.retrieve(query, top_k)
