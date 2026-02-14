import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import graphs, datasets, training

# So training WebSocket and loss logs are visible in the terminal
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(name)s: %(message)s",
)

app = FastAPI(
    title="NeuralCanvas API",
    description="Backend API for NeuralCanvas — visual ML model building, training, and evaluation",
    version="0.1.0",
)

# CORS — allow the Next.js frontend at localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphs.router)
app.include_router(datasets.router)
app.include_router(training.router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "NeuralCanvas API"}


@app.get("/health")
async def health_check():
    import torch
    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
    }
