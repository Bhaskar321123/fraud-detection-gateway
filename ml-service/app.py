"""
FastAPI ML microservice for phishing URL classification.
Exposes POST /predict endpoint for the Node.js Gateway to call.
"""

import os
import pickle
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from features import extract_features, PROTECTED_BRANDS


# ──────────────────────────────────────────────────────────
# Model loading
# ──────────────────────────────────────────────────────────

model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the ML model on startup."""
    global model
    model_path = os.environ.get('MODEL_PATH', 'model.pkl')
    
    if not os.path.exists(model_path):
        print(f"[WARNING] Model file not found at {model_path}. Running training...")
        import train_model
        train_model.train()
    
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    print(f"[OK] XGBoost model loaded from {model_path}")
    
    yield  # App is running
    
    print("Shutting down ML service...")


# ──────────────────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────────────────

app = FastAPI(
    title="Phishing URL ML Classifier",
    description="XGBoost-powered phishing detection microservice",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────
# Request / Response Models
# ──────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    url: str


class FeatureBreakdown(BaseModel):
    url_length: float
    hostname_length: float
    has_ip_in_host: float
    at_symbol_count: float
    dash_count: float
    question_mark_count: float
    equals_count: float
    percent_count: float
    double_slash_count: float
    subdomain_depth: float
    path_depth: float
    has_https: float
    url_entropy: float
    brand_min_distance: float
    suspicious_keywords: float


class PredictResponse(BaseModel):
    url: str
    probability: float
    verdict: str
    confidence: str
    features: FeatureBreakdown
    inference_time_ms: float


# ──────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """Run ML inference on a URL and return phishing probability."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    start = time.perf_counter()
    
    # Extract features
    feature_vector = extract_features(request.url)
    X = np.array([feature_vector])
    
    # Get probability
    proba = model.predict_proba(X)[0]
    phishing_prob = float(proba[1])
    
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    
    # Determine verdict
    if phishing_prob >= 0.85:
        verdict = "critical"
        confidence = "very_high"
    elif phishing_prob >= 0.60:
        verdict = "high_risk"
        confidence = "high"
    elif phishing_prob >= 0.30:
        verdict = "suspicious"
        confidence = "medium"
    else:
        verdict = "safe"
        confidence = "low"
    
    # Build feature breakdown
    feature_names = [
        'url_length', 'hostname_length', 'has_ip_in_host',
        'at_symbol_count', 'dash_count', 'question_mark_count',
        'equals_count', 'percent_count', 'double_slash_count',
        'subdomain_depth', 'path_depth', 'has_https',
        'url_entropy', 'brand_min_distance', 'suspicious_keywords',
    ]
    features_dict = {name: val for name, val in zip(feature_names, feature_vector)}
    
    return PredictResponse(
        url=request.url,
        probability=round(phishing_prob, 4),
        verdict=verdict,
        confidence=confidence,
        features=FeatureBreakdown(**features_dict),
        inference_time_ms=elapsed_ms,
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy" if model is not None else "model_not_loaded",
        "model_loaded": model is not None,
    }
