# VALIDAT3B

Motor de validación de capturas de precio.

Aplicación que recibe **3 imágenes** de una captura de campo (fachada, producto y etiqueta de precio) más sus datos (capture_id, código de barras, producto esperado) y devuelve un **JSON** con la decisión (`aprobada`, `rechazada` o `revision_manual`), el nivel de confianza, el motivo, el precio detectado y una explicación. El análisis lo hace un modelo de visión desplegado en **Azure AI Foundry**.

## 1. Qué cambió respecto a la plantilla de Vite

| Archivo               | Cambio                             | Para qué                                                                                 |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `.env` (raíz)         | Nuevo (se movió desde `src/.env`)  | Guarda la llave y el endpoint de Foundry. Vite solo lee `.env` desde la raíz.            |
| `.env.example`        | Nuevo                              | Plantilla sin secretos, esta sí se sube a Git.                                           |
| `.gitignore`          | Agregar `.env.*` y `!.env.example` | Evita subir secretos por accidente.                                                      |
| `server/foundry.ts`   | Nuevo                              | Conexión a Foundry (llamada HTTP al endpoint compatible con Anthropic).                  |
| `server/criterios.ts` | Nuevo                              | Prompt con los criterios de análisis, esquema de salida y reglas de seguridad en código. |
| `server/index.ts`     | Nuevo                              | API Express: recibe las imágenes, llama al modelo y responde el JSON.                    |
| `src/api.ts`          | Nuevo                              | Cliente del frontend; reduce las imágenes a 1024 px antes de enviarlas.                  |
| `src/App.tsx`         | Reemplazado                        | Formulario de carga de imágenes y visor del resultado.                                   |
| `vite.config.ts`      | Se agregó `server.proxy`           | Redirige `/api` al servidor en el puerto 3001.                                           |
| `package.json`        | Nuevas dependencias y scripts      | `server` y `dev:all`.                                                                    |

### Por qué hay un backend

Las variables `VITE_*` terminan dentro del código que descarga el navegador, así que cualquiera podría leer la API key. Por eso el navegador nunca habla con Foundry: llama a `/api/validar` y el servidor, que sí guarda la llave, hace la consulta.

```
Navegador (React)  ──/api/validar──▶  Servidor Express  ──▶  Azure AI Foundry
   fotos + datos                       (guarda la llave)       (modelo de visión)
                    ◀──── JSON ────────                ◀────────
```

## 2. Instalación

Requisitos: Node.js 20 o superior.

```bash
npm install
npm i express multer dotenv
npm i -D tsx concurrently @types/express @types/multer
```

Agrega estos scripts en `package.json`:

```json
"server": "tsx watch server/index.ts",
"dev:all": "concurrently \"npm:server\" \"npm:dev\""
```

## 3. Configuración

1. Copia la plantilla: `cp .env.example .env` (en Windows: `copy .env.example .env`).
2. Edita `.env` en la **raíz** del proyecto:

```env
FOUNDRY_API_KEY=la_llave_del_equipo
FOUNDRY_ENDPOINT=https://softwaredevelopment-resource.services.ai.azure.com/anthropic
FOUNDRY_MODEL=claude-haiku-5-5
PORT=3001
```

> **Seguridad:** la llave es personal del equipo. No la pegues en el código, no la subas a Git y no la compartas fuera del equipo. Confirma que `.env` aparece en `.gitignore`.

3. Prueba la conexión:

```bash
npx tsx -e "import {callModel} from './server/foundry.ts'; callModel('Responde breve',[{type:'text',text:'Hola'}]).then(r=>console.log(r))"
```

Si imprime texto y el uso de tokens, la conexión funciona. Si falla con `401`, revisa la llave; con `404`, revisa el endpoint y el nombre del modelo.

## 4. Cómo ejecutarlo

```bash
npm run dev:all
```

Esto levanta el servidor API en `http://localhost:3001` y el frontend en `http://localhost:5173`.

## 5. Cómo usarlo

1. Abre `http://localhost:5173`.
2. Escribe el `capture_id`, el código de barras capturado y el producto esperado.
3. Selecciona las 3 imágenes: fachada, producto y etiqueta.
4. Pulsa **Validar**. El JSON aparece debajo.

Ejemplo de respuesta:

