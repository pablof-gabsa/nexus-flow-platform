// Private references are resolved only for displayed images or clicked links.
window.ProjectFiles = {
    cache: new Map(),
    urls: new Set(),
    context: '',
    parse: (value) => {
        if (typeof value !== 'string') return null;
        const base = AssistantAPI.base();
        if (!base || !value.startsWith(`${base}/v1/project-files/`)) return null;
        const match = /^([A-Za-z0-9_-]{1,128})\/([a-f0-9]{32,64})$/.exec(value.slice(`${base}/v1/project-files/`.length));
        return match ? { projectId: match[1], fileId: match[2] } : null;
    },
    imageAttributes: (url) => ProjectFiles.parse(url)
        ? `src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-nexus-file="${Utils.escapeHTML(url)}" loading="lazy"`
        : `src="${Utils.escapeHTML(url || '')}" loading="lazy"`,
    clear: () => {
        for (const entry of ProjectFiles.cache.values()) entry.then(value => URL.revokeObjectURL(value.url)).catch(() => {});
        for (const url of ProjectFiles.urls) URL.revokeObjectURL(url);
        ProjectFiles.urls.clear();
        ProjectFiles.cache.clear();
        ProjectFiles.context = '';
    },
    credentials: async (projectId) => {
        const shared = Store.sharedAccess;
        if (shared) {
            if (shared.projectId !== projectId) throw new Error('El archivo pertenece a otro proyecto.');
            return { body: { token: shared.token }, headers: {}, key: `shared:${projectId}:${shared.token}` };
        }
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous) throw new Error('Ingresá con tu cuenta de Google.');
        return { body: {}, headers: { Authorization: `Bearer ${await user.getIdToken()}` }, key: `user:${user.uid}:${Store.currentContext.ownerId}` };
    },
    resolve: async (reference) => {
        const file = ProjectFiles.parse(reference);
        if (!file) return { url: reference, type: '' };
        const credentials = await ProjectFiles.credentials(file.projectId);
        if (ProjectFiles.context !== credentials.key) { ProjectFiles.clear(); ProjectFiles.context = credentials.key; }
        if (!ProjectFiles.cache.has(reference)) {
            const request = (async () => {
                const response = await fetch(`${AssistantAPI.base()}/v1/project-files/download`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...credentials.headers }, body: JSON.stringify({ ...file, ...credentials.body }), cache: 'no-store' });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.message || 'No se pudo abrir el archivo.');
                }
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                ProjectFiles.urls.add(url);
                return { url, type: blob.type };
            })();
            ProjectFiles.cache.set(reference, request);
            request.catch(() => ProjectFiles.cache.delete(reference));
            // Keep a small lookup cache, retaining URLs used by displayed images
            // until navigation so an eviction cannot break an image being loaded.
            if (ProjectFiles.cache.size > 20) {
                const first = ProjectFiles.cache.keys().next().value;
                ProjectFiles.cache.delete(first);
            }
        }
        return ProjectFiles.cache.get(reference);
    },
    start: () => {
        const images = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const img = entry.target, reference = img.dataset.nexusFile;
                images.unobserve(img);
                ProjectFiles.resolve(reference).then(file => {
                    if (img.isConnected && img.dataset.nexusFile === reference) img.src = file.url;
                }).catch(error => { img.alt = error.message; img.title = error.message; });
            }
        });
        const discover = root => {
            if (root.nodeType !== 1) return;
            if (root.matches('img[data-nexus-file]')) images.observe(root);
            root.querySelectorAll('img[data-nexus-file]').forEach(img => images.observe(img));
        };
        new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(discover))).observe(document.body, { childList: true, subtree: true });
        discover(document.body);
        document.addEventListener('click', async event => {
            const link = event.target.closest?.('a[href]');
            if (!link || !ProjectFiles.parse(link.getAttribute('href'))) return;
            event.preventDefault();
            const preview = link.target === '_blank' && !link.hasAttribute('download') ? window.open('about:blank', '_blank') : null;
            if (preview) preview.opener = null;
            try {
                const file = await ProjectFiles.resolve(link.getAttribute('href'));
                if (preview && file.type !== 'application/octet-stream') preview.location.replace(file.url);
                else {
                    if (preview) preview.close();
                    const download = document.createElement('a');
                    download.href = file.url;
                    download.download = link.getAttribute('download') || link.textContent.trim() || 'adjunto';
                    document.body.appendChild(download); download.click(); download.remove();
                }
            } catch (error) { if (preview) preview.close(); UI.showToast(error.message, 'error'); }
        });
        window.addEventListener('hashchange', ProjectFiles.clear);
    }
};
document.addEventListener('DOMContentLoaded', ProjectFiles.start);
