const SharedComponent = {
    render: async (container, projectId, params) => {
        const mode = params ? params.get('mode') : 'readonly';
        const isEditable = mode === 'edit';

        // Reuse the main Project logic but in "Shared Mode"
        if (typeof ProjectComponent !== 'undefined') {
            await ProjectComponent.render(container, projectId, {
                isShared: true,
                isEditable: isEditable
            });
        } else {
            container.innerHTML = '<p class="text-center p-10">Error: Componente principal no cargado.</p>';
        }
    }
};
