# AIPlayground Backend

Create and activate a virtualenv (use the name `.venv` so it stays out of the way):

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Run the API:

```bash
python -m uvicorn main:app --reload --port 8000
```

Use `main:app` (the app lives in `main.py`), not `app.main:app`.
