"""RunPod Flash remote training function."""

from runpod_flash import remote, LiveServerless, GpuGroup
import asyncio


# Configure GPU resources for RunPod Flash
gpu_config = LiveServerless(
    name="aiplayground-training-classification",  # Bumped to force fresh container build
    gpus=[GpuGroup.AMPERE_24],  # Using A4000/RTX 3090 (24GB) - more available and cheaper
    workersMax=2,  # Reduced to 1 for faster initialization
    workersMin=1,  # Auto-scale from 0 (no idle workers)
    idleTimeout=300  # Scale down after 10 seconds of inactivity
)


@remote(
    resource_config=gpu_config,
    dependencies=[
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "pydantic==2.10.4",
        "git+https://github.com/Ryan6407/AIPlayground.git@main#subdirectory=backend",
        "requests>=2.28.0",
        "Pillow>=10.0.0",
    ]
)
async def train_model_flash(graph_dict: dict, dataset_id: str, config_dict: dict, job_id: str = None, backend_url: str = None, model_upload_url: str = None, custom_dataset_meta: dict = None, custom_dataset_signed_url: str = None):
    """
    Remote training function that runs on RunPod Flash GPU.

    This function is automatically containerized and deployed by RunPod Flash.
    Supports real-time epoch callbacks to stream progress during training.

    Args:
        graph_dict: GraphSchema as dict
        dataset_id: "mnist", "fashion_mnist", "cifar10", or "custom:<uuid>"
        config_dict: TrainingConfig as dict
        job_id: Training job ID (for callbacks)
        backend_url: Backend URL for callbacks (e.g., http://localhost:8000)
        custom_dataset_meta: Metadata dict for custom datasets (from Supabase)
        custom_dataset_signed_url: GCS signed URL for downloading the custom dataset

    Returns:
        Dict with training history and final model state_dict
    """
    import torch
    import torch.nn as nn
    import time
    import base64
    import io

    # Import from backend modules (Flash copies these automatically)
    from compiler.model_builder import build_model
    from compiler.validator import validate_graph, ValidationError
    from training.datasets import get_dataloaders, get_dataset_shape, register_custom_dataset
    from models.schemas import GraphSchema, TrainingConfig

    try:
        # Register custom dataset if provided
        if dataset_id.startswith("custom:") and custom_dataset_meta and custom_dataset_signed_url:
            print(f"[FLASH] Registering custom dataset: {dataset_id}, format={custom_dataset_meta.get('format')}, shape={custom_dataset_meta.get('input_shape')}")
            register_custom_dataset(dataset_id, custom_dataset_meta, custom_dataset_signed_url)
            print("[FLASH] Custom dataset registered OK")

        # Parse and validate inputs
        graph = GraphSchema(**graph_dict)
        config = TrainingConfig(**config_dict)
        print(f"[FLASH] Parsed graph and config OK, epochs={config.epochs}, batch_size={config.batch_size}")

        # Build model
        input_shape = get_dataset_shape(dataset_id)
        print(f"[FLASH] Dataset shape: {input_shape}")
        model = build_model(graph, input_shape)
        print(f"[FLASH] Model built OK")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)
        print(f"[FLASH] Model on {device}")

        # Load data
        print(f"[FLASH] Loading dataloaders...")
        # Read Augment block config from the graph: when Input -> Augment and the
        # dataset is image-based, we pass augmentations to get_dataloaders so the
        # training split is augmented on the GPU; validation data is unaugmented.
        IMAGE_DATASETS = {"mnist", "fashion_mnist", "cifar10"}
        augment_config = None
        if dataset_id.lower() in IMAGE_DATASETS:
            input_nodes = [n for n in graph.nodes if n.type == "input"]
            if input_nodes:
                input_id = input_nodes[0].id
                targets_from_input = [e.target for e in graph.edges if e.source == input_id]
                augment_nodes = [n for n in graph.nodes if n.type == "augment" and n.id in targets_from_input]
                if augment_nodes:
                    aug_list = augment_nodes[0].params.get("augmentations")
                    if isinstance(aug_list, list) and aug_list:
                        augment_config = aug_list

        # Load data (always from Input block's dataset_id; augment_config only adds train-time transforms)
        train_loader, val_loader = get_dataloaders(
            dataset_id, config.batch_size, config.train_split, augment_config=augment_config
        )
        print(f"[FLASH] Dataloaders ready: {len(train_loader)} train batches, {len(val_loader)} val batches")

        # Setup loss function
        output_nodes = [n for n in graph.nodes if n.type == "output"]
        loss_fn_name = output_nodes[0].params.get("loss_fn", "CrossEntropyLoss") if output_nodes else "CrossEntropyLoss"
        loss_fn_map = {
            "CrossEntropyLoss": nn.CrossEntropyLoss(),
            "MSELoss": nn.MSELoss(),
            "BCEWithLogitsLoss": nn.BCEWithLogitsLoss(),
        }
        loss_fn = loss_fn_map.get(loss_fn_name, nn.CrossEntropyLoss())

        # CrossEntropyLoss includes LogSoftmax internally, so having an explicit
        # Softmax layer causes LogSoftmax(Softmax(x)) which kills gradients.
        # Replace any trailing Softmax with Identity for these loss functions.
        if loss_fn_name in ("CrossEntropyLoss", "BCEWithLogitsLoss"):
            layers = model.layers
            layer_keys = list(layers.keys())
            if layer_keys:
                last_layer = layers[layer_keys[-1]]
                if isinstance(last_layer, nn.Softmax):
                    layers[layer_keys[-1]] = nn.Identity()
                    print(f"[FLASH] Replaced trailing Softmax with Identity (incompatible with {loss_fn_name})")

        # Setup optimizer
        opt_map = {
            "adam": lambda params, lr: torch.optim.Adam(params, lr=lr),
            "sgd": lambda params, lr: torch.optim.SGD(params, lr=lr),
            "adamw": lambda params, lr: torch.optim.AdamW(params, lr=lr),
        }
        opt_factory = opt_map.get(config.optimizer, opt_map["adam"])
        optimizer = opt_factory(model.parameters(), config.learning_rate)

        start_time = time.time()

        # Collect training history
        history = {
            "epochs": [],
            "device": str(device),
            "total_epochs": config.epochs,
            "total_batches": len(train_loader)
        }

        # Training loop
        for epoch in range(1, config.epochs + 1):
            # Train phase
            model.train()
            epoch_loss = 0.0
            correct = 0
            total = 0

            for batch_idx, (data, target) in enumerate(train_loader):
                data, target = data.to(device), target.to(device)
                optimizer.zero_grad()
                output = model(data)
                loss = loss_fn(output, target)
                loss.backward()
                optimizer.step()

                epoch_loss += loss.item()
                _, predicted = output.max(1)
                total += target.size(0)
                correct += predicted.eq(target).sum().item()

            train_loss = epoch_loss / len(train_loader)
            train_acc = correct / total if total > 0 else 0

            # Validation phase
            model.eval()
            val_loss = 0.0
            val_correct = 0
            val_total = 0

            with torch.no_grad():
                for data, target in val_loader:
                    data, target = data.to(device), target.to(device)
                    output = model(data)
                    loss = loss_fn(output, target)
                    val_loss += loss.item()
                    _, predicted = output.max(1)
                    val_total += target.size(0)
                    val_correct += predicted.eq(target).sum().item()

            val_loss /= len(val_loader)
            val_acc = val_correct / val_total if val_total > 0 else 0
            elapsed = time.time() - start_time

            # Record epoch metrics
            epoch_data = {
                "epoch": epoch,
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6),
                "train_acc": round(train_acc, 4),
                "val_acc": round(val_acc, 4),
                "elapsed_sec": round(elapsed, 1)
            }
            history["epochs"].append(epoch_data)

            # Send callback to backend if configured
            if job_id and backend_url:
                try:
                    import requests
                    callback_url = f"{backend_url}/api/training/{job_id}/callback"
                    requests.post(
                        callback_url,
                        json={"type": "epoch", **epoch_data},
                        timeout=5
                    )
                except Exception as e:
                    print(f"Callback failed (continuing): {e}")

        # Serialize model
        model_bytes = io.BytesIO()
        torch.save(model.state_dict(), model_bytes)
        model_data = model_bytes.getvalue()
        model_size = len(model_data)
        print(f"[FLASH] Model serialized: {model_size} bytes")

        result = {
            "type": "completed",
            "history": history,
            "final_metrics": {
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6),
                "train_acc": round(train_acc, 4),
                "val_acc": round(val_acc, 4)
            },
            "model_size_bytes": model_size,
        }

        # Upload model to GCS via signed URL to avoid RunPod response size limits
        if model_upload_url:
            import requests
            print(f"[FLASH] Uploading model to GCS...")
            resp = requests.put(
                model_upload_url,
                data=model_data,
                headers={"Content-Type": "application/octet-stream"},
                timeout=120,
            )
            resp.raise_for_status()
            print(f"[FLASH] Model uploaded to GCS OK")
            # Return the GCS path so backend can download it
            result["model_gcs_path"] = f"models/{job_id}/model_state_dict.pt"
        else:
            # Fallback: return inline (works for small models)
            result["model_state_dict_b64"] = base64.b64encode(model_data).decode()

        return result

    except Exception as e:
        import traceback
        return {
            "type": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }
