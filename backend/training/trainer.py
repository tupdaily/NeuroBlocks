"""Training loop with WebSocket metric streaming."""

from __future__ import annotations
import asyncio
import logging
import time
import torch

logger = logging.getLogger(__name__)
import torch.nn as nn
from typing import Callable, Any
from models.schemas import GraphSchema, TrainingConfig
from compiler.model_builder import build_model
from training.datasets import get_dataloaders, get_dataset_shape


async def train_model(
    graph: GraphSchema,
    dataset_id: str,
    config: TrainingConfig,
    ws_callback: Callable[[dict[str, Any]], Any],
    stop_event: asyncio.Event,
) -> None:
    """Run training loop, streaming metrics via ws_callback.

    Runs the actual training in a thread to avoid blocking the event loop.
    """

    def _train_sync(
        send_msg: Callable[[dict], None],
        should_stop: Callable[[], bool],
    ):
        # Build model
        input_shape = get_dataset_shape(dataset_id)
        model = build_model(graph, input_shape)

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)

        # Load data
        train_loader, val_loader = get_dataloaders(
            dataset_id, config.batch_size, config.train_split
        )

        # Loss function from output node
        output_nodes = [n for n in graph.nodes if n.type == "output"]
        loss_fn_name = output_nodes[0].params.get("loss_fn", "CrossEntropyLoss") if output_nodes else "CrossEntropyLoss"

        loss_fn_map = {
            "CrossEntropyLoss": nn.CrossEntropyLoss(),
            "MSELoss": nn.MSELoss(),
            "BCEWithLogitsLoss": nn.BCEWithLogitsLoss(),
        }
        loss_fn = loss_fn_map.get(loss_fn_name, nn.CrossEntropyLoss())

        # Optimizer
        opt_map = {
            "adam": lambda params, lr: torch.optim.Adam(params, lr=lr),
            "sgd": lambda params, lr: torch.optim.SGD(params, lr=lr),
            "adamw": lambda params, lr: torch.optim.AdamW(params, lr=lr),
        }
        opt_factory = opt_map.get(config.optimizer, opt_map["adam"])
        optimizer = opt_factory(model.parameters(), config.learning_rate)

        send_msg({
            "type": "started",
            "total_epochs": config.epochs,
            "total_batches": len(train_loader),
            "device": str(device),
        })

        start_time = time.time()

        for epoch in range(1, config.epochs + 1):
            if should_stop():
                send_msg({"type": "stopped"})
                return

            # Train phase
            model.train()
            epoch_loss = 0.0
            correct = 0
            total = 0

            for batch_idx, (data, target) in enumerate(train_loader):
                if should_stop():
                    send_msg({"type": "stopped"})
                    return

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

                # Throttled batch update (~every 50 batches)
                if batch_idx % 50 == 0:
                    batch_loss = round(loss.item(), 6)
                    logger.info("Training batch epoch=%s batch=%s loss=%s", epoch, batch_idx, batch_loss)
                    send_msg({
                        "type": "batch",
                        "epoch": epoch,
                        "batch": batch_idx,
                        "loss": batch_loss,
                    })

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

            logger.info(
                "Training epoch=%s train_loss=%.4f val_loss=%.4f train_acc=%.2f%% val_acc=%.2f%% elapsed=%.1fs",
                epoch, train_loss, val_loss, train_acc * 100, val_acc * 100, elapsed,
            )
            send_msg({
                "type": "epoch",
                "epoch": epoch,
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6),
                "train_acc": round(train_acc, 4),
                "val_acc": round(val_acc, 4),
                "elapsed_sec": round(elapsed, 1),
            })

        send_msg({
            "type": "completed",
            "final_metrics": {
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6),
                "train_acc": round(train_acc, 4),
                "val_acc": round(val_acc, 4),
            },
        })

    # We need a thread-safe message queue to bridge sync training → async websocket
    message_queue: asyncio.Queue[dict | None] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def send_msg_threadsafe(msg: dict):
        loop.call_soon_threadsafe(message_queue.put_nowait, msg)

    def should_stop():
        return stop_event.is_set()

    # Start training in a background thread
    train_future = loop.run_in_executor(
        None, _train_sync, send_msg_threadsafe, should_stop
    )

    # Relay messages from the queue to the websocket
    try:
        while True:
            # Check if training thread is done
            done = train_future.done()

            try:
                msg = await asyncio.wait_for(message_queue.get(), timeout=0.5)
                await ws_callback(msg)

                if msg["type"] in ("completed", "stopped", "error"):
                    break
            except asyncio.TimeoutError:
                if done:
                    # Drain remaining messages
                    while not message_queue.empty():
                        msg = message_queue.get_nowait()
                        await ws_callback(msg)
                    break

    except Exception as e:
        await ws_callback({"type": "error", "message": str(e)})
    finally:
        # Ensure the training thread completes; if it raised, send error to client
        if not train_future.done():
            stop_event.set()
        try:
            exc = train_future.exception()
            if exc is not None:
                await ws_callback({"type": "error", "message": str(exc)})
        except Exception:
            pass
        try:
            await train_future
        except Exception:
            pass
