# Ariadna — Prototipo funcional

Prototipo del tutor neuro-simbólico **Ariadna** para Cálculo I.  
Verificación simbólica local (math.js) + mediación pedagógica vía LLM (Anthropic Claude).

## Estructura del proyecto

```
src/
├── app/
│   ├── api/feedback/route.ts   # Proxy seguro a Anthropic (API Route de Next.js)
│   ├── globals.css             # Estilos del diseño original
│   ├── layout.tsx              # Layout raíz con fuentes y math.js
│   └── page.tsx                # Monta AriadnaApp
├── components/
│   ├── AriadnaApp.tsx          # Toda la lógica interactiva (client component)
│   ├── FeedbackBox.tsx         # Feedback ok/warn con loading
│   └── ThreadMap.tsx           # Visualización del grafo DAG
└── lib/
    ├── dag.ts                  # Datos del DAG curricular y ejercicios
    └── symbolicJudge.ts        # Juez simbólico local (multi-punto)
```

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar la clave de Anthropic (opcional — sin ella funciona con fallback)
cp .env.example .env.local
# Edita .env.local y agrega tu ANTHROPIC_API_KEY=sk-ant-...

# 3. Iniciar servidor de desarrollo
npm run dev
# → http://localhost:3000
```

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. Importa el proyecto en [vercel.com](https://vercel.com).
3. En **Settings → Environment Variables**, agrega `ANTHROPIC_API_KEY` con tu clave.
4. Vercel detecta Next.js automáticamente — haz clic en **Deploy**.

> **Nota de seguridad:** La clave de Anthropic nunca se expone al navegador.  
> Toda comunicación con la API pasa por la API Route `/api/feedback` del servidor.
