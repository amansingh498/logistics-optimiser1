# Logistics Optimiser

This project consists of a C++ optimization engine, a FastAPI backend, and a React frontend.

## Demo Deployment

For a free public demo, deploy:

- `frontend` to Cloudflare Pages
- `backend/api` to Render Free

Notes:

- If the Windows native solver module is unavailable, the backend falls back to the Python solver. That is slower, but it runs cleanly on typical free Linux hosts.
- Saved scenarios use SQLite by default. On Render Free, local files are ephemeral, so saved scenarios are temporary demo data.

### Frontend settings

Set this environment variable in Cloudflare Pages:

```text
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

You can copy [frontend/.env.example](./.env.example) for local development.

### Backend settings

Render can deploy from [render.yaml](../render.yaml) or from the dashboard with:

```text
Root Directory: backend/api
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set this environment variable on Render:

```text
CORS_ORIGINS=https://your-pages-project.pages.dev
```

## Prerequisites

- **C++ Compiler:** GCC/MinGW (supporting C++17)
- **CMake:** Version 3.16+
- **Python:** Version 3.8+
- **Node.js:** Version 18+

## Manual Startup Instructions

### 1. Build the C++ Engine
The core logic is written in C++ and needs to be compiled as a Python module.

```powershell
cd backend/engine
mkdir build
cd build
cmake .. -G "MinGW Makefiles"
cmake --build .
```

### 2. Setup the Backend API
The API handles requests and interfaces with the C++ engine.

```powershell
cd backend/api
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Copy the compiled engine module to the API directory
copy ..\engine\build\logistics_engine.*.pyd .

# Start the server
python -m uvicorn main:app --port 8000
```

### 3. Setup the Frontend
The frontend provides the user interface.

```powershell
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

---

# React + Vite (Original Template)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)
