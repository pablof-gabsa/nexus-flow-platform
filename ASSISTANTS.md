# Asistentes de Nexus

La integración usa una API común y MCP remoto (Streamable HTTP). Cada conexión se
autoriza con la cuenta de Nexus del usuario y un conjunto explícito de espacios.
No utiliza claves de OpenAI, Anthropic o Google AI: los modelos se ejecutan en el
asistente que eligió cada persona.

## Estado de esta entrega

- API, OAuth, MCP y pantalla de autorización implementados y probados localmente.
- Carga desde cualquier IA implementada con vista previa, validación, guardado
  atómico y protección contra reintentos duplicados.
- Conexión directa pendiente de publicación en Firebase y prueba real con
  ChatGPT y Claude. `js/services/assistant-config.js` permanece sin endpoint
  activo hasta completar esa verificación.
- Gemini está preparado como cliente MCP; falta comprobar su callback real y
  disponibilidad para las cuentas de los usuarios. Google actualmente restringe
  sus aplicaciones personalizadas a cuentas personales en EE. UU. y uso en inglés.

## Componentes

- `functions/src/nexus-service.mjs`: operaciones y permisos de Nexus.
- `functions/src/oauth.mjs`: registro de clientes, consentimiento por espacios,
  PKCE S256, códigos de un uso, renovación rotativa y revocación.
- `functions/src/mcp.mjs`: herramientas comunes para los asistentes.
- `functions/src/app.mjs`: rutas HTTP y descubrimiento OAuth.
- `functions/src/openapi.mjs`: contrato OpenAPI 3.1 servido en `/openapi.json`.
- `js/components/assistants.js`: conexiones, consentimiento e importación.
- `js/services/assistant-format.js`: formato portable `nexus.tasks.v1`.

Los proyectos y tareas permanecen en la Realtime Database existente. Las
autorizaciones, hashes de tokens, clientes, límites y auditoría se guardan en una
base Firestore dedicada llamada `nexus-assistants`. Esta base es privada: sólo
la identidad del servidor puede acceder mediante IAM. Las reglas suministradas
corresponden exclusivamente a esa base y no reemplazan las reglas de los datos
actuales de Nexus.

La publicación de GitHub Pages copia solamente `index.html`, `manifest.json`,
`sw.js`, `assets`, `css` y `js`. El servidor y archivos locales de configuración
quedan fuera del artefacto público.

## Permisos y comportamiento

El servidor obtiene el UID del token validado. Cada operación consulta la
conexión y los permisos actuales del usuario. Los administradores delegados
deben existir tanto en el índice `admin_map` como en la lista del propietario
(`config/admins` o su lista histórica). Un índice obsoleto no concede acceso.
La pertenencia del proyecto al espacio se comprueba antes de leer o escribir.

- `tasks:read`: listar espacios autorizados, proyectos, rubros, responsables y tareas.
- `tasks:write`: crear o editar tareas, dentro de esos mismos espacios.
- No se ofrecen herramientas de borrado, usuarios, permisos ni enlaces públicos.
- La consulta de tareas devuelve `nextCursor`; no representa una lista completa
  mientras exista un cursor siguiente.
- Una edición requiere `expectedVersion` de la consulta previa; un cambio
  concurrente devuelve `409` en lugar de sobrescribirse.
- Toda escritura requiere un `requestId` estable. Reutilizarlo con otros datos
  devuelve `409`. Los reintentos conservan la tarea y el registro de auditoría.
- La API devuelve éxito sólo después de guardar la tarea y su auditoría.
- Los adjuntos, comentarios y campos no solicitados se preservan. Los binarios
  y tokens de enlaces compartidos no se incluyen en las respuestas del asistente.
- Los cambios de estado de tareas recurrentes se realizan por ahora desde
  Nexus, para conservar la generación de la próxima ejecución. Sus restantes
  campos sí pueden editarse desde la integración.
- Los enlaces de resultados incluyen el espacio y vuelven a comprobar el acceso
  cuando el usuario los abre en Nexus.

## Carga desde cualquier IA

Abrir **Integraciones → Asistentes de IA**, elegir espacio, proyecto y rubro,
copiar las instrucciones y pegar la respuesta del asistente. La vista previa
valida hasta 50 tareas y 128 KB de texto plano. Los responsables y rubros deben
existir en el proyecto; no se inventan vencimientos.

