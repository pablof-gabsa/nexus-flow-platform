# Asistentes de Nexus

La integración usa una API común y MCP remoto (Streamable HTTP). Cada conexión se
autoriza con la cuenta de Nexus del usuario y un conjunto explícito de espacios.
No utiliza claves de OpenAI, Anthropic o Google AI: los modelos se ejecutan en el
asistente que eligió cada persona.

## Estado de esta entrega

- API, OAuth y MCP publicados en `https://nexus-flow-6dac7.web.app` y probados
  en Firebase con cuentas y proyectos de prueba aislados.
- Carga desde cualquier IA implementada con vista previa, validación, guardado
  atómico y protección contra reintentos duplicados.
- La interfaz tiene configurado el servicio publicado. Falta conectar y probar
  las aplicaciones reales de ChatGPT y Claude con las cuentas de sus usuarios.
- La interfaz y los permisos de Realtime Database están publicados. Las reglas
  coinciden con el repositorio y pasaron pruebas en el emulador y en Firebase.
  Cada proyecto tiene un propietario canónico; los enlaces
  compartidos consultan un servicio que valida el token y devuelve sólo datos
  públicos en modo lectura.
- Gemini está preparado como cliente MCP; falta comprobar su callback real y
  disponibilidad para las cuentas de los usuarios. Google actualmente restringe
  sus aplicaciones personalizadas a cuentas personales en EE. UU. y uso en inglés.

## Componentes

- `functions/src/nexus-service.mjs`: operaciones y permisos de Nexus.
- `functions/src/oauth.mjs`: registro de clientes, consentimiento por espacios,
  PKCE S256, códigos de un uso, renovación rotativa y revocación.
- `functions/src/mcp.mjs`: herramientas comunes para los asistentes.
- `functions/src/app.mjs`: rutas HTTP y descubrimiento OAuth.
- `functions/src/shared-project.mjs`: validación y filtrado de enlaces compartidos.
- `database.rules.json`: aislamiento de proyectos, espacios personales y administradores.
- `functions/src/openapi.mjs`: contrato OpenAPI 3.1 servido en `/openapi.json`.
- `js/components/assistants.js`: conexiones, consentimiento e importación.
- `js/services/assistant-format.js`: formato portable `nexus.tasks.v1`.

Los proyectos y tareas permanecen en la Realtime Database existente. Las
autorizaciones, hashes de tokens, clientes, límites y auditoría se guardan en una
base Firestore dedicada llamada `nexus-assistants`. Las reglas impiden el acceso
directo desde clientes; el servidor y la administración acceden mediante IAM.
`firestore.assistants.rules` corresponde exclusivamente a esa base privada.
`database.rules.json` protege la Realtime Database existente de Nexus.

La publicación de GitHub Pages copia solamente `index.html`, `manifest.json`,
`sw.js`, `assets`, `css` y `js`. El servidor y archivos locales de configuración
quedan fuera del artefacto público.

## Permisos y comportamiento

El servidor obtiene el UID del token validado. Cada operación consulta la
conexión y los permisos actuales del usuario. Los administradores delegados
deben existir tanto en el índice `admin_map` como en la lista del propietario
(`config/admins` o su lista histórica). Un índice obsoleto no concede acceso.
La pertenencia del proyecto al espacio se comprueba antes de leer o escribir.
El índice `project_owners/<projectId>/ownerUid` debe coincidir con los metadatos
del proyecto. La creación normal guarda ambos y los datos en una sola operación.
Los clientes no pueden reasignar ese índice. Una transferencia de titularidad
requiere una operación administrativa específica; todavía no está implementada.
Ser propietario de un espacio de Nexus no concede roles en la consola Firebase.

Los administradores deben tener correo verificado y autorización vigente en
ambos registros. Sólo el propietario modifica administradores y tokens de
compartición. Los invitados anónimos conservan acceso a su propio espacio.

Los enlaces existentes se conservan, incluso si incluían `mode=edit`, pero se
abren en modo lectura. `/v1/shared-project` valida el token en el servidor antes
de consultar el proyecto y excluye tareas y activos confidenciales, metadatos
internos y el propio token. Rotar el token invalida el enlace anterior. Los
enlaces nuevos usan 32 bytes aleatorios. No existe una operación pública de edición.

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

Proyecto existente: `nexus-flow-6dac7`. El servicio se publicó y verificó el
4 de octubre de 2026 en `https://nexus-flow-6dac7.web.app`. La base de proyectos
y tareas conserva su dirección y sus datos.

La función `nexusAssistants` y la base privada `nexus-assistants` están en
`us-central1`. La base tiene protección contra borrado. El servidor usa la cuenta
dedicada `nexus-assistants@nexus-flow-6dac7.iam.gserviceaccount.com`, con acceso
de lectura a Firebase Auth, administración de Realtime Database y acceso a
Firestore limitado mediante IAM a la base dedicada. No se creó una clave
privada de esa cuenta. La retención de imágenes de compilación es de siete días.

Los siguientes pasos sirven para reproducir el despliegue y conectar los
asistentes. Conservar copias de las reglas y revisar el índice de propietarios
antes de cambiar los permisos de una instalación existente.

