FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

# Install Python dependencies
COPY apps/ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy application code
COPY apps/ai-service/app ./app

# Pre-exported ONNX artifacts (scripts/export_models_to_onnx.py). The health
# endpoint reports any missing graph as `unavailable`, so a stale build still
# serves the domains it has.
COPY apps/ai-service/models ./models

EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
