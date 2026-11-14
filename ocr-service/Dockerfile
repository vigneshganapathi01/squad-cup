FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py parser.py ./
# Download the OCR models at build time so the first request is fast
RUN python -c "import app; app.engines()"
RUN useradd -m ocr && cp -r /root/.paddlex /home/ocr/ && chown -R ocr /home/ocr/.paddlex
USER ocr
EXPOSE 8765
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
