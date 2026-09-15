# Ariadna — Backend de Verificación Simbólica
# Imagen mínima para desplegar el microservicio FastAPI/SymPy

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Puerto configurable — por defecto 8000
ENV PORT=8000
EXPOSE 8000

# ALLOWED_ORIGINS debe incluir la URL del frontend Next.js en producción
ENV ALLOWED_ORIGINS=http://localhost:3000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
