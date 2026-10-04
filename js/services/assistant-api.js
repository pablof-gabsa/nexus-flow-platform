window.AssistantAPI = {
    base: () => (window.NEXUS_ASSISTANTS_CONFIG?.apiBaseUrl || '').replace(/\/$/, ''),
    request: async (path, options = {}) => {
        const base = AssistantAPI.base();
        if (!base) throw new Error('La conexión directa todavía no está activada. Podés usar la carga desde cualquier IA.');
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous) throw new Error('Ingresá con tu cuenta de Google.');
        const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...options.headers }, cache: 'no-store' });
        if (response.status === 204) return null;
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'No se pudo completar la acción.');
        return result;
    }
};
