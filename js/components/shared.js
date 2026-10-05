const SharedComponent = {
    render: async (container, projectId, params) => {
        // Reuse the main Project logic but in "Shared Mode"
        if (typeof ProjectComponent !== 'undefined') {
            await ProjectComponent.render(container, projectId, {
                isShared: true,
                isEditable: false,
                params: params
            });
        } else {
            container.innerHTML = '<p class="text-center p-10">Error: Componente principal no cargado.</p>';
        }
    },

    unavailable: (container, error) => {
        const invalid = [400, 404].includes(error?.status);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <div class="bg-red-50 dark:bg-red-900/20 p-8 rounded-2xl border border-red-100 dark:border-red-900/30 max-w-sm">
                    <i class="fas fa-link-slash text-5xl text-red-500 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${invalid ? 'Enlace expirado o inválido' : 'No se pudo abrir el proyecto'}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${invalid ? 'Solicitá al propietario el enlace actual.' : 'Volvé a intentar en unos minutos.'}</p>
                </div>
            </div>`;
    }
};