```json
{
  "resultado": {
    "capture_id": "CAP-000123",
    "decision": "rechazada",
    "confidence_score": 0.12,
    "reason_code": "PRODUCTO_NO_COINCIDE",
    "validaciones": {
      "tienda_fachada": "ok",
      "producto": "falla",
      "codigo_barras": "ok",
      "evidencia_precio": "ok"
    },
    "precio_detectado": 42.5,
    "tipo_precio": "regular",
    "codigo_barras_detectado": "7501234567890",
    "explicacion": "El producto de la foto es de otra marca que la esperada."
  },
  "usage": { "input_tokens": 2100, "output_tokens": 180 }
}
```

También puedes usar la API directamente:

```bash
curl -X POST http://localhost:3001/api/validar \
  -F 'meta={"capture_id":"CAP-000123","codigo_barras":"7501234567890","producto_esperado":"..."}' \
  -F fachada=@fachada.jpg -F producto=@producto.jpg -F etiqueta=@etiqueta.jpg
```

## 6. Criterios de análisis

El prompt (`server/criterios.ts`) evalúa tres frentes, alineados con las bases del reto:

- **A. Identidad del producto (~61% de rechazos):** visible y completo; marca, descripción y contenido coinciden con el esperado o su contratipo; código de barras coherente.
- **B. Calidad de la evidencia (~29%):** fachada correcta, fotos nítidas y cercanas, sin fotos a pantallas de otro celular.
- **C. Evidencia de precio (~10%):** etiqueta legible, precio unitario exacto y tipo (regular, oferta, volumen).

### Regla de decisión (basada en la tabla de costos)

| Resultado                                  | Costo |
| ------------------------------------------ | ----- |
| Acierto (aprobar o rechazar correctamente) | 0     |
| Revisión manual                            | 1     |
| Rechazar una captura válida                | 3     |
| Aprobar una captura inválida               | 10    |

Como aprobar mal es el error más caro, solo se aprueba si las 4 validaciones están en `ok` **y** la confianza es ≥ 0.95. La función `aplicarGuardas` lo impone en código aunque el modelo diga lo contrario. Ante un error técnico (red, JSON inválido) se devuelve `revision_manual`, que cuesta 1 y no 10.

## 7. Pendientes

- Pegar la lista oficial de `reason_code` en `REASON_CODES` (`server/criterios.ts`) cuando se descargue con los datos.
- Ajustar los nombres de los campos del `meta` a los del archivo real de metadatos.
- Calibrar `UMBRAL_APROBACION` (entre 0.90 y 0.98) con el set de validación y el script oficial de costo.
- Crear un script de procesamiento por lotes del set ciego que reutilice `callModel`, con concurrencia limitada por el límite de tokens por minuto.
- Agregar reglas previas sin IA: si el código de barras no coincide con el catálogo o los contratipos permitidos, rechazar sin llamar al modelo (ahorra tokens).

## 8. Problemas frecuentes

| Síntoma                                   | Causa probable                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `Faltan FOUNDRY_API_KEY...` al iniciar    | El `.env` no está en la raíz o está vacío.                                            |
| `Foundry 401`                             | Llave incorrecta o con espacios extra.                                                |
| `Foundry 404`                             | Endpoint o nombre de modelo incorrectos.                                              |
| `/api/validar` da 404 en el navegador     | El servidor no está corriendo; usa `npm run dev:all`.                                 |
| `Error de procesamiento` en `explicacion` | Falló la llamada o el modelo no devolvió JSON válido; revisa la consola del servidor. |

## 9. Notas de la plantilla (React + TypeScript + Vite)

El frontend parte de la plantilla oficial de Vite con HMR y reglas básicas de ESLint:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) (usa [Oxc](https://oxc.rs)) es el plugin que está activo en `vite.config.ts`.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) (usa [SWC](https://swc.rs/)) es la alternativa.
- El React Compiler no está activado por su impacto en el rendimiento de dev y build. Para añadirlo, consulta [la documentación](https://react.dev/learn/react-compiler/installation).

Para una aplicación de producción se recomienda activar reglas de ESLint con tipos. En `eslint.config.js`, reemplaza `tseslint.configs.recommended` por `tseslint.configs.recommendedTypeChecked` (o `strictTypeChecked`) y agrega:

```js
languageOptions: {
  parserOptions: {
    project: ['./tsconfig.node.json', './tsconfig.app.json'],
    tsconfigRootDir: import.meta.dirname,
  },
},
```

También puedes instalar [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) y [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) para reglas específicas de React.
