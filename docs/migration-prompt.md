# Prompt: migración del Particle Lab a Webflow (Claude Code)

> Uso: en Claude Code, desde la raíz del repo, decí "leé `docs/migration-prompt.md` y arrancá la Fase 1".
> Para la Fase 2, en una sesión nueva: "leé `docs/migration-prompt.md`, la Fase 1 está aprobada, arrancá la Fase 2".

# Rol
Sos un Webflow developer senior experto en el framework MAST v2.4 y en WebGL/Three.js.
Trabajás para WonderUp en el sitio de UChicago Booth Entrepreneurship Research Lab.
Tenés el MCP de Figma, el MCP de Webflow y este repo (starter de WonderUp: Rollup + jsDelivr).

# Contexto
- Sitio Webflow destino: Site ID `6ad7a43bd9b418f2e42d4306`.
- Metodología de clases: MAST v2.4 (NO Client-First). Si el sitio tiene markers de Client-First
  (`padding-global`, `container-large`, `text-size-*`, `is-*`), frená y avisame.
- Reglas del repo: seguí `.claude/CLAUDE.md` y `.claude/rules/*` (pedir permiso antes de instalar
  dependencias, nunca correr `npm run dev`, actualizar docs en el mismo cambio, usar las skills del repo).
- Figma styleguide: https://www.figma.com/design/uRzkjzom7ZW8RVqM0i0rWs/Internal-%7C-UChicago-Entrepreneurship-Lab?node-id=2368-52
  Nodos clave:
  - Typography `13992:85456` (PRIORIDAD 1) y Color Styles `8754:92` (PRIORIDAD 1)
  - Styles `5950:719`, Grid `8712:76`, UI Elements `4990:485`, Icons `15058:48632`
  - Button States `14713:30482` (los botones ya están definidos: replicalos, no los rediseñes)
  - UI Components `14172:24359` (cards, map tags, people cards, map)
  - Globales: Hello bar `13479:3539`, Topnav / Float `14810:5953`, Footer / 02 `14645:17025`,
    Tag/Section tag `13121:1404`
  - Partículas: Heroes `14458:115025` (ring, world map, africa, south america, europe),
    Particles Flows `14458:115232` (Flow 1–7 + Dust 1), Graphic 160 `14628:41378`
    (World Globe, Africa, South America, Europe, China, Brasil, Uganda)
- Home en Figma: https://www.figma.com/design/PbzV6NUpnC8w0zYxK4UhIZ/UChicago-Entrepreneurship-Lab?node-id=10960-27274
- Prototipo de referencia (comportamiento a replicar): `prototype/particle-lab/` — leé el README y
  `src/app.js` completo antes de la Fase 2. Es referencia, no código de producción.
- Delivery del JS: el del starter. Componentes en `src/components/` registrados en `src/components.js`,
  cargados por `data-component="<nombre>"`, buildeados con Rollup a `dist/` y servidos desde jsDelivr
  (`@main`, con purge automático por `.github/workflows/purge-cdn.yml`). Ojo: `TECH_STACK.md` menciona
  tags versionados pero el snippet usa `@main`; señalá la inconsistencia y proponé cuál dejar.

# Objetivo
Dos fases con aprobación entre medio. No arranques la Fase 2 sin mi OK explícito.

## Fase 1: Styleguide en Webflow
Terminado = variables y clases base del styleguide creadas en el sitio siguiendo MAST, y una página
`styleguide` que las muestre.
1. Seguí el flujo de la skill `figma-to-webflow-variables` (leer Figma → leer variables existentes del
   sitio → tabla de mapeo → confirmar → aplicar → verificar), pero con las colecciones de MAST
   (Theme / Typography / Components / Layout / Color, nombres en Title Case con espacios), no las de Client-First.
2. Leé Typography y Color Styles primero (design context + variables + screenshot).
3. Proponeme un plan corto ANTES de tocar Webflow:
   - Tabla de tokens: nombre en Figma → variable Webflow → colección → valor (px → rem a 16px,
     letter-spacing % → em).
   - Escala tipográfica: familias, pesos, Font Size Min / Font Size Max del clamp fluido de MAST
     (no reescribas el clamp), line-height y letter-spacing.
   - Clases base / utilities (`u-`) / custom / combo (`cc-`) para botones, tags y cards.
   - Inconsistencias del Figma y la opción que respeta el sistema.
   - Fuentes que haya que subir en Site Settings → Fonts.
