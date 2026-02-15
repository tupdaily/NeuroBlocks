"""
Multi-format input processing for inference.

Converts images, text, and tensor files to normalized input tensors.
"""

import io
import base64
from typing import Tuple, List, Dict, Any, Optional
import logging

import torch
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class ImageProcessor:
    """Process image files into normalized tensors."""

    @staticmethod
    def process(
        file_bytes: bytes,
        override_width: Optional[int] = None,
        override_height: Optional[int] = None,
        override_channels: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Process an image file into a normalized tensor.

        Args:
            file_bytes: Raw image file bytes (PNG, JPG, etc.)
            override_width: Force resize to this width (optional)
            override_height: Force resize to this height (optional)
            override_channels: Force convert to this many channels, 1 (grayscale) or 3 (RGB)

        Returns:
            Dictionary with:
            - tensor_data: Normalized [0, 1] flattened as list[list[float]]
            - actual_shape: Tuple (height, width, channels)
            - preview_b64: Base64 thumbnail for display (optional)
        """

        try:
            # Load image
            image = Image.open(io.BytesIO(file_bytes))

            # Detect dimensions
            width, height = image.size
            num_channels = len(image.getbands())

            # Apply overrides if provided
            if override_width or override_height:
                new_width = override_width or width
                new_height = override_height or height
                image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                width, height = new_width, new_height

            # Convert channels if requested
            if override_channels:
                if override_channels == 1 and num_channels > 1:
                    image = image.convert("L")
                    num_channels = 1
                elif override_channels == 3 and num_channels != 3:
                    image = image.convert("RGB")
                    num_channels = 3
            else:
                # Auto-detect: convert grayscale to 1 channel, RGB to 3
                if num_channels == 4:  # RGBA
                    image = image.convert("RGB")
                    num_channels = 3
                elif num_channels == 1:  # Grayscale
                    num_channels = 1

            # Convert to array and normalize to [0, 1]
            img_array = np.array(image, dtype=np.float32)
            if img_array.max() > 1:
                img_array = img_array / 255.0

            # Flatten to list for JSON serialization
            # Shape is (H, W, C) or (H, W) for grayscale
            if num_channels == 1 and len(img_array.shape) == 2:
                # Grayscale: add channel dimension
                img_array = np.expand_dims(img_array, axis=-1)

            actual_shape = (height, width, num_channels if len(img_array.shape) == 3 else 1)
            flattened = img_array.flatten().tolist()

            return {
                "tensor_data": [flattened],  # Batch of 1
                "actual_shape": actual_shape,
                "error": None,
            }

        except Exception as e:
            logger.exception(f"Failed to process image: {e}")
            return {
                "tensor_data": None,
                "actual_shape": None,
                "error": f"Could not load image: {str(e)}",
            }


class TextProcessor:
    """Process text into OpenAI embeddings."""

    @staticmethod
    async def process(
        text: str,
        openai_client: Optional[Any] = None,
        model: str = "text-embedding-3-small",
    ) -> Dict[str, Any]:
        """
        Convert text to embeddings using OpenAI API.

        Args:
            text: Input text to embed
            openai_client: OpenAI client instance (from openai library)
            model: Embedding model to use (default: text-embedding-3-small)

        Returns:
            Dictionary with:
            - tensor_data: Embedding vector as list[list[float]] (batch of 1)
            - actual_shape: Tuple (embedding_dim,) - always 1536 for text-embedding-3-small
            - error: Error message if failed
        """

        if not openai_client:
            return {
                "tensor_data": None,
                "actual_shape": None,
                "error": "OpenAI client not configured",
            }

        if not text or not text.strip():
            return {
                "tensor_data": None,
                "actual_shape": None,
                "error": "Text input is empty",
            }

        try:
            # Call OpenAI embedding API
            response = openai_client.embeddings.create(
                input=text.strip(),
                model=model,
            )

            embedding = response.data[0].embedding
            embedding_dim = len(embedding)

            return {
                "tensor_data": [embedding],  # Batch of 1
                "actual_shape": (embedding_dim,),
                "error": None,
            }

        except Exception as e:
            logger.exception(f"Failed to generate embeddings: {e}")
            return {
                "tensor_data": None,
                "actual_shape": None,
                "error": f"Embedding failed: {str(e)}",
            }


class TensorProcessor:
    """Process PyTorch tensor files."""

    @staticmethod
    def process(file_bytes: bytes, filename: str = "tensor.pt") -> Dict[str, Any]:
        """
        Load a PyTorch tensor from file.

        Args:
            file_bytes: Raw .pt file bytes
            filename: Original filename (for debugging)

        Returns:
            Dictionary with:
            - tensor_data: Tensor data as nested list
            - actual_shape: Tuple of dimensions
            - error: Error message if failed
        """

        try:
            # Load tensor
            tensor = torch.load(io.BytesIO(file_bytes), map_location=torch.device("cpu"))

            # Convert to tensor if not already
            if not isinstance(tensor, torch.Tensor):
                tensor = torch.tensor(tensor, dtype=torch.float32)

            # Ensure it's float
            tensor = tensor.float()

            # Get shape
            tensor_shape = tuple(tensor.shape)

            # Convert to nested list (batch, features)
            if len(tensor_shape) == 1:
                # 1D tensor → [[f1, f2, ...]]
                tensor_list = [tensor.numpy().tolist()]
            elif len(tensor_shape) == 2:
                # 2D tensor → as-is
                tensor_list = tensor.numpy().tolist()
            else:
                # Multi-dim → flatten to 2D
                batch_size = tensor_shape[0]
                features = int(np.prod(tensor_shape[1:]))
                tensor_flat = tensor.view(batch_size, features)
                tensor_list = tensor_flat.numpy().tolist()
                tensor_shape = (batch_size, features)

            return {
                "tensor_data": tensor_list,
                "actual_shape": tensor_shape,
                "error": None,
            }

        except Exception as e:
            logger.exception(f"Failed to load tensor from {filename}: {e}")
            return {
                "tensor_data": None,
                "actual_shape": None,
                "error": f"Could not load tensor file: {str(e)}",
            }


async def process_input(
    input_type: str,
    file_bytes: Optional[bytes] = None,
    text_content: Optional[str] = None,
    filename: Optional[str] = None,
    openai_client: Optional[Any] = None,
    image_width: Optional[int] = None,
    image_height: Optional[int] = None,
    image_channels: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Universal input processor that handles multiple input types.

    Args:
        input_type: "image" | "text" | "tensor"
        file_bytes: Raw file bytes (for image/tensor)
        text_content: Text string (for text input)
        filename: Original filename for debugging
        openai_client: OpenAI client for text embeddings
        image_width, image_height, image_channels: Optional overrides for image processing

    Returns:
        Dictionary with tensor_data, actual_shape, and error (if any)
    """

    if input_type == "image":
        if not file_bytes:
            return {"tensor_data": None, "actual_shape": None, "error": "No image file provided"}

        result = ImageProcessor.process(
            file_bytes,
            override_width=image_width,
            override_height=image_height,
            override_channels=image_channels,
        )
        return result

    elif input_type == "text":
        if not text_content:
            return {"tensor_data": None, "actual_shape": None, "error": "No text provided"}

        result = await TextProcessor.process(text_content, openai_client)
        return result

    elif input_type == "tensor":
        if not file_bytes:
            return {"tensor_data": None, "actual_shape": None, "error": "No tensor file provided"}

        result = TensorProcessor.process(file_bytes, filename or "tensor.pt")
        return result

    else:
        return {
            "tensor_data": None,
            "actual_shape": None,
            "error": f"Unknown input type: {input_type}. Use 'image', 'text', or 'tensor'.",
        }
