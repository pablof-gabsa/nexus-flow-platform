import { z } from 'zod';
import { createTaskSchema, updateTaskSchema } from './validation.mjs';

export function openapi(baseUrl) {
  const id = name => ({ name, in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' } });
  const response = description => ({ description, content: { 'application/json': { schema: { type: 'object' } } } });
  const errors = { '400': response('Datos inválidos'), '401': response('Conexión vencida o revocada'), '403': response('Acceso o permiso insuficiente'), '404': response('Proyecto o tarea no encontrada'), '409': response('Conflicto de versión, requestId o estado'), '429': response('Límite de solicitudes') };
  const action = (operationId, summary, write, parameters, requestSchema) => ({ operationId, summary, security: [{ nexusOAuth: [write ? 'tasks:write' : 'tasks:read'] }], parameters, ...(requestSchema ? { requestBody: { required: true, content: { 'application/json': { schema: requestSchema } } } } : {}), responses: { [requestSchema && operationId === 'createTask' ? '201' : '200']: response('Resultado; las escrituras confirman saved=true'), ...errors } });
  const task = z.toJSONSchema(createTaskSchema, { io: 'input' });
  const changes = { ...z.toJSONSchema(updateTaskSchema, { io: 'input' }), minProperties: 1 };
  const requestId = { type: 'string', minLength: 16, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$', description: 'Identificador estable por acción; conservar al reintentar' };
  const projectParams = [id('workspaceId'), id('projectId')], taskParams = [...projectParams, id('taskId')];
  const projectsPath = '/v1/workspaces/{workspaceId}/projects', projectPath = `${projectsPath}/{projectId}`, tasksPath = `${projectPath}/tasks`;
  return { openapi: '3.1.0', info: { title: 'Nexus API para asistentes', version: '1.1.0', description: 'Formulario completo de tareas con identidad y permisos vigentes de Nexus. Sin borrados de tareas ni gestión de usuarios.' }, servers: [{ url: baseUrl }], components: { securitySchemes: { nexusOAuth: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: `${baseUrl}/oauth/authorize`, tokenUrl: `${baseUrl}/oauth/token`, scopes: { 'tasks:read': 'Consultar espacios, proyectos y tareas', 'tasks:write': 'Crear y modificar tareas' } } }, description: 'OAuth con PKCE S256, recurso /mcp y conexión individual por usuario.' } } }, paths: {
    '/v1/workspaces': { get: action('listWorkspaces', 'Listar espacios autorizados', false, []) },
    [projectsPath]: { get: action('listProjects', 'Listar proyectos', false, [id('workspaceId')]) },
    [projectPath]: { get: action('getProject', 'Consultar rubros, responsables y activos', false, projectParams) },
    [tasksPath]: { get: action('listTasks', 'Consultar tareas completas paginadas', false, [...projectParams, { name: 'cursor', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { name: 'query', in: 'query', schema: { type: 'string', maxLength: 300 } }, { name: 'estado', in: 'query', schema: { type: 'string', enum: ['Pendiente', 'En Proceso', 'Realizado', 'Suspendido'] } }]), post: action('createTask', 'Crear tarea con todos los campos', true, projectParams, { type: 'object', additionalProperties: false, required: ['task', 'requestId'], properties: { task, requestId } }) },
    [`${tasksPath}/{taskId}`]: { get: action('getTask', 'Consultar tarea completa, adjuntos y versión', false, taskParams), patch: action('updateTask', 'Editar campos completos sin sobrescribir cambios concurrentes', true, taskParams, { type: 'object', additionalProperties: false, required: ['changes', 'expectedVersion', 'requestId'], properties: { changes, expectedVersion: { type: 'string', pattern: '^[a-f0-9]{64}$' }, requestId } }) }
  } };
}
