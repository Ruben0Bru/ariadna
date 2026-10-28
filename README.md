# Ariadna — Tutor Inteligente de Cálculo I

Sistema de tutoría neuro-simbólica para el aprendizaje de derivadas, diseñado para una investigación con tres grupos experimentales. Stack: **Next.js 16 (App Router) + Supabase + Gemini + math.js**, desplegado en Vercel.

## Descripción

Ariadna combina un juez matemático en JavaScript (`mathVerify.ts`) con mediación pedagógica vía LLM (Gemini) para dar retroalimentación Socrática a estudiantes de Cálculo I. Registra cada intento, chat y sesión en Supabase para el análisis de la tesis.

## Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Chat con tutor (Gemini)
│   │   ├── class-session-status/      # Estado de sesión de clase activa
│   │   ├── exercises/route.ts         # CRUD de ejercicios
│   │   ├── feedback/route.ts          # Feedback LLM tras un intento
│   │   ├── login/route.ts             # Autenticación de estudiante/docente
│   │   ├── seed/route.ts              # Seed inicial de la BD
│   │   ├── sessions/route.ts          # Gestión de sesiones de clase
│   │   ├── teacher/                   # Datos del panel docente
│   │   └── verify/route.ts            # Verificación matemática
│   ├── login/page.tsx                 # Página de ingreso
│   ├── teacher/page.tsx               # Panel de docente
│   └── page.tsx                       # Tutor principal (AriadnaApp)
├── components/
│   ├── AriadnaApp.tsx                 # Lógica interactiva principal
│   ├── ChatPanel.tsx                  # Chat con Ariadna
│   ├── ConceptCard.tsx                # Tarjeta de concepto del nodo
│   ├── FeedbackBox.tsx                # Feedback de intento
│   └── ThreadMap.tsx                  # Visualización del grafo DAG
└── lib/
    ├── dag.ts                         # DAG curricular y ejercicios base
    ├── session.ts                     # Manejo de sesión de usuario
    ├── symbolicJudge.ts               # Juez matemático (math.js, servidor)
    └── utils.ts                       # Utilidades compartidas
supabase/
├── schema.sql                         # Esquema inicial (referencia)
└── migrations/
    └── 001_schema_v2.sql              # Migración activa: ejecutar en Supabase
```

## Desarrollo local

```bash
# 1. Clonar e instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local con tus claves de Supabase y Gemini

# 3. Ejecutar migraciones en Supabase
# → Abre supabase/migrations/001_schema_v2.sql en el SQL Editor de Supabase y ejecútalo

# 4. Iniciar servidor de desarrollo
npm run dev
# → http://localhost:3000
```

## Variables de entorno (obligatorias en producción)

| Variable | Dónde obtenerla | Lado |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API | Servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Servidor |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Servidor |

> **Seguridad:** Todas las claves son exclusivamente del servidor. Ninguna se expone al navegador. El acceso a Supabase usa solo la `service_role_key` desde API routes de Next.js.

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. Importa el proyecto en [vercel.com](https://vercel.com).
3. En **Settings → Environment Variables**, agrega las 3 variables de la tabla anterior.
4. Vercel detecta Next.js automáticamente — haz clic en **Deploy**.

## Grupos experimentales

| Código | Grupo | Comportamiento |
|---|---|---|
| `G1-xxx` | Control | Sin acceso a Ariadna |
| `G2-xxx` | Híbrido | Clase magistral + Ariadna como apoyo en taller |
| `G3-xxx` | Autónomo | Ariadna como tutor completo |
| `PROF-xxx` | Docente | Acceso al panel de gestión |
