/* Administrators verify space/project before saving. Reuse Nexus Inter, blue
 * actions, slate/white glass surfaces, inset inputs and 4px spacing. The fixed
 * destination replaces anonymous imports; explicit grants replace broad access.
 * Domain: spaces, projects, rubros, responsables, deadlines, connections. */
window.AssistantsComponent = {
    state: null,
    escape: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    render: async container => {
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous) { container.innerHTML = '<div class="p-8"><h1 class="text-2xl font-bold">Asistentes</h1><p class="mt-3">Ingresá con tu cuenta de Google para gestionar tus asistentes.</p><button class="btn-primary mt-5" onclick="Auth.signInWithGoogle()">Ingresar con Google</button></div>'; return; }
        const previousOwner = Store.currentContext.ownerId;
        const workspaces = await Store.getAssistantWorkspaces();
        const selected = workspaces.find(w => w.id === previousOwner) || workspaces[0];
        const s = AssistantsComponent.state = { container, workspaces, workspaceId: selected.id, projectId: '', projects: [], labels: {}, preview: [], saving: false, generation: 0 };
        const e = AssistantsComponent.escape, api = AssistantAPI.base();
        container.innerHTML = `<div class="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
            <div><a href="#/dashboard" class="text-sm text-brand-600 dark:text-brand-300">Volver a mi trabajo</a><h1 class="text-3xl font-bold dark:text-white mt-3">Asistentes</h1><p class="text-gray-500 dark:text-gray-400 mt-2">Organizá tareas con tu asistente en los espacios donde tenés acceso.</p></div>
            <section class="glass-card rounded-xl p-5 sm:p-6 space-y-4"><div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-lg font-semibold dark:text-white">Conexiones</h2><span class="text-xs rounded-full px-3 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">${api ? 'Servicio configurado' : 'Conexión directa pendiente de activación'}</span></div><p class="text-sm text-gray-600 dark:text-gray-400">Cada conexión utiliza tu cuenta y los espacios que autorices.</p>
            ${api ? '<button id="ai-copy-url" class="btn-secondary">Copiar dirección de conexión</button>' : '<p class="text-sm text-gray-500">Podés usar la carga desde cualquier IA mientras se activa el servicio.</p>'}
            <details class="text-sm"><summary class="cursor-pointer font-medium text-brand-700 dark:text-brand-300">Cómo conectar mi asistente</summary><div class="mt-3 space-y-3 text-gray-600 dark:text-gray-400"><p><strong>ChatGPT:</strong> agregá Nexus como conexión personalizada desde sus ajustes de plugins y autorizá tu cuenta.</p><p><strong>Claude:</strong> agregá un conector personalizado desde Conectores y autorizá tu cuenta.</p><p><strong>Gemini:</strong> agregá una aplicación personalizada desde Aplicaciones conectadas, cuando esté disponible para tu cuenta y país. <a class="underline" href="https://support.google.com/gemini/answer/17209137" target="_blank" rel="noopener noreferrer">Consultar disponibilidad</a>.</p><p>Nexus comprueba tus permisos en cada pedido. Podés desconectar el asistente cuando quieras.</p></div></details>
            <div id="ai-connections" class="text-sm text-gray-500" aria-live="polite">${api ? 'Cargando conexiones…' : 'El servicio necesita activarse antes de vincular cuentas.'}</div></section>
            <section class="glass-card rounded-xl p-5 sm:p-6 space-y-5"><div><h2 class="text-lg font-semibold dark:text-white">Cargar tareas desde cualquier IA</h2><p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Elegí el destino, copiá las instrucciones a tu asistente y revisá su respuesta antes de guardar.</p></div>
            <div class="grid sm:grid-cols-2 gap-4"><label class="text-sm font-medium dark:text-gray-200">Espacio<select id="ai-workspace" class="input-primary w-full mt-2">${workspaces.map(w => `<option value="${e(w.id)}" ${w.id === selected.id ? 'selected' : ''}>${e(w.name)} · ${w.role === 'owner' ? 'Propietario' : 'Administrador'}</option>`).join('')}</select></label><label class="text-sm font-medium dark:text-gray-200">Proyecto<select id="ai-project" class="input-primary w-full mt-2" disabled><option>Cargando proyectos…</option></select></label></div>
            <label class="block text-sm font-medium dark:text-gray-200">Rubro para las tareas que no indiquen uno<select id="ai-rubro" class="input-primary w-full sm:w-1/2 mt-2" disabled></select></label>
            <div id="ai-destination" class="bg-brand-50 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 rounded-lg p-3 text-sm" aria-live="polite">Seleccioná un proyecto.</div>
            <button id="ai-copy-prompt" class="btn-secondary" disabled>Copiar instrucciones para mi IA</button>
            <label class="block text-sm font-medium dark:text-gray-200">Respuesta del asistente<textarea id="ai-text" class="input-primary w-full mt-2 font-mono text-sm" rows="7" placeholder="Pegá la respuesta JSON que preparó tu asistente." spellcheck="false"></textarea></label>
            <div class="flex flex-wrap gap-3"><button id="ai-preview" class="btn-secondary" disabled>Revisar tareas</button><button id="ai-save" class="btn-primary" disabled>Guardar tareas en Nexus</button></div>
            <p id="ai-message" class="text-sm text-gray-600 dark:text-gray-400" role="status" aria-live="polite"></p><div id="ai-preview-list" class="space-y-3"></div></section>
            ${api ? '<section class="glass-card rounded-xl p-5 sm:p-6"><h2 class="text-lg font-semibold dark:text-white">Cambios desde mis asistentes</h2><div id="ai-history" class="mt-4 text-sm text-gray-500" aria-live="polite">Cargando historial…</div></section>' : ''}</div>`;
        const byId = id => container.querySelector(`#${id}`);
        byId('ai-workspace').onchange = async event => { if (s.saving) return; s.workspaceId = event.target.value; byId('ai-text').value = ''; await AssistantsComponent.loadProjects(); };
        byId('ai-project').onchange = () => { byId('ai-text').value = ''; void AssistantsComponent.loadProject(); };
        byId('ai-rubro').onchange = AssistantsComponent.invalidate;
        byId('ai-text').oninput = AssistantsComponent.invalidate;
        byId('ai-copy-prompt').onclick = () => AssistantsComponent.copy(AssistantFormat.prompt(s.workspaces.find(w => w.id === s.workspaceId).name, s.projects.find(p => p.id === s.projectId).name, { ...s.labels, defaultRubro: byId('ai-rubro').value }));
        byId('ai-preview').onclick = AssistantsComponent.preview;
        byId('ai-save').onclick = AssistantsComponent.save;
        if (api) { byId('ai-copy-url').onclick = () => AssistantsComponent.copy(`${api}/mcp`); void AssistantsComponent.loadConnections(); }
        await AssistantsComponent.loadProjects();
    },
    element: id => AssistantsComponent.state?.container.querySelector(`#${id}`),
    message: (text, error = false) => { const node = AssistantsComponent.element('ai-message'); if (node) { node.textContent = text; node.className = `text-sm ${error ? 'text-red-600 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`; } },
    invalidate: () => { const s = AssistantsComponent.state; if (s.saving) return; s.preview = []; AssistantsComponent.element('ai-save').disabled = true; AssistantsComponent.element('ai-preview-list').innerHTML = ''; AssistantsComponent.message(''); },
    disablePreparation: () => { ['ai-rubro', 'ai-copy-prompt', 'ai-preview'].forEach(id => { AssistantsComponent.element(id).disabled = true; }); },
    loadProjects: async () => {
        const s = AssistantsComponent.state, generation = ++s.generation;
        s.projectId = ''; s.labels = {}; AssistantsComponent.invalidate(); AssistantsComponent.disablePreparation();
        const select = AssistantsComponent.element('ai-project'); select.disabled = true;
        AssistantsComponent.element('ai-destination').textContent = 'Cargando proyectos…';
        try {
            const snapshot = await db.ref(`users/${s.workspaceId}/projects`).once('value');
            if (s !== AssistantsComponent.state || generation !== s.generation) return;
            s.projects = Object.entries(snapshot.val() || {}).filter(([, p]) => p.owner === s.workspaceId && p.status !== 'inactive').map(([id, p]) => ({ id, name: p.name }));
            select.innerHTML = '<option value="">Elegí un proyecto</option>' + s.projects.map(p => `<option value="${AssistantsComponent.escape(p.id)}">${AssistantsComponent.escape(p.name)}</option>`).join('');
            select.disabled = !s.projects.length;
            AssistantsComponent.element('ai-destination').textContent = s.projects.length ? 'Elegí el proyecto donde se guardarán las tareas.' : 'Este espacio no tiene proyectos activos.';
        } catch (error) { if (s === AssistantsComponent.state) AssistantsComponent.message(error.message, true); }
    },
    loadProject: async () => {
        const s = AssistantsComponent.state, generation = ++s.generation;
        s.projectId = AssistantsComponent.element('ai-project').value; s.labels = {};
        AssistantsComponent.invalidate(); AssistantsComponent.disablePreparation();
        if (!s.projectId) { AssistantsComponent.element('ai-destination').textContent = 'Elegí un proyecto.'; return; }
        AssistantsComponent.element('ai-destination').textContent = 'Cargando el proyecto seleccionado…';
        try {
            const snapshot = await db.ref(`project_data/${s.projectId}`).once('value');
            if (s !== AssistantsComponent.state || generation !== s.generation) return;
            const data = snapshot.val() || {};
            s.labels = { rubros: (data.rubros || []).filter(r => !['Realizados', 'Eliminado'].includes(r)), responsables: data.responsables || [] };
            AssistantsComponent.element('ai-rubro').innerHTML = s.labels.rubros.map(r => `<option>${AssistantsComponent.escape(r)}</option>`).join('');
            ['ai-rubro', 'ai-copy-prompt', 'ai-preview'].forEach(id => { AssistantsComponent.element(id).disabled = !s.labels.rubros.length; });
            AssistantsComponent.element('ai-destination').textContent = `Destino: ${s.workspaces.find(w => w.id === s.workspaceId).name} → ${s.projects.find(p => p.id === s.projectId).name}`;
            if (!s.labels.rubros.length) AssistantsComponent.message('Agregá un rubro activo al proyecto antes de cargar tareas.', true);
        } catch (error) { if (s === AssistantsComponent.state) AssistantsComponent.message(error.message, true); }
    },
    copy: async text => { try { await navigator.clipboard.writeText(text); UI.showToast('Copiado', 'success'); } catch { window.prompt('Copiá este texto:', text); } },
    preview: () => {
        const s = AssistantsComponent.state; AssistantsComponent.invalidate();
        try {
            s.preview = AssistantFormat.parse(AssistantsComponent.element('ai-text').value, { ...s.labels, defaultRubro: AssistantsComponent.element('ai-rubro').value });
            const e = AssistantsComponent.escape;
            AssistantsComponent.element('ai-preview-list').innerHTML = s.preview.map((t, i) => `<article class="border border-gray-200 dark:border-slate-700 rounded-lg p-4"><div class="flex gap-3"><span class="text-sm text-gray-400">${i + 1}</span><div class="min-w-0"><h3 class="font-medium dark:text-white break-words">${e(t.requerimiento)}</h3><p class="text-sm text-gray-500 mt-1 break-words">${e(t.rubro)} · ${e(t.responsable || 'Sin responsable')} · ${e(t.prioridad)} · ${e(t.deadline ? Utils.formatDate(t.deadline) : 'Sin vencimiento')}${t.confidential ? ' · Confidencial' : ''}</p>${t.description ? `<p class="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap break-words">${e(t.description)}</p>` : ''}</div></div></article>`).join('');
            AssistantsComponent.element('ai-save').disabled = false;
            AssistantsComponent.element('ai-save').textContent = `Guardar ${s.preview.length} ${s.preview.length === 1 ? 'tarea' : 'tareas'} en Nexus`;
            AssistantsComponent.message('Revisá el destino y las tareas. Se guardarán como pendientes. Repetir esta misma carga conserva las tareas ya guardadas.');
        } catch (error) { AssistantsComponent.message(error.message, true); }
    },
    save: async () => {
        const s = AssistantsComponent.state; if (s.saving || !s.preview.length) return; s.saving = true;
        for (const node of s.container.querySelectorAll('select, textarea, #ai-save, #ai-preview, #ai-copy-prompt')) node.disabled = true;
        AssistantsComponent.message('Guardando tareas…');
        try {
            const result = await Store.importAssistantTasks(s.workspaceId, s.projectId, s.preview, await AssistantFormat.digest(JSON.stringify(s.preview)));
            AssistantsComponent.message(`${result.inserted} tareas guardadas${result.existing ? `; ${result.existing} ya estaban cargadas` : ''}.`);
            const link = document.createElement('a'); link.href = `#/project/${encodeURIComponent(s.projectId)}?workspace=${encodeURIComponent(s.workspaceId)}`; link.className = 'inline-block mt-3 text-brand-600 dark:text-brand-300 underline'; link.textContent = 'Abrir proyecto en Nexus'; AssistantsComponent.element('ai-preview-list')?.append(link);
            s.preview = []; UI.showToast('Carga completada', 'success');
        } catch (error) { AssistantsComponent.message(error.message, true); }
        finally { s.saving = false; if (s === AssistantsComponent.state && AssistantsComponent.element('ai-save')) { for (const node of s.container.querySelectorAll('select, textarea, #ai-preview, #ai-copy-prompt')) node.disabled = false; AssistantsComponent.element('ai-save').disabled = !s.preview.length; } }
    },
    loadConnections: async () => {
        const s = AssistantsComponent.state, e = AssistantsComponent.escape;
        try {
            const result = await AssistantAPI.request('/v1/connections'); if (s !== AssistantsComponent.state) return;
            const node = AssistantsComponent.element('ai-connections');
            node.innerHTML = result.connections.length ? result.connections.map(c => `<div class="flex flex-wrap justify-between items-center gap-3 py-3 border-t border-gray-100 dark:border-slate-700"><div><strong class="dark:text-white">${e(c.clientName)}</strong><p class="text-xs mt-1">${c.scopes.includes('tasks:write') ? 'Consultar y modificar' : 'Sólo consultar'} · ${e(c.workspaceIds.map(id => s.workspaces.find(w => w.id === id)?.name || 'Espacio sin acceso actual').join(', '))}</p></div><button class="btn-secondary text-sm" data-revoke="${e(c.id)}">Desconectar</button></div>`).join('') : 'Todavía no conectaste un asistente.';
            node.querySelectorAll('[data-revoke]').forEach(button => { button.onclick = async () => { button.disabled = true; try { await AssistantAPI.request(`/v1/connections/${encodeURIComponent(button.dataset.revoke)}`, { method: 'DELETE' }); await AssistantsComponent.loadConnections(); } catch (error) { button.disabled = false; AssistantsComponent.message(error.message, true); } }; });
            const history = await AssistantAPI.request('/v1/history'); if (s !== AssistantsComponent.state) return;
            AssistantsComponent.element('ai-history').innerHTML = history.history.length ? history.history.map(row => `<p class="py-2 border-t border-gray-100 dark:border-slate-700">${row.operation === 'create_task' ? 'Tarea creada' : 'Tarea modificada'}: ${e(row.task.requerimiento)} <span class="text-xs">· ${e(new Date(row.createdAt).toLocaleString('es-AR'))}</span></p>`).join('') : 'Todavía no hay cambios desde tus asistentes.';
        } catch (error) { if (s === AssistantsComponent.state) { AssistantsComponent.element('ai-connections').textContent = error.message; AssistantsComponent.element('ai-history').textContent = 'No se pudo consultar el historial.'; } }
    },
    authorize: async (container, ticket) => {
        const e = AssistantsComponent.escape;
        if (!Auth.getCurrentUser() || Auth.getCurrentUser().isAnonymous) { container.innerHTML = '<div class="max-w-xl mx-auto p-8"><h1 class="text-2xl font-bold dark:text-white">Conectar Nexus</h1><p class="mt-3 text-gray-500">Ingresá con tu cuenta de Google para elegir qué espacios autorizás.</p><button class="btn-primary mt-5" onclick="Auth.signInWithGoogle()">Ingresar con Google</button></div>'; return; }
        container.innerHTML = '<p class="p-8 text-gray-500">Consultando la solicitud de conexión…</p>';
        try {
            const data = await AssistantAPI.request(`/v1/authorization/${encodeURIComponent(ticket || '')}`);
            container.innerHTML = `<div class="max-w-xl mx-auto p-5 sm:p-8"><section class="glass-card rounded-xl p-6 space-y-5"><div><h1 class="text-2xl font-bold dark:text-white">Conectar Nexus con ${e(data.clientName)}</h1><p class="text-sm text-gray-500 mt-2">Cuenta: ${e(Auth.getCurrentUser().email)}. Elegí los espacios que puede usar esta conexión.</p></div><form id="ai-consent" class="space-y-5"><fieldset class="space-y-3"><legend class="font-medium dark:text-gray-200 mb-3">Espacios autorizados</legend>${data.workspaces.map(w => `<label class="flex gap-3 items-center border border-gray-200 dark:border-slate-700 rounded-lg p-3"><input type="checkbox" name="workspace" value="${e(w.id)}"><span class="text-sm dark:text-gray-200">${e(w.name)} · ${w.role === 'owner' ? 'Propietario' : 'Administrador'}</span></label>`).join('')}</fieldset>${data.scopes.includes('tasks:write') ? '<label class="flex gap-3 items-center text-sm dark:text-gray-200"><input type="checkbox" name="write">Permitir crear y modificar tareas</label>' : '<p class="text-sm text-gray-500">Esta conexión sólo permite consultar.</p>'}<p class="text-sm text-gray-500">Podés desconectar el asistente desde Nexus. Sus permisos dependen de tu acceso vigente a cada espacio.</p><div class="flex gap-3"><button type="submit" class="btn-primary">Autorizar conexión</button><a href="#/assistants" class="btn-secondary">Cancelar</a></div><p id="ai-consent-message" class="text-sm text-red-600" role="status"></p></form></section></div>`;
            const form = container.querySelector('#ai-consent');
            form.onsubmit = async event => {
                event.preventDefault(); const message = container.querySelector('#ai-consent-message');
                const workspaceIds = Array.from(form.querySelectorAll('[name=workspace]:checked'), input => input.value);
                if (!workspaceIds.length) { message.textContent = 'Seleccioná al menos un espacio.'; return; }
                const button = form.querySelector('[type=submit]'); button.disabled = true;
                try {
                    const result = await AssistantAPI.request(`/v1/authorization/${encodeURIComponent(ticket)}`, { method: 'POST', body: JSON.stringify({ workspaceIds, allowWrite: !!form.querySelector('[name=write]')?.checked }) });
                    const destination = new URL(result.redirectUrl);
                    if (!['https://chatgpt.com', 'https://claude.ai', 'https://gemini.google.com'].includes(destination.origin)) throw new Error('Destino de autorización no válido.');
                    window.location.assign(destination.href);
                } catch (error) { message.textContent = error.message; button.disabled = false; }
            };
        } catch (error) { container.innerHTML = `<div class="max-w-xl mx-auto p-8"><h1 class="text-2xl font-bold dark:text-white">No se pudo conectar Nexus</h1><p class="mt-3 text-gray-500">${e(error.message)}</p><a href="#/assistants" class="btn-secondary inline-block mt-5">Volver a asistentes</a></div>`; }
    }
};
