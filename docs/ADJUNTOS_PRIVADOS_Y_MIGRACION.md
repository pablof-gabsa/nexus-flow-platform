# Adjuntos privados y reducción de carga

Publicado y verificado el 7 de octubre de 2026, hora de Buenos Aires. Cambio principal: PR #14. La aplicación publicada usa la caché `nexus-flow-v58`.

## Resultado en producción

| Comprobación | Resultado |
|---|---:|
| Proyectos verificados | 55 |
| Tareas conservadas | 1.255 |
| Activos conservados | 69 |
| Referencias a adjuntos migradas | 149 |
| Archivos únicos copiados y verificados | 143 |
| Datos de proyectos antes | 85.492.076 bytes |
| Datos de proyectos después | 792.193 bytes |
| Reducción de datos por carga del conjunto | 99,07 % |
| Bytes descargados de RTDB por la migración | 86.045.609 |
| Bytes binarios subidos a Storage | 62.636.154 |
| Bytes binarios descargados para comprobar integridad | 62.636.154 |
| Bytes de RTDB en la revisión final | 792.193 |
| Proyectos pendientes o con conflictos | 0 |

La revisión final reconstruyó localmente cada proyecto con sus adjuntos originales y comparó todos sus campos con el respaldo mediante una codificación canónica. Coincidieron los datos, las tareas, los activos y los tokens de acceso. No quedaron nodos de proyectos fuera de la migración.

En Barrancas de Santa María se probaron los enlaces existentes de Visita y Colaborador. Sus respuestas fueron de 78.666 y 86.943 bytes, respectivamente, con 105 tareas visibles en ambos casos. Los tiempos de esas dos consultas fueron 779 ms y 1.898 ms. Estos tiempos corresponden a consultas individuales del servicio, no al arranque completo de la página. Antes de la separación, la respuesta compartida medida en la prueba aislada pesaba 23.231.860 bytes.

## Comportamiento

Los archivos subidos desde la app se guardan en el bucket privado de Nexus. RTDB conserva una referencia sin credenciales, el nombre y el tipo del adjunto. Al mostrar una imagen o abrir un documento, la app pide sus bytes al servicio con la sesión actual o el token del enlace. Los documentos no se descargan al dibujar su enlace; las imágenes se descargan al mostrarse.

El servicio comprueba permisos, pertenencia al proyecto, visibilidad actual y SHA-256 del archivo. Colaborador puede subir y guardar adjuntos; Visita puede abrir los adjuntos de elementos visibles y tiene bloqueada la subida. Los archivos de tareas confidenciales o del área Eliminado quedan excluidos de ambos enlaces. Los propietarios y administradores conservan su acceso.

La caché de archivos reside en memoria y se vacía al cambiar de ruta o de acceso. Las referencias externas anteriores se conservaron. La eliminación de una referencia privada no borra inmediatamente el objeto porque una tarea recurrente puede reutilizarlo. La limpieza de objetos sin referencias queda pendiente de una política específica.

El contrato de asistentes mantiene su compatibilidad previa con entradas Base64. Para futuras integraciones, el endpoint de subida privada permite guardar la referencia en la tarea y evitar volver a introducir binarios en RTDB.

Los filtros, el orden y la selección de exportación reutilizan las tareas ya cargadas. Los guardados vuelven a consultar datos y permisos.

## Respaldo y recuperación

Las copias originales, los comprobantes y los puntos de recuperación están en `.firebase/files-migration/`, excluido de Git y de la publicación web. Contienen información privada y tokens: no deben publicarse ni compartirse como archivos del repositorio.

La herramienta `scripts/migrate-project-files.mjs` requiere `--apply`, reutiliza objetos verificados y limita sus descargas de RTDB a 250 MiB acumulados. Cada proyecto se lee con ETag y se escribe con If-Match. Una edición simultánea deja ese proyecto pendiente y conserva su estado actualizado. La herramienta guarda el hash previsto antes de escribir para reconocer una escritura completada cuyo comprobante se haya interrumpido.

Para recuperar datos, comparar primero el respaldo con el estado actual y preservar cualquier edición posterior. Una recuperación debe usar también una escritura condicional. Mantener los objetos de Storage mientras existan referencias. No ejecutar una restauración global ciega sobre proyectos que hayan recibido cambios.

La migración tuvo consumo facturable acotado. Las cantidades de la tabla corresponden al migrador y a la revisión final; no representan todo el tráfico de la cuenta ni el costo total de Firebase. Los cargos efectivos se verifican en la facturación una vez procesados.

## Validación

Pasaron 58 pruebas del servicio, 17 pruebas de vistas y archivos, las verificaciones de orden de PDF y confidencialidad, y el workflow con el emulador de reglas de RTDB. En una prueba local de interfaz, abrir el proyecto produjo una consulta de datos y ninguna descarga; abrir la imagen produjo una descarga. Se mostraron imágenes como Colaborador y Visita.

Una prueba aislada en el servicio publicado confirmó subida y guardado por Colaborador, bloqueo de subida para Visita, lectura de bytes idénticos, exclusión tras marcar confidencialidad y rechazo de URLs públicas sin autorización. La prueba usó un archivo de 45 bytes y sus datos se eliminaron al terminar. Las imágenes existentes se comprobaron también desde un enlace real en Chrome, con sus dimensiones originales y URLs Blob.

La automatización del selector de archivos de Chrome estuvo bloqueada por los permisos de la extensión. La subida fue verificada con el servicio real y la lógica de la app; esta limitación corresponde a la automatización y no es un fallo observado del selector de Nexus.

## VPS Hostinger

La inspección SSH fue de solo lectura. El servidor accesible `srv1596948.hstgr.cloud` tiene 2 CPU, 7.940 MiB de RAM, 6.802 MiB disponibles y aproximadamente 90 GB libres. En ese momento ejecutaba SCF, Tazbora y Traefik con carga baja. Esto demuestra margen actual, no una capacidad garantizada bajo carga futura.

Es posible agregar Nexus en un contenedor, una red y volúmenes propios. Para eliminar la dependencia económica de RTDB habría que trasladar la base y los archivos al VPS, cambiar las lecturas y escrituras directas del cliente por una API, trasladar la autorización y conservar los identificadores y tokens. El acceso con Google puede mantenerse inicialmente. Publicar solo la página en el VPS dejaría intacto el consumo de RTDB.

La decisión conviene tomarla con el gasto posterior a esta reducción. Antes de la transición, comprobar el cupo de transferencia contratado, preparar respaldos fuera del VPS y ensayar una recuperación. La migración requiere preservar el centro meteorológico y los demás servicios, probar los enlaces actuales y mantener una ruta de vuelta durante el cambio. Esta tarea no modificó el VPS.
