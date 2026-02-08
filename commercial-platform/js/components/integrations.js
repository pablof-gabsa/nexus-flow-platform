window.IntegrationsComponent = {
    settings: {},

    load: async () => {
        try {
            IntegrationsComponent.settings = await Store.getIntegrations();
        } catch (e) {
            console.error('Error loading integrations', e);
        }
    },

    isEnabled: (name) => {
        return IntegrationsComponent.settings[name] && IntegrationsComponent.settings[name].enabled;
    },

    toggle: async (name, enabled) => {
        try {
            await Store.saveIntegration(name, { enabled });
            IntegrationsComponent.settings[name] = { enabled };
            UI.showToast(`Integración ${enabled ? 'activada' : 'desactivada'}`, 'success');
        } catch (e) {
            console.error(e);
            UI.showToast('Error guardando configuración', 'error');
            // Revert UI if needed, but for now simple toast
        }
    },

    render: async () => {
        await IntegrationsComponent.load();

        return `
            <div class="space-y-6">
                <div class="flex items-center gap-4">
                    <button onclick="App.navigateTo('#/dashboard'); window.location.reload()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                        <i class="fas fa-arrow-left text-gray-500 dark:text-gray-400"></i>
                    </button>
                    <h2 class="text-2xl font-bold dark:text-white">Integraciones</h2>
                </div>
                <p class="text-gray-500 dark:text-gray-400">Conecta Nexus Flow con otras plataformas.</p>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <!-- Octavo Piso -->
                    <div class="glass-card p-6 rounded-xl border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-4">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" 
                                    ${IntegrationsComponent.isEnabled('octavo_piso') ? 'checked' : ''}
                                    onchange="IntegrationsComponent.toggle('octavo_piso', this.checked)">
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                            </label>
                        </div>

                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-2xl font-bold">
                                8
                            </div>
                            <div>
                                <h3 class="font-bold dark:text-white">Octavo Piso</h3>
                                <span class="text-xs text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">Gestión de Reclamos</span>
                            </div>
                        </div>
                        
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Exporta tareas seleccionadas formato Excel compatible con el módulo de reclamos de Octavo Piso.
                        </p>

                        <div class="text-xs text-gray-400">
                            Incluye: Título, Descripción, Prioridad y Presupuesto.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};
