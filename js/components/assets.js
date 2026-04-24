const AssetsComponent = {
    projectId: null,
    assets: [],
    tasks: [],
    rubros: [],
    responsables: [],
    currentAssetAttachments: [],
    editingAssetId: null,
    selectedAssetDetail: null,

    render: async (container, projectId) => {
        AssetsComponent.projectId = projectId;
        await AssetsComponent.refreshData();

        const projectInfo = await Store.getProject(projectId);
        const projectName = projectInfo ? projectInfo.name : 'Proyecto';

        container.innerHTML = `
            ${NavbarComponent.render()}
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
                <!-- Header -->
                <div class="glass-panel p-4 rounded-xl mb-6 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 md:top-20 z-30 shadow-sm backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-white/20">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span onclick="App.navigateTo('#/project/${projectId}')" class="cursor-pointer hover:text-brand-600"><i class="fas fa-arrow-left"></i></span>
                            <i class="fas fa-boxes-stacked text-brand-500"></i>
                            Activos
                            <span class="text-base font-normal text-gray-400">— ${projectName}</span>
                        </h2>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="AssetsComponent.openAssetModal()" class="btn-primary text-sm px-4 shadow-lg shadow-brand-500/30">
                            <i class="fas fa-plus"></i> <span class="hidden sm:inline">Nuevo Activo</span>
                        </button>
                    </div>
                </div>

                <!-- Assets Grid -->
                <div id="assets-grid-container">
                    ${AssetsComponent.renderAssetsGrid()}
                </div>
            </div>

            <!-- Asset Modal -->
            ${AssetsComponent.renderAssetModal()}
            <!-- Asset Detail Modal -->
            ${AssetsComponent.renderDetailModal()}
        `;
    },

    refreshData: async () => {
        AssetsComponent.assets = await Store.getAssets(AssetsComponent.projectId);
        const fullData = await Store.getProjectData(AssetsComponent.projectId);
        AssetsComponent.tasks = fullData.tasks ? Object.keys(fullData.tasks).map(k => ({ id: k, ...fullData.tasks[k] })) : [];
        AssetsComponent.rubros = fullData.rubros || [];
        AssetsComponent.responsables = fullData.responsables || [];
    },

    refreshUI: async () => {
        await AssetsComponent.refreshData();
        const grid = document.getElementById('assets-grid-container');
        if (grid) grid.innerHTML = AssetsComponent.renderAssetsGrid();
    },

    getTasksForAsset: (assetId) => {
        return AssetsComponent.tasks.filter(t => t.assetId === assetId);
    },

    renderAssetsGrid: () => {
        if (AssetsComponent.assets.length === 0) {
            return `
                <div class="text-center py-20">
                    <div class="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 dark:text-gray-600">
                        <i class="fas fa-boxes-stacked text-4xl"></i>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">No hay activos registrados</h3>
                    <p class="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-2">Comenzá creando tu primer activo para vincular tareas y documentación.</p>
                    <button onclick="AssetsComponent.openAssetModal()" class="btn-primary mt-6"><i class="fas fa-plus mr-2"></i>Crear Activo</button>
                </div>
            `;
        }

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${AssetsComponent.assets.map(asset => {
                    const assetTasks = AssetsComponent.getTasksForAsset(asset.id);
                    const pending = assetTasks.filter(t => t.estado === 'Pendiente' || t.estado === 'En Proceso').length;
                    const done = assetTasks.filter(t => t.estado === 'Realizado').length;
                    const docsCount = (asset.documents || []).length;

                    return `
                        <div class="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group border border-transparent hover:border-brand-200 dark:hover:border-brand-900 cursor-pointer" onclick="AssetsComponent.openDetail('${asset.id}')">
                            <!-- Image -->
                            <div class="h-40 bg-gray-100 dark:bg-slate-700 relative overflow-hidden">
                                ${asset.image
                                    ? `<img src="${asset.image}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${asset.name}">`
                                    : `<div class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600"><i class="fas fa-image text-5xl"></i></div>`
                                }
                                <div class="absolute top-2 right-2 flex gap-1" onclick="event.stopPropagation()">
                                    <button onclick="AssetsComponent.openAssetModal('${asset.id}')" class="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 text-gray-600 dark:text-gray-300 hover:bg-white flex items-center justify-center text-xs shadow-sm backdrop-blur-sm" title="Editar">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button onclick="AssetsComponent.deleteAsset('${asset.id}')" class="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 text-red-500 hover:bg-red-50 flex items-center justify-center text-xs shadow-sm backdrop-blur-sm" title="Eliminar">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                            <!-- Info -->
                            <div class="p-4">
                                <h3 class="font-bold text-gray-900 dark:text-white truncate mb-1">${asset.name}</h3>
                                ${asset.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">${asset.description}</p>` : '<div class="mb-3"></div>'}
                                <div class="flex items-center justify-between text-xs">
                                    <div class="flex gap-3">
                                        ${pending > 0 ? `<span class="flex items-center gap-1 text-amber-600 dark:text-amber-400"><i class="fas fa-clock"></i> ${pending}</span>` : ''}
                                        ${done > 0 ? `<span class="flex items-center gap-1 text-brand-600 dark:text-brand-400"><i class="fas fa-check"></i> ${done}</span>` : ''}
                                        ${assetTasks.length === 0 ? `<span class="text-gray-400">Sin tareas</span>` : ''}
                                    </div>
                                    ${docsCount > 0 ? `<span class="flex items-center gap-1 text-gray-400"><i class="fas fa-paperclip"></i> ${docsCount}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    // --- Asset CRUD Modal ---

    openAssetModal: (assetId = null) => {
        AssetsComponent.editingAssetId = assetId;
        AssetsComponent.currentAssetAttachments = [];

        const modal = document.getElementById('asset-modal');
        const title = document.getElementById('asset-modal-title');
        const form = document.getElementById('asset-form');

        form.reset();
        document.getElementById('asset-image-preview').innerHTML = '';

        if (assetId) {
            const asset = AssetsComponent.assets.find(a => a.id === assetId);
            if (!asset) return;
            title.textContent = 'Editar Activo';
            document.getElementById('asset-name').value = asset.name || '';
            document.getElementById('asset-description').value = asset.description || '';
            if (asset.image) {
                document.getElementById('asset-image-preview').innerHTML = `<img src="${asset.image}" class="w-full h-32 object-cover rounded-lg">`;
            }
            AssetsComponent.currentAssetAttachments = asset.documents ? JSON.parse(JSON.stringify(asset.documents)) : [];
        } else {
            title.textContent = 'Nuevo Activo';
        }

        AssetsComponent.renderAssetDocsPreview();
        modal.classList.remove('hidden');
    },

    renderAssetModal: () => {
        return `
            <div id="asset-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4">
                <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-scale-up">
                    <div class="flex justify-between items-center mb-6">
                        <h3 id="asset-modal-title" class="text-2xl font-bold dark:text-white">Nuevo Activo</h3>
                        <button onclick="document.getElementById('asset-modal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                    </div>
                    <form id="asset-form" onsubmit="AssetsComponent.handleAssetSubmit(event)" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Nombre <span class="text-red-500">*</span></label>
                            <input type="text" id="asset-name" required class="input-primary mt-1" placeholder="Ej: Compresor Industrial #3">
                        </div>
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Descripción</label>
                            <textarea id="asset-description" rows="2" class="input-primary mt-1" placeholder="Detalles del activo..."></textarea>
                        </div>

                        <!-- Image -->
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-2">Imagen Principal</label>
                            <div class="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors relative">
                                <input type="file" id="asset-image-input" accept="image/*" onchange="AssetsComponent.handleImageSelect(event)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                                <i class="fas fa-camera text-2xl text-gray-400 mb-1"></i>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Click para subir imagen</p>
                            </div>
                            <div id="asset-image-preview" class="mt-2"></div>
                        </div>

                        <!-- Documents -->
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-2">Documentos Adjuntos</label>
                            <div class="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors relative">
                                <input type="file" id="asset-docs-input" multiple onchange="AssetsComponent.handleDocsSelect(event)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                                <i class="fas fa-cloud-upload-alt text-2xl text-gray-400 mb-1"></i>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Arrastra archivos o haz click</p>
                            </div>
                            <div id="asset-docs-preview" class="flex flex-wrap gap-2 mt-2"></div>
                        </div>

                        <div class="flex justify-end pt-4">
                            <button type="submit" class="btn-primary">Guardar Activo</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    handleImageSelect: async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { UI.showToast('Imagen muy pesada (Max 10MB)', 'error'); return; }

        try {
            UI.showToast('Subiendo imagen...', 'info');
            const url = await Store.uploadFile(file);
            document.getElementById('asset-image-preview').innerHTML = `<img src="${url}" class="w-full h-32 object-cover rounded-lg">`;
            document.getElementById('asset-image-preview').dataset.url = url;
            UI.showToast('Imagen subida', 'success');
        } catch (e) {
            console.error(e);
            UI.showToast('Error al subir imagen', 'error');
        }
        event.target.value = '';
    },

    handleDocsSelect: async (event) => {
        const files = Array.from(event.target.files);
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) { UI.showToast(`${file.name} muy pesado (Max 10MB)`, 'error'); continue; }
            try {
                UI.showToast(`Subiendo ${file.name}...`, 'info');
                const url = await Store.uploadFile(file);
                AssetsComponent.currentAssetAttachments.push({ name: file.name, data: url, type: file.type });
                UI.showToast(`${file.name} subido`, 'success');
            } catch (e) {
                console.error(e);
                UI.showToast(`Error subiendo ${file.name}`, 'error');
            }
        }
        AssetsComponent.renderAssetDocsPreview();
        event.target.value = '';
    },

    removeAssetDoc: (index) => {
        AssetsComponent.currentAssetAttachments.splice(index, 1);
        AssetsComponent.renderAssetDocsPreview();
    },

    renderAssetDocsPreview: () => {
        const container = document.getElementById('asset-docs-preview');
        if (!container) return;
        container.innerHTML = AssetsComponent.currentAssetAttachments.map((att, i) => {
            const isImage = att.type && att.type.startsWith('image/');
            const icon = isImage ? 'fas fa-image' : (att.name.endsWith('.pdf') ? 'fas fa-file-pdf text-red-500' : 'fas fa-file text-gray-400');
            return `
                <div class="relative group w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-slate-600 flex items-center justify-center bg-gray-50 dark:bg-slate-700" title="${att.name}">
                    ${isImage ? `<img src="${att.data}" class="w-full h-full object-cover">` : `<i class="${icon} text-2xl"></i>`}
                    <button type="button" onclick="AssetsComponent.removeAssetDoc(${i})" class="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            `;
        }).join('');
    },

    handleAssetSubmit: async (e) => {
        e.preventDefault();
        const name = document.getElementById('asset-name').value.trim();
        const description = document.getElementById('asset-description').value.trim();
        const imgPreview = document.getElementById('asset-image-preview');
        let image = imgPreview.dataset.url || '';

        // If editing and image wasn't changed, keep existing
        if (AssetsComponent.editingAssetId && !image) {
            const existing = AssetsComponent.assets.find(a => a.id === AssetsComponent.editingAssetId);
            if (existing) image = existing.image || '';
        }

        const assetData = {
            name,
            description,
            image,
            documents: AssetsComponent.currentAssetAttachments
        };

        try {
            if (AssetsComponent.editingAssetId) {
                await Store.updateAsset(AssetsComponent.projectId, AssetsComponent.editingAssetId, assetData);
                UI.showToast('Activo actualizado', 'success');
            } else {
                await Store.addAsset(AssetsComponent.projectId, assetData);
                UI.showToast('Activo creado', 'success');
            }
            document.getElementById('asset-modal').classList.add('hidden');
            AssetsComponent.refreshUI();
        } catch (err) {
            console.error(err);
            UI.showToast('Error al guardar activo', 'error');
        }
    },

    deleteAsset: async (assetId) => {
        if (!await UI.confirm('¿Eliminar este activo? Las tareas vinculadas no se eliminarán.')) return;
        try {
            await Store.deleteAsset(AssetsComponent.projectId, assetId);
            UI.showToast('Activo eliminado', 'success');
            AssetsComponent.refreshUI();
        } catch (e) {
            console.error(e);
            UI.showToast('Error al eliminar', 'error');
        }
    },

    // --- Detail Modal ---

    openDetail: (assetId) => {
        const asset = AssetsComponent.assets.find(a => a.id === assetId);
        if (!asset) return;
        AssetsComponent.selectedAssetDetail = asset;

        const modal = document.getElementById('asset-detail-modal');
        const assetTasks = AssetsComponent.getTasksForAsset(assetId);
        const docs = asset.documents || [];

        modal.querySelector('#asset-detail-content').innerHTML = `
            <!-- Image -->
            ${asset.image ? `
                <div class="rounded-xl overflow-hidden mb-6 max-h-64">
                    <img src="${asset.image}" class="w-full h-full object-cover" alt="${asset.name}">
                </div>
            ` : ''}

            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-2xl font-bold dark:text-white">${asset.name}</h3>
                    ${asset.description ? `<p class="text-gray-500 dark:text-gray-400 mt-1">${asset.description}</p>` : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="AssetsComponent.openAssetModal('${assetId}'); document.getElementById('asset-detail-modal').classList.add('hidden');" class="btn-secondary text-sm px-3"><i class="fas fa-pen"></i></button>
                </div>
            </div>

            <!-- Documents -->
            ${docs.length > 0 ? `
                <div class="mb-6">
                    <h4 class="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><i class="fas fa-paperclip text-brand-500"></i> Documentos (${docs.length})</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        ${docs.map(doc => {
                            const isImg = doc.type && doc.type.startsWith('image/');
                            const icon = isImg ? 'fas fa-image text-blue-500' : (doc.name.endsWith('.pdf') ? 'fas fa-file-pdf text-red-500' : 'fas fa-file text-gray-400');
                            return `
                                <a href="${doc.data}" target="_blank" class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-100 dark:border-slate-600 group">
                                    <i class="${icon} text-lg"></i>
                                    <span class="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-brand-600">${doc.name}</span>
                                </a>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Tasks -->
            <div>
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"><i class="fas fa-tasks text-brand-500"></i> Tareas Vinculadas (${assetTasks.length})</h4>
                    <button onclick="AssetsComponent.createTaskForAsset('${assetId}')" class="text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-900/50 transition-colors font-medium">
                        <i class="fas fa-plus mr-1"></i> Nueva Tarea
                    </button>
                </div>

                ${assetTasks.length === 0 ? `
                    <div class="text-center py-8 text-gray-400 text-sm italic">No hay tareas vinculadas a este activo.</div>
                ` : `
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        ${assetTasks.map(t => {
                            const statusColor = { 'Pendiente': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 'En Proceso': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'Realizado': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', 'Suspendido': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
                            return `
                                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer" onclick="App.navigateTo('#/project/${AssetsComponent.projectId}')">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">${t.requerimiento}</p>
                                        <p class="text-xs text-gray-400 mt-0.5">${t.responsable || ''} ${t.deadline ? '· ' + Utils.formatDate(t.deadline) : ''}</p>
                                    </div>
                                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ml-2 whitespace-nowrap ${statusColor[t.estado] || 'bg-gray-100 text-gray-500'}">${t.estado}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;

        modal.classList.remove('hidden');
    },

    renderDetailModal: () => {
        return `
            <div id="asset-detail-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4">
                <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-scale-up">
                    <div class="flex justify-end mb-2">
                        <button onclick="document.getElementById('asset-detail-modal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                    </div>
                    <div id="asset-detail-content"></div>
                </div>
            </div>
        `;
    },

    createTaskForAsset: (assetId) => {
        // Close detail modal, navigate to project, and open task modal with asset pre-selected
        document.getElementById('asset-detail-modal').classList.add('hidden');
        // Store the assetId to pre-select after navigation
        sessionStorage.setItem('nexus_prefill_assetId', assetId);
        App.navigateTo(`#/project/${AssetsComponent.projectId}`);
        // The ProjectComponent.render will pick this up via openTaskModal
        setTimeout(() => {
            if (typeof ProjectComponent !== 'undefined') {
                ProjectComponent.openTaskModal();
                // Set the asset select after modal opens
                setTimeout(() => {
                    const sel = document.getElementById('task-asset');
                    if (sel) sel.value = assetId;
                    sessionStorage.removeItem('nexus_prefill_assetId');
                }, 200);
            }
        }, 800);
    }
};
