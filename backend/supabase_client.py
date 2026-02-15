"""Supabase client and helper functions."""

from supabase import create_client, Client
from config import settings
import logging

logger = logging.getLogger(__name__)


def get_supabase_client() -> Client:
    """Create and return a Supabase client.

    Uses service role key for admin operations (bypasses RLS).
    Falls back to anon key or legacy key for read-only operations.
    """
    if not settings.supabase_url:
        raise ValueError("Supabase URL must be configured in environment")

    # Use service role key for backend operations (bypasses RLS)
    # Fall back to anon_key or legacy supabase_key if service role key not available
    api_key = (
        settings.supabase_service_role_key
        or settings.supabase_anon_key
        or settings.supabase_key
    )

    if not api_key:
        raise ValueError("Supabase API key must be configured in environment")

    return create_client(settings.supabase_url, api_key)


def save_model_to_db(
    user_id: str,
    playground_id: str,
    model_name: str,
    model_state_dict_b64: str,
    graph_json: dict,
    training_config: dict,
    final_metrics: dict,
    description: str | None = None,
):
    """Save trained model to Supabase."""
    try:
        supabase = get_supabase_client()

        # Sanitize model name for storage path (remove special chars)
        import re
        safe_model_name = re.sub(r'[^a-zA-Z0-9_-]', '_', model_name)

        # Upload model to Supabase Storage
        storage_path = f"trained-models/{user_id}/{playground_id}/{safe_model_name}"

        # Upload the model state dict
        supabase.storage.from_("ai-models").upload(
            storage_path,
            model_state_dict_b64.encode(),
            {"upsert": "true"},
        )

        logger.info(f"Uploaded model state dict to {storage_path}")

        # Save metadata to trained_models table
        response = supabase.table("trained_models").insert(
            {
                "user_id": user_id,
                "playground_id": playground_id,
                "name": model_name,
                "description": description,
                "model_storage_path": storage_path,
                "model_size_bytes": len(model_state_dict_b64) * 3 // 4,  # Base64 to bytes conversion
                "graph_json": graph_json,
                "training_config": training_config,
                "final_loss": final_metrics.get("loss"),
                "final_accuracy": final_metrics.get("accuracy"),
                "metrics_history": final_metrics.get("history"),
            }
        ).execute()

        model_id = response.data[0]["id"]
        logger.info(f"Saved model metadata to database with ID: {model_id}")
        return model_id

    except Exception as e:
        logger.exception(f"Failed to save model to Supabase: {e}")
        raise


def get_model_from_db(model_id: str):
    """Retrieve trained model metadata from Supabase."""
    try:
        supabase = get_supabase_client()

        response = supabase.table("trained_models").select("*").eq("id", model_id).single().execute()

        if not response.data:
            raise ValueError(f"Model {model_id} not found")

        return response.data

    except Exception as e:
        logger.exception(f"Failed to retrieve model from database: {e}")
        raise


def get_model_state_dict(model_id: str):
    """Download model state dict from storage."""
    try:
        model_data = get_model_from_db(model_id)
        storage_path = model_data["model_storage_path"]

        supabase = get_supabase_client()

        # Download the model state dict
        response = supabase.storage.from_("ai-models").download(storage_path)

        # Response is bytes, decode to string
        model_state_dict_b64 = response.decode()

        return model_state_dict_b64

    except Exception as e:
        logger.exception(f"Failed to download model state dict: {e}")
        raise


def list_user_models(user_id: str):
    """List all trained models for a user."""
    try:
        supabase = get_supabase_client()

        response = (
            supabase.table("trained_models")
            .select("id, playground_id, name, description, final_accuracy, final_loss, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        return response.data or []

    except Exception as e:
        logger.exception(f"Failed to list user models: {e}")
        raise


def list_playground_models(playground_id: str):
    """List all trained models for a specific playground."""
    try:
        supabase = get_supabase_client()

        response = (
            supabase.table("trained_models")
            .select("id, name, description, final_accuracy, final_loss, created_at")
            .eq("playground_id", playground_id)
            .order("created_at", desc=True)
            .execute()
        )

        return response.data or []

    except Exception as e:
        logger.exception(f"Failed to list playground models: {e}")
        raise
