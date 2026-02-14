"""Dataset management: built-in datasets via torchvision."""

from __future__ import annotations
import torch
from torch.utils.data import DataLoader, random_split
import torchvision
import torchvision.transforms as transforms


BUILTIN_DATASETS = {
    "mnist": {
        "name": "MNIST",
        "description": "Handwritten digits, 28x28 grayscale",
        "input_shape": (1, 28, 28),
        "num_classes": 10,
    },
    "fashion_mnist": {
        "name": "Fashion-MNIST",
        "description": "Clothing items, 28x28 grayscale",
        "input_shape": (1, 28, 28),
        "num_classes": 10,
    },
    "cifar10": {
        "name": "CIFAR-10",
        "description": "32x32 color images, 10 classes",
        "input_shape": (3, 32, 32),
        "num_classes": 10,
    },
}


def get_dataset_info(dataset_id: str) -> dict | None:
    return BUILTIN_DATASETS.get(dataset_id)


def get_dataset_shape(dataset_id: str) -> tuple[int, ...]:
    info = BUILTIN_DATASETS.get(dataset_id)
    if info is None:
        raise ValueError(f"Unknown dataset: {dataset_id}")
    return info["input_shape"]


def load_dataset(dataset_id: str) -> torchvision.datasets.VisionDataset:
    """Load a built-in dataset."""
    transform = transforms.Compose([transforms.ToTensor()])

    match dataset_id:
        case "mnist":
            return torchvision.datasets.MNIST(
                "./data", train=True, download=True, transform=transform
            )
        case "fashion_mnist":
            return torchvision.datasets.FashionMNIST(
                "./data", train=True, download=True, transform=transform
            )
        case "cifar10":
            return torchvision.datasets.CIFAR10(
                "./data", train=True, download=True, transform=transform
            )
        case _:
            raise ValueError(f"Unknown dataset: {dataset_id}")


def get_dataloaders(
    dataset_id: str,
    batch_size: int = 64,
    train_split: float = 0.8,
) -> tuple[DataLoader, DataLoader]:
    """Load dataset and split into train/validation DataLoaders."""
    dataset = load_dataset(dataset_id)

    train_size = int(len(dataset) * train_split)
    val_size = len(dataset) - train_size

    train_dataset, val_dataset = random_split(
        dataset,
        [train_size, val_size],
        generator=torch.Generator().manual_seed(42),
    )

    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_dataset, batch_size=batch_size, shuffle=False, num_workers=0
    )

    return train_loader, val_loader
