window.AssistantAPI = {
    base: () => (window.NEXUS_ASSISTANTS_CONFIG?.apiBaseUrl || '').replace(/\/$/, ''),
    publicRequest: async (path, options = {}) => {
        const base = AssistantAPI.base();
        if (!base) throw new Error('La conexión directa todavía no está activada.');
        const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, cache: 'no-store' });
        if (response.status === 204) return null;
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.message || 'No se pudo completar la acción.');
            error.status = response.status;
            throw error;
        }
        return result;
    },
    request: async (path, options = {}) => {
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous) throw new Error('Ingresá con tu cuenta de Google.');
        return AssistantAPI.publicRequest(path, { ...options, headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...options.headers } });
    }
};
