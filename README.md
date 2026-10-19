# ScreenForge AI

> **Text-Driven Screen Recorder & Video Editor**  
> An agile alternative to Loom engineered for technical creators: edit spoken video by editing the transcript.

---

## 🛠 System Architecture (Option C: Hybrid)

- **Frontend (`frontend/`)**: Next.js 16 (React 19), TypeScript, Tailwind CSS, Web Audio API, MediaRecorder API.
- **Backend (`backend/`)**: Python FastAPI, Uvicorn, FFmpeg Core Engine, Multi-provider AI orchestration (Groq, Cerebras, Together AI).

---

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
Backend API docs available at: `http://localhost:8000/docs`

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in Google Chrome.

---

## 🧪 Testing

### Backend Tests
```bash
cd backend
.venv\Scripts\pytest -v
```

### Frontend Typecheck & Lint
```bash
cd frontend
npm run lint
npm run build
```
