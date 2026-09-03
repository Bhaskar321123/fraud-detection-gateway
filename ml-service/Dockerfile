# ── Stage 1: Build & Train ────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY features.py .
COPY train_model.py .

# Train the model during build so it's baked into the image
RUN python train_model.py

# ── Stage 2: Production ──────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Security: run as non-root
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=builder /app/model.pkl .
COPY features.py .
COPY train_model.py .
COPY app.py .

USER appuser

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5050/health')" || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5050"]
