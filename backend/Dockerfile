FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (lightweight — no ML libs)
COPY backend/requirements-api.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Copy backend code
COPY backend/main.py /app/backend/main.py

# Copy database setup script, seeds and the soil survey JSON it ingests
COPY scripts/setup_db.py /app/scripts/setup_db.py
COPY database/seeds/ /app/database/seeds/
COPY datasets/soil_report_all.json /app/datasets/soil_report_all.json

# Create SQLite database at build time
RUN cd /app && python scripts/setup_db.py

WORKDIR /app/backend

RUN mkdir -p /app/uploads/disease /app/uploads/voice

EXPOSE 10000

# Render injects $PORT; always bind 0.0.0.0 so health checks can reach us.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
