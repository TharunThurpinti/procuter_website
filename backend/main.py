
import os
import re

import chromadb
import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

# Configuration
DB_PATH = os.getenv(
    "BIS_CHROMA_PATH",
    "/content/drive/MyDrive/bis_chroma_db",
)
COLLECTION_NAME = os.getenv("BIS_COLLECTION_NAME", "bis_standards")
MODEL_NAME = os.getenv("BIS_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

VALID_DOMAINS = {
    "Construction and building materials",
    "Electrical and electronics",
    "Both / manual review",
}

app = FastAPI(title="BIS Procurement Recommendation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this before production deployment.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the existing persistent collection; do not re-index the catalogue.
if not os.path.isdir(DB_PATH):
    raise RuntimeError(
        f"ChromaDB path not found: {DB_PATH}. "
        "Mount Google Drive in Colab or configure BIS_CHROMA_PATH."
    )

client = chromadb.PersistentClient(path=DB_PATH)

try:
    collection = client.get_collection(name=COLLECTION_NAME)
except Exception as exc:
    raise RuntimeError(
        f"Could not open ChromaDB collection '{COLLECTION_NAME}'."
    ) from exc

model = SentenceTransformer(MODEL_NAME)


def retrieve_standards(query, domain, top_k=5):
    if not isinstance(query, str) or not query.strip():
        raise ValueError("Enter a non-empty query.")
    if domain not in VALID_DOMAINS:
        raise ValueError("Invalid domain.")
    if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1:
        raise ValueError("top_k must be a positive integer.")

    embedding = model.encode(
        query.strip(),
        normalize_embeddings=True,
    ).tolist()

    result = collection.query(
        query_embeddings=[embedding],
        n_results=min(top_k, collection.count()),
        where={"domain": domain},
        include=["documents", "metadatas", "distances"],
    )

    items = []
    ids = result.get("ids", [[]])[0]
    docs = result.get("documents", [[]])[0]
    metas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    for i, record_id in enumerate(ids):
        metadata = metas[i] or {}
        distance = distances[i] if i < len(distances) else None

        items.append({
            "id": record_id,
            "standard_id": metadata.get("standard_id", record_id),
            "title": metadata.get("title", ""),
            "domain": metadata.get("domain", domain),
            "description": metadata.get("description", ""),
            "similarity_score": (
                round(1 - distance, 4) if distance is not None else None
            ),
            "document": docs[i] if i < len(docs) else "",
            "verification_status": (
                "Candidate — verify against official BIS sources"
            ),
        })

    return items


@app.get("/")
def health():
    return {
        "status": "running",
        "service": "BIS Procurement Recommendation API",
        "collection": COLLECTION_NAME,
        "indexed_records": collection.count(),
    }


@app.get("/health")
def health_check():
    return health()


@app.post("/search")
def search(
    query: str = Form(...),
    domain: str = Form(...),
):
    try:
        items = retrieve_standards(query, domain, 5)
        return {
            "query": query,
            "domain": domain,
            "count": len(items),
            "results": items,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/analyze-pdf")
async def analyze_pdf(
    file: UploadFile = File(...),
    domain: str = Form(...),
):
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=400, detail="Invalid domain.")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        with pymupdf.open(stream=data, filetype="pdf") as pdf:
            text = "\n".join(page.get_text() for page in pdf)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this PDF.")

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No selectable text found. Scanned PDFs need OCR.",
        )

    sentences = re.split(r"[\n;]+|(?<=[.!?])\s+", text)
    keywords = re.compile(
        r"test|testing|strength|quality|material|concrete|"
        r"electrical|cable|sampling|inspection|standard|specification|"
        r"voltage|current|safety|acceptance|requirement|workability",
        re.IGNORECASE,
    )

    requirements = []
    for sentence in sentences:
        sentence = re.sub(r"\s+", " ", sentence).strip(" \t-•")
        if len(sentence) >= 20 and keywords.search(sentence):
            if sentence not in requirements:
                requirements.append(sentence)
                if len(requirements) >= 10:
                    break

    if not requirements:
        requirements = [re.sub(r"\s+", " ", text).strip()[:500]]

    analyses = []
    for requirement in requirements:
        try:
            candidates = retrieve_standards(requirement, domain, 3)
        except Exception:
            candidates = []

        analyses.append({
            "requirement": requirement,
            "candidate_standards": candidates,
            "review_needed": True,
        })

    gaps = []
    if not re.search(r"\b(sample|sampling)\b", text, re.I):
        gaps.append({
            "area": "Sampling",
            "observation": "Sampling requirements were not detected.",
            "action": "Review whether sampling methods and frequency must be specified.",
        })

    if not re.search(
        r"\b(acceptance criteria|acceptance limit|tolerance)\b",
        text,
        re.I,
    ):
        gaps.append({
            "area": "Acceptance criteria",
            "observation": "Explicit acceptance criteria were not detected.",
            "action": "Review whether measurable acceptance limits are required.",
        })

    if not re.search(
        r"\b(test method|testing method|test procedure)\b",
        text,
        re.I,
    ):
        gaps.append({
            "area": "Test methods",
            "observation": "Explicit test-method wording was not detected.",
            "action": "Review whether the applicable test procedures need to be stated.",
        })

    return {
        "filename": file.filename,
        "domain": domain,
        "extracted_text_characters": len(text),
        "requirements_found": len(analyses),
        "analyses": analyses,
        "potential_gaps_for_review": gaps,
        "notice": (
            "Preliminary automated analysis only. Candidate standards and "
            "possible gaps require human review; this is not a compliance decision."
        ),
    }
