"""Dataset management endpoints."""

from fastapi import APIRouter
from training.datasets import BUILTIN_DATASETS

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
            "data_modality": info["data_modality"],
            "dataset_size": info["dataset_size"],
        }
        for dataset_id, info in BUILTIN_DATASETS.items()
    ]
