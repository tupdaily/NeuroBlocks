# NeuroBlocks

A visual playground for building and training neural networks: drag-and-drop blocks, connect layers, save to Supabase, and run challenges.

## Repo structure

Everything lives under two main folders:

```
neuroblocks/
├── frontend/          # Next.js app (App Router, TypeScript, Tailwind)
│   └── src/
│       ├── app/             # Routes: /, /playground, /playground/[id], /login, etc.
│       ├── components/      # App-level UI: HomeDashboard, PlaygroundNeuralCanvas, etc.
│       ├── lib/             # Supabase clients, levels, playgrounds, levelGraphAdapter
│       ├── neuralcanvas/    # Visual canvas feature (blocks, canvas, peep-inside, training)
│       └── types/
├── backend/           # Python API (FastAPI, PyTorch for training)
│   └── main.py
├── package.json       # Root scripts delegate to frontend (npm run dev, build, start)
└── README.md
```

- **frontend** — The only frontend app. It contains the **NeuralCanvas** (the block-based graph editor) under `frontend/src/neuralcanvas/`: canvas, block palette, shape propagation, peep-inside visualizations, training panel.
- **backend** — Single Python service for training and any server-side APIs.

There is no separate “NeuralCanvas” repo or folder at the top level; the canvas is a feature inside the frontend.

## Quick start

```bash
# From repo root
npm install
npm run dev
# Frontend: http://localhost:3000

# Backend (separate terminal)
cd backend && python -m uvicorn main:app --reload --port 8000
# API: http://localhost:8000
```

See `frontend/SUPABASE_SETUP.md` for Supabase (auth, playgrounds, levels).