```json
{
  "format": "nexus.tasks.v1",
  "tasks": [
    {
      "requerimiento": "Pedir presupuesto del portón",
      "description": "Consultar al proveedor habitual.",
      "rubro": "Seguridad",
      "responsable": "",
      "prioridad": "Media",
      "deadline": "",
      "confidential": false
    }
  ]
}
```

Se revalidan los permisos y el destino al guardar. Repetir la misma carga en el
mismo proyecto con la misma cuenta no crea duplicados. Para crear una nueva
tarea similar intencionalmente, usar la creación normal de Nexus o cambiar sus
datos. La carga no modifica tareas existentes.

## Activación en Firebase

Proyecto existente: `nexus-flow-6dac7`. La dirección prevista del servicio es
`https://nexus-flow-6dac7.web.app`; no se considera activa hasta verificarla.

1. Autenticar Firebase CLI con una cuenta autorizada para el proyecto. Comprobar
   su plan y los costos de Cloud Functions, Hosting y Firestore antes de activar
   servicios o facturación. No es necesaria una clave de un proveedor de IA.
2. Crear la base Firestore dedicada `nexus-assistants`, con ubicación elegida
   por el propietario. Revisar IAM y desplegar `firestore.assistants.rules` y
   `firestore.assistants.indexes.json` sólo en esa base. La cuenta de ejecución de
   la función requiere acceso a esa base, a la Realtime Database existente y a
   Firebase Auth.
3. Revisar las reglas de la Realtime Database existentes: propietarios y
   administradores autorizados deben poder consultar sus proyectos y usar la
   transacción de importación. No publicar reglas abiertas para solucionar
   problemas de acceso.
4. Publicar `functions:nexus-assistants`, Hosting y las reglas de la base dedicada
   mediante `firebase.json`. Confirmar que el dominio previsto no aloje otro
   servicio antes de publicar sus rewrites.
5. Verificar `/health`, `/.well-known/oauth-protected-resource`,
   `/.well-known/oauth-authorization-server` y `/openapi.json`. `/health`
   comprueba conexión con las dos bases sin escribir datos de trabajo.
6. Configurar `apiBaseUrl` en `js/services/assistant-config.js` con la dirección
   comprobada y publicar la interfaz. No ingresar tokens ni claves en ese archivo.
7. Conectar ChatGPT y Claude mediante la URL terminada en `/mcp`. El cliente
   debe usar OAuth público con PKCE y registro dinámico (DCR). El consentimiento
   se abre en Nexus y requiere elegir espacios; el permiso de edición empieza
   desmarcado. Comprobar callbacks y el flujo en cada producto antes de anunciar
   compatibilidad operativa.
8. Probar con un propietario y un administrador: espacio personal, espacio
   delegado, aislamiento, lectura, creación, edición, reintento y revocación.
   Usar un proyecto de prueba, sin tareas productivas. Abrir el enlace de cada
   resultado y comprobar la tarea guardada.

La configuración permite cambiar la dirección y la interfaz con
`NEXUS_ASSISTANT_BASE_URL` y `NEXUS_WEB_URL`. Para una política de retención,
configurar TTL en Firestore y limpieza de registros vencidos; la autorización
no depende de la limpieza porque comprueba la fecha en cada uso.

## Validación reproducible

```powershell
npm ci --prefix functions
npm test --prefix functions
node --test tests/assistant-import.test.js
node tests/project-pdf-order.test.js
node tests/project-confidential.test.js
npm audit --prefix functions --omit=dev
git diff --check
```

Las pruebas HTTP usan el SDK MCP real y datos simulados. Cubren descubrimiento,
inicialización, herramientas, OAuth, permisos, revocación, reintentos,
concurrencia y preservación de datos. No prueban todavía el proveedor de
autenticación ni las reglas desplegadas de Firebase ni una conversación real
con ChatGPT/Claude/Gemini. La publicación definitiva depende de esos controles.

Se revisó la interfaz en Edge de escritorio y a 390 px de ancho, con datos de
prueba: destino, vista previa, guardado, reintento, preservación de adjuntos,
rechazo de HTML, revocación de acceso y consentimiento explícito. Esto no
reemplaza la prueba con Firebase ni con cuentas reales de asistentes.

## Fuentes del protocolo

- [MCP](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Autenticación OpenAI](https://developers.openai.com/plugins/build/auth)
- [Conectores Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Disponibilidad de aplicaciones Gemini](https://support.google.com/gemini/answer/17209137)
- [HTTP en Firebase Functions](https://firebase.google.com/docs/functions/http-events)
