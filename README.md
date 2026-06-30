# Mi Plan Financiero — Guía de instalación

App de control de gastos y plan de ahorro, sincronizada en la nube entre tú y tu pareja, instalable como app en el móvil.

## Funcionalidades

- **Sincronización en tiempo real** entre dispositivos vía Supabase (móvil, ordenador, portátil)
- **Hogar compartido**: tú y tu pareja veis los mismos datos con un código de invitación
- **PWA instalable** en el móvil (icono propio, pantalla completa, funciona offline para datos ya cargados)
- **Ciclos por nómina**: el "mes" empieza cuando cobras, no el día 1 natural
- **Botes de ahorro** que acumulan dinero ciclo a ciclo si no los gastas
- **Categorías editables**: añade, edita o elimina, con reasignación de saldo si tienen bote
- **Gastos fijos automáticos**: banner que propone confirmarlos al inicio de cada ciclo
- **Múltiples metas de ahorro** (viajes, coche, emergencia…) además de la meta de la casa
- **Historial de ciclos** con comparativa lado a lado entre dos periodos
- **Simulador de hipoteca** solo o en pareja, con análisis de esfuerzo financiero
- **Reportes** con gráficos, exportables a PDF y Excel
- **Notificaciones push** cuando superas el 80% o 100% de una categoría
- **Consejero financiero IA** (modo gratuito copiar/pegar o con API key para respuestas directas)
- **Modo oscuro**

## 1. Configurar Supabase (5 min)

1. Ve a [supabase.com](https://supabase.com) → "Start your project" → crea cuenta
2. "New project" → región **West EU (Ireland)** → guarda la contraseña de la BD
3. Espera ~2 min a que arranque
4. Ve a **SQL Editor** → "New query" → pega TODO el contenido de `supabase_schema.sql` → "Run"
5. Ve a **Authentication → Providers** → activa "Email" (ya viene activo por defecto)
6. (Opcional, recomendado) Activa "Google" como provider si quieres login con Google:
   - Necesitas un Client ID de Google Cloud Console
   - Si no quieres configurarlo ahora, el login por email/contraseña funciona igual
7. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

## 2. Configurar variables de entorno

Copia `.env.example` a `.env.local` y rellena:

```
REACT_APP_SUPABASE_URL=https://tu-proyecto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

## 3. Instalar y probar en local

```bash
npm install
npm start
```

Se abrirá en `http://localhost:3000`. Crea tu cuenta, luego comparte el código de invitación (en Ajustes → Hogar compartido) con tu pareja para que se una desde otro dispositivo.

## 4. Desplegar en Vercel (gratis)

### Opción A — Desde la web de Vercel
1. Sube este código a un repositorio de GitHub
2. Ve a [vercel.com](https://vercel.com) → "Add New Project" → importa el repo
3. En "Environment Variables" añade:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
4. Deploy

### Opción B — Desde la terminal
```bash
npm install -g vercel
vercel login
vercel --prod
```
Te preguntará las variables de entorno la primera vez.

## 5. Instalar como app en el móvil (PWA)

Una vez desplegado en Vercel (URL tipo `https://miplan-financiero.vercel.app`):

**iPhone (Safari):**
1. Abre la URL en Safari
2. Pulsa el botón "Compartir" (cuadrado con flecha)
3. "Añadir a pantalla de inicio"

**Android (Chrome):**
1. Abre la URL en Chrome
2. Aparecerá un banner "Instalar app" automáticamente, o
3. Menú (⋮) → "Instalar aplicación"

La app se instalará con icono propio, pantalla completa, y funcionará offline para ver datos ya cargados.

## 6. Generar los iconos de la PWA

Necesitas crear `public/icon-192.png` y `public/icon-512.png`. Puedes:
- Usar [realfavicongenerator.net](https://realfavicongenerator.net) con tu logo
- O generarlos rápido con un emoji 🏠 en [favicon.io](https://favicon.io/emoji-favicons/house)

## Estructura del proyecto

```
src/
  lib/
    supabase.js   → todas las llamadas a la base de datos
    finance.js    → cálculos financieros (ciclos, botes, hipoteca...)
  pages/          → una página por ruta
  components/     → Layout, modales reutilizables
  styles/         → CSS global con variables de tema
supabase_schema.sql → ejecutar una vez en Supabase SQL Editor
```

## Notas importantes

- **Row Level Security** está activado: cada usuario solo ve los datos de su hogar
- **Tiempo real**: si tu pareja añade un gasto, lo ves al instante sin recargar
- **API key de IA**: se guarda en `localStorage` del navegador, no en la base de datos (cada dispositivo necesita la suya, o usar el modo gratuito de copiar/pegar)
