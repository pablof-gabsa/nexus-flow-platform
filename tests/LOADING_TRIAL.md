# Prueba aislada de carga

Esta prueba crea una copia temporal del proyecto y un propietario de prueba que no pertenece a los espacios de usuarios reales. Usa la API publicada sin desplegar funciones ni modificar los enlaces del proyecto original. Los archivos se copian al bucket actual con ACL privada, dentro de un prefijo aleatorio exclusivo de la prueba.

El script requiere una sesión existente de Firebase CLI y la ruta de su módulo `lib/api.js`, indicada mediante `--firebase-tools`. Los tokens, el respaldo original, el manifiesto de archivos y los resultados completos se guardan exclusivamente en `.firebase/loading-trial/`, que está excluido de Git. No pasar tokens por la línea de comandos ni publicar estos archivos.

Ejecutar desde la raíz del repositorio, sustituyendo los valores entre corchetes:

```text
node tests/loading-trial.mjs prepare --source=[ID_DEL_PROYECTO] --firebase-tools=[RUTA_API_JS]
node tests/loading-trial.mjs measure --label=before --firebase-tools=[RUTA_API_JS]
node tests/loading-trial.mjs migrate --firebase-tools=[RUTA_API_JS]
node tests/loading-trial.mjs measure --label=after --firebase-tools=[RUTA_API_JS]
node tests/loading-trial.mjs verify --firebase-tools=[RUTA_API_JS]
node tests/loading-trial.mjs serve --firebase-tools=[RUTA_API_JS]
```

La vista de prueba está en `http://127.0.0.1:8788/editor` y la vista de solo lectura en `/visitor`. `/trial-stats` permite comprobar que ordenar, filtrar y seleccionar tareas no generan más lecturas y que los archivos se descargan al abrirlos. El servidor solo acepta el proyecto temporal; no permite escribir otros proyectos. Las referencias a archivos del ensayo apuntan a este servidor local y no son un formato listo para producción.

La copia de cada archivo se verifica con SHA-256 antes de retirar su contenido incrustado de la copia del proyecto. Durante la prueba se conservan el proyecto original, su token y sus IDs de tareas. El script vuelve a leer el original para comprobarlo. Si el usuario lo editó durante el ensayo, la comparación puede diferir; el script nunca escribe ese proyecto.

Para retirar exclusivamente los recursos temporales, detener el servidor y ejecutar:

```text
node tests/loading-trial.mjs cleanup --firebase-tools=[RUTA_API_JS]
```

La limpieza valida la identidad de prueba y el prefijo de cada objeto y usa la generación registrada para evitar borrar un objeto reemplazado. El respaldo local queda disponible. Este ensayo no migra los proyectos reales ni cambia su infraestructura.
