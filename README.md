# Mi Plan Financiero — Guía de instalación

App de control de gastos y plan de ahorro, sincronizada en la nube entre tú y tu pareja, instalable como app en el móvil.

## Tu configuración

- **Supabase**: `https://hbtogqkofnitfufmluik.supabase.co`
- **GitHub**: `https://github.com/vctr1313/miplan-financiero`

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

## Pasos exactos para desplegar

### 1. Ejecutar el SQL en Supabase (5 min, solo una vez)

1. Ve a tu proyecto: [supabase.com/dashboard/project/hbtogqkofnitfufmluik](https://supabase.com/dashboard/project/hbtogqkofnitfufmluik)
2. Menú lateral → **SQL Editor** → **New query**
3. Abre `supabase_schema.sql` (incluido en este paquete), copia TODO el contenido, pégalo en el editor
4. Pulsa **Run** (o Ctrl+Enter)
5. Deberías ver "Success. No rows returned" — eso confirma que las 7 tablas, políticas RLS y triggers se crearon bien

### 2. Subir el código a tu GitHub

Este paquete ya viene con un repositorio git inicializado y el primer commit hecho. Solo te falta conectarlo a tu GitHub y subirlo:

```bash
cd miplan
git remote add origin https://github.com/vctr1313/miplan-financiero.git
git push -u origin main
```

Si te pide autenticación, usa un [Personal Access Token](https://github.com/settings/tokens) de GitHub como contraseña (no la contraseña normal de tu cuenta).

### 3. Probar en local (opcional pero recomendado)

El archivo `.env.local` con tus credenciales de Supabase ya está creado dentro de la carpeta `miplan/`. Solo necesitas:

```bash
cd miplan
npm install
npm start
```

Se abre en `http://localhost:3000`. Crea tu cuenta con tu email, confirma el correo, y ya puedes usar la app. Para que tu pareja se una, comparte el código de invitación que aparece en **Ajustes → Hogar compartido**.

### 4. Desplegar en Vercel (gratis, ~3 min)

1. Ve a [vercel.com/new](https://vercel.com/new)
2. "Import Git Repository" → busca `vctr1313/miplan-financiero` → **Import**
3. En "Environment Variables" añade estas dos (cópialas tal cual):

   | Name | Value |
   |---|---|
   | `REACT_APP_SUPABASE_URL` | `https://hbtogqkofnitfufmluik.supabase.co` |
   | `REACT_APP_SUPABASE_ANON_KEY` | (la clave larga que empieza por `eyJhbGci...`, está en tu `.env.local`) |

4. Pulsa **Deploy**

En ~2 minutos tendrás una URL tipo `https://miplan-financiero.vercel.app` funcionando con HTTPS automático.

### 5. Instalar como app en el móvil (PWA)

Una vez tengas la URL de Vercel:

**iPhone (Safari):**
1. Abre la URL en Safari
2. Pulsa el botón "Compartir" (cuadrado con flecha)
3. "Añadir a pantalla de inicio"

**Android (Chrome):**
1. Abre la URL en Chrome
2. Aparecerá un banner "Instalar app" automáticamente, o
3. Menú (⋮) → "Instalar aplicación"

La app se instalará con icono propio, pantalla completa, y funcionará offline para ver datos ya cargados.

### 6. Generar los iconos de la PWA (opcional)

Necesitas crear `public/icon-192.png` y `public/icon-512.png` para que el icono se vea bien al instalar. Puedes:
- Usar [realfavicongenerator.net](https://realfavicongenerator.net) con tu logo
- O generarlos rápido con un emoji 🏠 en [favicon.io](https://favicon.io/emoji-favicons/house)

Sin estos archivos la app funciona igual, pero el icono al instalar será genérico.

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