1. Autenticar Firebase CLI con una cuenta autorizada para el proyecto. Comprobar
   su plan y los costos de Cloud Functions, Hosting y Firestore antes de activar
   servicios o facturación. No es necesaria una clave de un proveedor de IA.
2. Crear la base Firestore dedicada `nexus-assistants`, con ubicación elegida
   por el propietario. Revisar IAM y desplegar `firestore.assistants.rules` y
   `firestore.assistants.indexes.json` sólo en esa base. La cuenta de ejecución de
   la función requiere acceso a esa base, a la Realtime Database existente y a
   Firebase Auth.
3. Construir `project_owners` desde `users/<uid>/projects`, comprobando que cada
   ID tenga un solo propietario y datos existentes. Detenerse ante duplicados,
   propietarios inválidos o datos sin metadatos. La activación inicial revisó
   55 proyectos sin anomalías y añadió únicamente ese índice.
4. Publicar `functions:nexus-assistants`, Hosting y las reglas de la base dedicada
   mediante `firebase.json`. Confirmar que el dominio previsto no aloje otro
   servicio antes de publicar sus rewrites. Si el análisis inicial excede el
   tiempo predeterminado, usar `FUNCTIONS_DISCOVERY_TIMEOUT=60`. La identidad
   usada para compilar necesita el rol de compilación de Cloud Build; no es la
   cuenta dedicada que ejecuta la función.
5. Verificar `/health`, `/.well-known/oauth-protected-resource`,
   `/.well-known/oauth-authorization-server` y `/openapi.json`. `/health`
   comprueba conexión con las dos bases sin escribir datos de trabajo.
6. Configurar `apiBaseUrl` en `js/services/assistant-config.js` con la dirección
   comprobada y publicar la interfaz. No ingresar tokens ni claves en ese archivo.
   Verificar la publicación y los enlaces compartidos antes de desplegar
   `database.rules.json` en `nexus-flow-6dac7-default-rtdb`. Reconciliar nuevamente
   el índice de propietarios para incluir altas ocurridas durante el despliegue.
   Mantener denegado el acceso público directo a la base.
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
node --test tests/assistant-import.test.js tests/shared-security.test.js
npx --yes firebase-tools@15.32.1 emulators:exec --project demo-nexus-security --config firebase.security-test.json --only database "node --test tests/database-rules.test.mjs"
node tests/project-pdf-order.test.js
node tests/project-confidential.test.js
npm audit --prefix functions --omit=dev
git diff --check
```

Las pruebas HTTP usan el SDK MCP real y datos simulados. Cubren descubrimiento,
inicialización, herramientas, OAuth, permisos, revocación, reintentos,
concurrencia y preservación de datos. Pasan 30 pruebas del servidor, 12 de
formato, importación y enlaces, y nueve de reglas con el emulador real, además
de las regresiones de PDF y confidencialidad. Las reglas incluyen accesos
anónimos y ajenos, autoasignación de permisos, revocación, titularidad inmutable,
creación atómica personal y delegada, y preservación de adjuntos.

La prueba del servicio publicado usó cuentas Firebase verificadas y proyectos
temporales. Confirmó autenticación, OAuth con PKCE y consentimiento por espacios,
propietario, administrador delegado, espacio personal, lectura sin edición,
aislamiento, creación sin duplicados, edición, rechazo de versiones obsoletas,
preservación de adjuntos y comentarios, ocho herramientas MCP, auditoría,
índices privados, bloqueo del acceso cliente a Firestore, pérdida inmediata de
pertenencia, renovación de un uso y revocación. Se eliminaron los datos y cuentas
de prueba y el permiso temporal usado para firmar sus sesiones.

Tras publicar las reglas, una segunda prueba en Firebase confirmó el bloqueo
de lecturas y escrituras sin sesión, acceso ajeno, autoasignación de permisos,
cambio de titularidad y rotación de tokens por administradores. Confirmó acceso
del propietario y del administrador, creación atómica delegada y revocación.
El servicio compartido excluyó tareas y activos confidenciales, rechazó tokens
incorrectos y dejó de aceptar el enlace al rotarlo. Se conservaron los 55
proyectos y sus 55 tokens existentes. En Chrome se verificaron las vistas
publicadas de tareas, métricas y activos, incluido el detalle de un activo,
mediante un enlace antiguo con `mode=edit` y datos sintéticos. Sus opciones de
importación y administración quedan ocultas y los manejadores de edición
rechazan acciones en la vista de consulta. Todos los datos temporales se retiraron.

La revisión en Chrome detectó que una actualización podía conservar archivos
anteriores en la caché HTTP. La instalación ahora solicita todos los archivos
a la red y activa la versión completa después de retirar las cachés anteriores.
Cada consulta de archivos usa exclusivamente la caché de la versión activa.

Una reproducción con el SDK real detectó que una edición podía interpretar la
caché inicial vacía como una tarea inexistente. El repositorio ahora espera el
primer valor y conserva la suscripción durante la transacción; libera esa
suscripción tanto al guardar como ante un error.

Estas pruebas no conectaron las aplicaciones reales de ChatGPT, Claude o
Gemini. Sus callbacks y la disponibilidad por cuenta requieren una prueba en
cada aplicación antes de anunciar compatibilidad operativa.

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
