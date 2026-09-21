FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy backend code
COPY backend/ /app/backend/

# Copy database setup scripts
COPY database/ /app/database/
COPY scripts/ /app/scripts/

WORKDIR /app/backend

RUN mkdir -p /app/uploads/disease /app/uploads/voice

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
