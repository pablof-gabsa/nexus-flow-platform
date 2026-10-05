/* Connect assistants with explicit space permissions. Reuse Nexus Inter,
 * blue actions, slate/white glass surfaces and 4px spacing. */
window.AssistantsComponent = {
    state: null,
    escape: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    render: async container => {
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous) { container.innerHTML = '<div class="p-8"><h1 class="text-2xl font-bold">Asistentes</h1><p class="mt-3">Ingresá con tu cuenta de Google para gestionar tus asistentes.</p><button class="btn-primary mt-5" onclick="Auth.signInWithGoogle()">Ingresar con Google</button></div>'; return; }
        const workspaces = await Store.getAssistantWorkspaces();
        if (window.location.hash.split('?')[0] !== '#/assistants') return;
        AssistantsComponent.state = { container, workspaces };
        const api = AssistantAPI.base();
        container.innerHTML = `<div class="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
            <div><a href="#/dashboard" class="text-sm text-brand-600 dark:text-brand-300">Volver a mi trabajo</a><h1 class="text-3xl font-bold dark:text-white mt-3">Asistentes</h1><p class="text-gray-500 dark:text-gray-400 mt-2">Conectá tu asistente para consultar y gestionar tareas en tus espacios de Nexus.</p></div>
            <section class="glass-card rounded-xl p-5 sm:p-6 space-y-4"><div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-lg font-semibold dark:text-white">Conexiones</h2><span class="text-xs rounded-full px-3 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">${api ? 'Servicio configurado' : 'Conexión directa pendiente de activación'}</span></div><p class="text-sm text-gray-600 dark:text-gray-400">Cada conexión utiliza tu cuenta y los espacios que autorices.</p>
            ${api ? '<button id="ai-copy-url" class="btn-secondary">Copiar dirección de conexión</button>' : '<p class="text-sm text-gray-500">La conexión directa estará disponible cuando se active el servicio.</p>'}
            <details class="text-sm"><summary class="cursor-pointer font-medium text-brand-700 dark:text-brand-300">Cómo conectar mi asistente</summary><div class="mt-3 space-y-3 text-gray-600 dark:text-gray-400"><p><strong>ChatGPT:</strong> agregá Nexus como conexión personalizada desde sus ajustes de plugins y autorizá tu cuenta.</p><p><strong>Claude:</strong> agregá un conector personalizado desde Conectores y autorizá tu cuenta.</p><p><strong>Gemini:</strong> agregá una aplicación personalizada desde Aplicaciones conectadas, cuando esté disponible para tu cuenta y país. <a class="underline" href="https://support.google.com/gemini/answer/17209137" target="_blank" rel="noopener noreferrer">Consultar disponibilidad</a>.</p><p>Nexus comprueba tus permisos en cada pedido. Podés desconectar el asistente cuando quieras.</p></div></details>
            <div id="ai-connections" class="text-sm text-gray-500" aria-live="polite">${api ? 'Cargando conexiones…' : 'El servicio necesita activarse antes de vincular cuentas.'}</div>
            <p id="ai-message" class="text-sm text-gray-600 dark:text-gray-400" role="status" aria-live="polite"></p></section>
            ${api ? '<section class="glass-card rounded-xl p-5 sm:p-6"><h2 class="text-lg font-semibold dark:text-white">Cambios desde mis asistentes</h2><div id="ai-history" class="mt-4 text-sm text-gray-500" aria-live="polite">Cargando historial…</div></section>' : ''}</div>`;
        if (api) { container.querySelector('#ai-copy-url').onclick = () => AssistantsComponent.copy(`${api}/mcp`); void AssistantsComponent.loadConnections(); }
    },
    element: id => AssistantsComponent.state?.container.querySelector(`#${id}`),
    active: s => s === AssistantsComponent.state && window.location.hash.split('?')[0] === '#/assistants' && !!s.container.querySelector('#ai-connections'),
    message: (text, error = false) => { const node = AssistantsComponent.element('ai-message'); if (node) { node.textContent = text; node.className = `text-sm ${error ? 'text-red-600 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`; } },
    copy: async text => { try { await navigator.clipboard.writeText(text); UI.showToast('Copiado', 'success'); } catch { window.prompt('Copiá este texto:', text); } },
    loadConnections: async () => {
        const s = AssistantsComponent.state, e = AssistantsComponent.escape;
        try {
            const result = await AssistantAPI.request('/v1/connections'); if (!AssistantsComponent.active(s)) return;
            const node = AssistantsComponent.element('ai-connections');
            node.innerHTML = result.connections.length ? result.connections.map(c => `<div class="flex flex-wrap justify-between items-center gap-3 py-3 border-t border-gray-100 dark:border-slate-700"><div><strong class="dark:text-white">${e(c.clientName)}</strong><p class="text-xs mt-1">${c.scopes.includes('tasks:write') ? 'Consultar y modificar' : 'Sólo consultar'} · ${e(c.workspaceIds.map(id => s.workspaces.find(w => w.id === id)?.name || 'Espacio sin acceso actual').join(', '))}</p></div><button class="btn-secondary text-sm" data-revoke="${e(c.id)}">Desconectar</button></div>`).join('') : 'Todavía no conectaste un asistente.';
            node.querySelectorAll('[data-revoke]').forEach(button => { button.onclick = async () => { button.disabled = true; try { await AssistantAPI.request(`/v1/connections/${encodeURIComponent(button.dataset.revoke)}`, { method: 'DELETE' }); await AssistantsComponent.loadConnections(); } catch (error) { button.disabled = false; AssistantsComponent.message(error.message, true); } }; });
            const history = await AssistantAPI.request('/v1/history'); if (!AssistantsComponent.active(s)) return;
            AssistantsComponent.element('ai-history').innerHTML = history.history.length ? history.history.map(row => `<p class="py-2 border-t border-gray-100 dark:border-slate-700">${row.operation === 'create_task' ? 'Tarea creada' : 'Tarea modificada'}: ${e(row.task.requerimiento)} <span class="text-xs">· ${e(new Date(row.createdAt).toLocaleString('es-AR'))}</span></p>`).join('') : 'Todavía no hay cambios desde tus asistentes.';
        } catch (error) { if (AssistantsComponent.active(s)) { AssistantsComponent.element('ai-connections').textContent = error.message; AssistantsComponent.element('ai-history').textContent = 'No se pudo consultar el historial.'; } }
    },
    authorize: async (container, ticket) => {
        const e = AssistantsComponent.escape;
        const route = window.location.hash;
        if (!Auth.getCurrentUser() || Auth.getCurrentUser().isAnonymous) { container.innerHTML = '<div class="max-w-xl mx-auto p-8"><h1 class="text-2xl font-bold dark:text-white">Conectar Nexus</h1><p class="mt-3 text-gray-500">Ingresá con tu cuenta de Google para elegir qué espacios autorizás.</p><button class="btn-primary mt-5" onclick="Auth.signInWithGoogle()">Ingresar con Google</button></div>'; return; }
        container.innerHTML = '<p class="p-8 text-gray-500">Consultando la solicitud de conexión…</p>';
        try {
            const data = await AssistantAPI.request(`/v1/authorization/${encodeURIComponent(ticket || '')}`);
            if (window.location.hash !== route) return;
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
        } catch (error) { if (window.location.hash === route) container.innerHTML = `<div class="max-w-xl mx-auto p-8"><h1 class="text-2xl font-bold dark:text-white">No se pudo conectar Nexus</h1><p class="mt-3 text-gray-500">${e(error.message)}</p><a href="#/assistants" class="btn-secondary inline-block mt-5">Volver a asistentes</a></div>`; }
    }
};
