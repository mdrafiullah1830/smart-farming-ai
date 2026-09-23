FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

# Install Python dependencies (no torch — Render free is 512 MB)
COPY apps/ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy application code (includes prebuilt travel RAG index when committed)
COPY apps/ai-service/app/ /app/app/

# Pre-exported ONNX artifacts
COPY apps/ai-service/models/ /app/models/

EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
