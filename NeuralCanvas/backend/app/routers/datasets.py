"""Dataset management endpoints."""

from fastapi import APIRouter
from app.training.datasets import BUILTIN_DATASETS

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("/")
async def list_datasets():
    """List all available datasets."""
    return [
        {
            "id": dataset_id,
            "name": info["name"],
            "description": info["description"],
            "input_shape": list(info["input_shape"]),
            "num_classes": info["num_classes"],
        }
        for dataset_id, info in BUILTIN_DATASETS.items()
    ]
