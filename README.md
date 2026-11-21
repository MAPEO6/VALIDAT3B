# VALIDAT3B

**Motor de validación de capturas de precio.**

## Descripción

Proyecto desarrollado para el **Reto 2 · Validat3B del Hackatón Tiendas 3B**.

El objetivo es desarrollar un motor con inteligencia artificial que analice capturas de campo, determine si sus evidencias son confiables y explique los motivos de su decisión.

El sistema evalúa fotografías, códigos de barras y metadatos para reducir la revisión manual sin comprometer la calidad de la información.

## Tecnologías

### Frontend
- React
- TypeScript
- Vite

### Backend
- Node.js 24

### Inteligencia artificial
- Azure AI Foundry
- Claude Haiku 5.5 (`claude-haiku-5-5`)

## Requisitos previos

- Node.js 24
- npm

## Instalación

Clonar el repositorio y acceder al directorio del frontend:

```bash
cd frontend
```

Instalar las dependencias:

```bash
npm ci
```

## Ejecución en desarrollo

```bash
npm run dev
```

## Compilación

```bash
npm run build
```

## Revisión de código

```bash
npm run lint
```

## Funcionamiento del sistema

Cada captura está relacionada mediante un identificador único (`capture_id`) e incluye:

- Fotografía de la fachada de la tienda.
- Fotografía del producto.
- Fotografía de la etiqueta de precio.
- Código de barras capturado.
- Producto o contratipo esperado.
- Cadena y tienda seleccionadas.
- Fecha, hora y metadatos de la aplicación.

El sistema utiliza un catálogo de referencia con SKU, descripción, marca, contenido, códigos de barras y contratipos permitidos, además de las reglas de negocio proporcionadas por el comité.

### Frentes de validación

**A. Identidad del producto (~61% de los rechazos)**

- Contratipo inválido.
- Producto que no coincide con la descripción.
- Descripción incompleta.
- Producto no visible.

**B. Calidad de la evidencia (~29% de los rechazos)**

- Fachada incorrecta.
- Fotografía demasiado lejana.
- Imagen borrosa.
- Fotografía tomada a la pantalla de otro celular.

**C. Evidencia de precio (~10% de los rechazos)**

- Ausencia de etiqueta de precio.
- Falta del precio unitario.

### Decisiones posibles

- `aprobada`: la evidencia cumple con las validaciones.
- `rechazada`: se identifica algún incumplimiento.
- `revision_manual`: existe incertidumbre y se requiere una revisión adicional.

## Azure AI Foundry

La solución utilizará el endpoint asignado al equipo por el comité organizador.

| Parámetro | Valor |
|---|---|
| Proyecto | `https://softwaredevelopment-resource.services.ai.azure.com/api/projects/softwaredevelopment` |
| Endpoint | `https://softwaredevelopment-resource.services.ai.azure.com/anthropic` |
| Modelo | `claude-haiku-5-5` |
| API Key | Proporcionada al equipo por el comité |

Las credenciales deben administrarse mediante variables de entorno en el backend. La API Key no debe exponerse en el frontend ni subirse al repositorio.

El comité proporciona un ejemplo de conexión mediante el SDK de Anthropic para Python. La integración desde Node.js 24 deberá verificarse con el endpoint asignado.

## Conjuntos de datos

| Conjunto | Etiquetas | Propósito |
|---|---|---|
| Entrenamiento | Sí | Explorar, construir y ajustar la solución. |
| Validación | Sí | Medir el costo operativo antes del cierre. |
| Ciego | No | Evaluación final del sistema. |

Las imágenes y los metadatos se relacionan mediante `capture_id`.

## Formato de salida

El sistema debe generar un archivo JSON con una respuesta por captura, respetando el esquema oficial.

Ejemplo:

```json
{
  "capture_id": "CAP-000123",
  "decision": "rechazada",
  "confidence_score": 0.93,
  "reason_code": "PRODUCTO_NO_COINCIDE",
  "validaciones": {
    "tienda_fachada": "ok",
    "producto": "falla",
    "codigo_barras": "ok",
    "evidencia_precio": "ok"
  },
  "precio_detectado": 42.50,
  "codigo_barras_detectado": "7501234567890",
  "explicacion": "El producto de la foto es de otra marca que la del contratipo esperado."
}
```

La lista oficial de `reason_code` se proporciona junto con los datos del reto.

## Entregables

1. Resultados del conjunto ciego en formato JSON.
2. Código fuente o notebook utilizado para generar los resultados, con instrucciones de ejecución.
3. Ficha técnica de una página.
4. Pitch de tres minutos ante el jurado.

## Criterios de evaluación

### Requisitos para entrar en la clasificación

- Precisión de aprobaciones igual o superior al 97%.
- JSON válido en al menos el 99% de las capturas.
- Entrega dentro del tiempo establecido.

### Ponderación

| Criterio | Peso |
|---|---:|
| Costo operativo | 50% |
| Calidad del dato | 15% |
| Eficiencia (tokens por captura) | 10% |
| Pitch | 25% |
| **Total** | **100%** |

### Costo operativo

| Resultado | Puntos |
|---|---:|
| Aprobada o rechazada correctamente | 0 |
| Revisión manual | 1 |
| Rechazada siendo válida | 3 |
| Aprobada siendo inválida | 10 |

## Reglas y restricciones

- Se dispone de seis horas efectivas de desarrollo, sin prórrogas.
- El conjunto ciego se libera al cierre.
- Cada equipo recibe su propio endpoint y API Key.
- Las llaves no deben compartirse fuera del equipo.
- Todas las llaves tienen el mismo límite de tokens por minuto.
- Se permite combinar modelos de IA, visión por computadora, OCR, reglas y librerías de código abierto locales.
- No se permite utilizar APIs o servicios de IA externos al endpoint asignado.
- Las imágenes y los datos de Tiendas 3B deben permanecer dentro del entorno autorizado.
- Las decisiones del conjunto ciego deben generarse automáticamente mediante la solución.

## Datos del reto

- [Descargar imágenes](https://hackaton3b.com/descargas/Validat3B_desarrollo_imagenes.zip)
- [Descargar metadatos](https://hackaton3b.com/descargas/Validat3B_desarrollo_metadatos.zip)
- [Consultar bases oficiales](https://hackaton3b.com/validat3b.html)

---

**VALIDAT3B | Hackatón Tiendas 3B**

*Las reglas, criterios y listas oficiales del comité organizador prevalecen ante cualquier diferencia.*