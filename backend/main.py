"""AIPlayground Backend - FastAPI server for visual ML model building."""

import os

# Set SSL certs before any imports that trigger downloads (e.g. torchvision
# datasets). Ensures MNIST/CIFAR-10 etc. can download on systems where Python
# doesn't use the system CA bundle (e.g. some macOS installs).
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import feedback, graphs, datasets, training, models
from config import settings

app = FastAPI(
    title="AIPlayground API",
    description="Backend for visual ML model building, training, and evaluation",
    version="0.1.0",
)

# CORS: allow frontend to connect
# Get allowed origins from environment variable or use defaults
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feedback.router)
app.include_router(graphs.router)
app.include_router(datasets.router)
app.include_router(training.router)
app.include_router(models.router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "AIPlayground API"}


@app.get("/health")
async def health():
    import torch

    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        "runpod_enabled": settings.runpod_enabled,
        "mode": "runpod" if settings.runpod_enabled else "local",
    }
