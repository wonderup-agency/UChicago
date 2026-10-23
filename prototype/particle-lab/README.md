# Particle Lab (prototipo de referencia)

Prototipo funcional del homepage de UChicago con el campo de partículas WebGL y las micro interacciones.
**Es referencia de comportamiento, no código de producción.** La Fase 2 de la migración lo porta a módulos (Vite) para Webflow.

## Cómo verlo
```bash
python3 build.py            # genera particle-lab.html
npx serve .                 # o cualquier server estático, y abrí /particle-lab.html
```
`particle-lab.standalone.html` es la versión publicada como artifact (sin el wrapper de <html>).

## Estructura
- `src/app.js`: todo el JS (Three.js r160 + lil-gui por CDN). Secciones:
  - decode de puntos + asignación de partículas entre estados (hero, band, research, dust, team, off)
  - shader: morph con delay por partícula, respiración (curl noise), deriva, giro del halo,
    ríos (bandas siguiendo cauce `uBandC/uBandW`, codo de río en Team), hover gaussiano, arrastre por scroll
  - timeline de estados anclada al DOM vía `data-p` (holds 22% / morph en el medio, con spring)
  - micro componentes: tabs + contadores, survey, mapa, íconos de cards (suben desde abajo), news reveal, footer
- `src/template.html`: maquetado + CSS del homepage (Figma V1).
- `data/data.json`: puntos exactos exportados de Figma (x, y, r, opacidad), Int16 en base64.
- `data/map.json`: mapa (world-atlas 110m, Natural Earth) + 15 ciudades. Startup Activity = valores de ejemplo.
- `data/river.json`: línea central y ancho de la banda, y centro del arco de Team.

## Pipeline de puntos (`pipeline/`)
1. Exportar cada nodo de Figma como SVG (MCP `download_assets`, formato svg).
2. `parse.py` / `parse2.py`: cada punto es un subpath circular → centro, radio y opacidad (`fill-opacity` / `opacity`).
3. `build_data.py`: centra, calcula el factor de borde del hueco (para que el anillo no se deforme) y codifica.
4. `gen_map.js`: mapa y ciudades. `gen_regions.js`: siluetas aproximadas de China/Brazil/Uganda
   (**obsoleto**: en el styleguide ya existen los reales en `Graphic 160` `14628:41378`).

## Pendientes conocidos para producción
- Usar los diseños reales de China/Brasil/Uganda y los 7 flows + Dust del styleguide (`Particles Flows` `14458:115232`).
- Cargar los datos de puntos como JSON aparte del bundle.
- Fallback estático sin WebGL / GPU por software (en el prototipo no está).
- Textos de los tabs China/Brazil/Uganda/Global y valores de Startup Activity son de ejemplo.
