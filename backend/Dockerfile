# Use Python 3.12 slim image to reduce size
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies needed for PyTorch
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Cloud Run sets PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Run the FastAPI application
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