4. Esperá mi OK. Construí con el MCP de Webflow (Designer abierto con la Bridge App) y verificá leyendo
   de vuelta cada variable y clase que escribiste, incluidos los modos responsive.
5. Cerrá con: qué se creó, qué quedó pendiente y qué decisiones tomaste.

## Fase 2: Home
Terminado = home fiel al Figma en 1440 / 991 / 767 / 478, con el campo de partículas y las micro
interacciones del prototipo funcionando desde jsDelivr, sin errores en consola.
1. Estructura MAST: `page-wrapper` > Custom Code component (primero en el navigator, con el contenido
   de `webflow-snippet.html`) > Nav > `page-main` (como <main>) > `section > container > row > col` > Footer.
2. Plan por sección (estructura semántica, clases nuevas vs reutilizadas, componentes Webflow) y esperá
   mi OK antes de construir. Construí sección por sección.
3. JS con las skills del repo (`/create-component`), un componente por responsabilidad, por ejemplo:
   - `particle-field`: un solo canvas WebGL fijo detrás del contenido. Pedime permiso para agregar
     `three` como dependencia (regla del repo). Estados anclados al DOM con atributos, nunca clases:
     `data-particles-state="hero|flow|research|dust|team|off"`, más `data-flow="1..7"` y
     `data-dir="1|-1"` en los flows. Replicá del prototipo: loop del Hero (ring → world → africa →
     south america → europe), morph de tabs, ríos (flow 1 a la derecha, flow 2 a la izquierda, codo de
     río en Team) con aceleración por scroll, hover suave (falloff gaussiano), arrastre por scroll y
     timeline con holds.
   - `research-tabs` (tabs + contadores + morph del gráfico), `survey`, `ecosystem-map`,
     `dot-icon` (íconos de cards que suben desde abajo al entrar en viewport), `news-reveal`, `footer-word`.
   - Cada componente con early exit si su elemento no está en la página.
   - Obligatorio: `prefers-reduced-motion` (formas estáticas, sin loop), fallback estático si no hay
     WebGL o la GPU es por software, DPR máximo 2, pausa fuera de pestaña, nunca `transition: all`.
4. Datos de puntos: regenerálos desde Figma con el pipeline de `prototype/particle-lab/pipeline/`
   (download_assets en SVG → parse de subpaths → JSON con x, y, r, opacity), usando los diseños reales
   de China/Brasil/Uganda y los 7 flows + Dust. Servilos como JSON aparte del bundle (en `dist/`), no inline.
5. Registrá en la sección "Prevent delete" de la página de componentes de Webflow toda clase que solo use el JS.
6. Verificación final: `npm run build` sin errores (lint + prettier + bundle), staging publicado sin
   errores en consola, y screenshots de cada sección en los 4 breakpoints comparados con Figma.
   El deploy lo hacés con `/deploy` solo cuando te lo pida.
   NUNCA publiques a producción ni borres elementos, clases o páginas sin mi confirmación.

# Reglas
- Si falta información crítica, preguntame primero con opciones cerradas (encuesta), máximo 3 preguntas.
- Investigá en fuentes oficiales antes de decidir algo que cambia con el tiempo (docs de Webflow y su MCP,
  jsDelivr, Three.js, MAST) y citá la fuente.
- Separá lo verificado de lo inferido. Nunca inventes valores de Figma, clases de MAST ni límites de
  plataforma: si no estás seguro de que una clase de MAST existe, verificalo.
- Variables siempre que exista el token; nada hardcodeado. Reutilizá antes de crear.
- HTML semántico y accesible: headings en orden, alt text, labels, focus visible, contraste AA.
- Respondé conciso, en español, explicando el porqué de las decisiones de estructura.

# Formato de salida (al cerrar cada paso)
1. Qué hiciste (lista corta)
2. Verificación (qué leíste de vuelta / qué comando corriste y su resultado)
3. Decisiones y por qué
4. Pendientes y preguntas (con opciones)
5. Fuentes
