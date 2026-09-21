FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (lightweight — no ML libs)
COPY backend/requirements-api.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy backend code
COPY backend/main.py /app/backend/main.py

# Copy database setup script and seeds
COPY scripts/setup_db.py /app/scripts/setup_db.py
COPY database/seeds/ /app/database/seeds/

# Create SQLite database at build time
RUN cd /app && python scripts/setup_db.py

WORKDIR /app/backend

RUN mkdir -p /app/uploads/disease /app/uploads/voice

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
