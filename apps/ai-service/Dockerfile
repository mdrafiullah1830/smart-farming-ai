FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

# Install Python dependencies
COPY apps/ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy application code (includes prebuilt travel RAG index when committed)
COPY apps/ai-service/app/ /app/app/

# Rebuild RAG index only if prebuilt artifacts are missing from the clone.
# A full rebuild downloads a HuggingFace model and is the usual Render free-tier timeout.
RUN if [ ! -f /app/app/travel/data/index/travel_index.faiss ] \
    || [ ! -f /app/app/travel/data/index/travel_metadata.pkl ]; then \
      echo "Prebuilt travel index missing — rebuilding"; \
      python -m app.travel.rag.index_builder; \
    else \
      echo "Using prebuilt travel RAG index"; \
    fi

# Pre-exported ONNX artifacts
COPY apps/ai-service/models/ /app/models/

EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
