const AssetsComponent = {
    projectId: null,
    assets: [],
    tasks: [],
    rubros: [],
    responsables: [],
    assetCategories: [],
    categoryDraft: [],
    currentAssetAttachments: [],
    pendingDeletedFiles: [],
    editingAssetId: null,
    selectedAssetDetail: null,
    isShared: false,
    isEditable: true,
    shareParams: '', // query string for shared mode (e.g. '?mode=edit&t=TOKEN')

    render: async (container, projectId, options = {}) => {
        AssetsComponent.projectId = projectId;
        AssetsComponent.isShared = !!options.isShared;
        AssetsComponent.isEditable = options.isEditable !== false;

        // Preserve sharing query params for navigation
        if (AssetsComponent.isShared && options.params) {
            const parts = [];
            if (options.params.get('mode')) parts.push('mode=' + options.params.get('mode'));
            if (options.params.get('t')) parts.push('t=' + options.params.get('t'));
            AssetsComponent.shareParams = parts.length > 0 ? '?' + parts.join('&') : '';
        } else {
            AssetsComponent.shareParams = '';
        }

        let projectInfo = null;
        if (!AssetsComponent.isShared) {
            projectInfo = await Store.getProject(projectId);
            await AssetsComponent.refreshData();
        } else {
            const data = await Store.getProjectData(projectId);
            const token = options.params ? options.params.get('t') : null;

            if (!data.sharingToken || data.sharingToken !== token) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                        <div class="bg-red-50 dark:bg-red-900/20 p-8 rounded-2xl border border-red-100 dark:border-red-900/30 max-w-sm">
                            <i class="fas fa-link-slash text-5xl text-red-500 mb-4"></i>
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Enlace expirado o invalido</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">El propietario ha cambiado el enlace de acceso o este ya no es valido.</p>
                        </div>
                    </div>
                `;
                return;
            }

            AssetsComponent.applyProjectData(data);
            projectInfo = { id: projectId, name: data.name || 'Proyecto Compartido' };
        }
        if (!projectInfo) {
            const data = await Store.getProjectData(projectId);
            projectInfo = { id: projectId, name: data.name || 'Proyecto Compartido' };
        }
        const projectName = projectInfo ? projectInfo.name : 'Proyecto';
        const backRoute = AssetsComponent.isShared ? `#/share/${projectId}${AssetsComponent.shareParams}` : `#/project/${projectId}`;

        container.innerHTML = `
            ${!AssetsComponent.isShared ? NavbarComponent.render() : ''}
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
                <!-- Header -->
                <div class="glass-panel p-4 rounded-xl mb-8 flex flex-col md:flex-row justify-between items-center gap-4 relative z-20 shadow-sm backdrop-blur-md bg-white/80 dark:bg-slate-900/90 border-b border-white/20">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span onclick="App.navigateTo('${backRoute}')" class="cursor-pointer hover:text-brand-600"><i class="fas fa-arrow-left"></i></span>
                            ${AssetsComponent.isShared ? '<span class="bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 text-xs px-2 py-1 rounded uppercase tracking-wider">Compartido</span>' : ''}
                            <i class="fas fa-boxes-stacked text-brand-500"></i>
                            Activos
                            <span class="text-base font-normal text-gray-400">— ${projectName}</span>
                        </h2>
                    </div>
                    <div class="flex gap-2">
                        ${AssetsComponent.isEditable ? `
                        <button onclick="AssetsComponent.manageCategories()" class="btn-secondary text-sm px-4">
                            <i class="fas fa-layer-group"></i> <span class="hidden sm:inline">Agrupadores</span>
                        </button>
                        <button onclick="AssetsComponent.openAssetModal()" class="btn-primary text-sm px-4 shadow-lg shadow-brand-500/30">
                            <i class="fas fa-plus"></i> <span class="hidden sm:inline">Nuevo Activo</span>
                        </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Assets Grid -->
                <div id="assets-grid-container" class="relative z-10">
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
        const fullData = await Store.getProjectData(AssetsComponent.projectId);
        AssetsComponent.applyProjectData(fullData);
    },

    applyProjectData: (fullData) => {
        AssetsComponent.assets = fullData.assets ? Object.keys(fullData.assets).map(k => ({ id: k, ...fullData.assets[k] })) : [];
        AssetsComponent.tasks = fullData.tasks ? Object.keys(fullData.tasks).map(k => ({ id: k, ...fullData.tasks[k] })) : [];
        AssetsComponent.rubros = fullData.rubros || [];
        AssetsComponent.responsables = fullData.responsables || [];
        AssetsComponent.assetCategories = fullData.assetCategories || [
            'Edificios',
            'Maquinarias',
            'Red vial',
            'Red cloacal',
            'Red de agua',
            'Red electrica',
            'Mobiliarios'
        ];
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
                    ${AssetsComponent.isEditable ? `<button onclick="AssetsComponent.openAssetModal()" class="btn-primary mt-6"><i class="fas fa-plus mr-2"></i>Crear Activo</button>` : ''}
                </div>
            `;
        }

        const grouped = {};
        const seenAssets = new Set();
        const categories = [...new Set([...(AssetsComponent.assetCategories || [])])];

        AssetsComponent.assets.forEach(asset => {
            if (!asset || seenAssets.has(asset.id)) return;
            seenAssets.add(asset.id);

            const category = asset.category || 'Sin categoria';
            if (!categories.includes(category)) categories.push(category);
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(asset);
        });

        return `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${categories.map(category => {
            const list = grouped[category] || [];
            if (list.length === 0) return '';
            return AssetsComponent.renderCategoryCard(category, list);
        }).join('')}
            </div>
        `;
    },

    renderCategoryCard: (category, assets) => {
        const cover = assets.find(asset => asset.image)?.image || '';
        const taskIds = new Set();
        assets.forEach(asset => AssetsComponent.getTasksForAsset(asset.id).forEach(task => taskIds.add(task.id)));
        const docsCount = assets.reduce((sum, asset) => sum + ((asset.documents || []).length), 0);
        const outOfService = assets.filter(asset => (asset.serviceStatus || 'En servicio') === 'Fuera de servicio').length;

        return `
            <button onclick="AssetsComponent.openCategory('${category}')" class="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group border border-transparent hover:border-brand-200 dark:hover:border-brand-900 text-left">
                <div class="h-40 bg-gray-100 dark:bg-slate-700 relative overflow-hidden">
                    ${cover
                        ? `<img src="${cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${category}">`
                        : `<div class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600"><i class="fas fa-layer-group text-5xl"></i></div>`
                    }
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent"></div>
                    <span class="absolute top-3 right-3 text-xs font-bold bg-white/90 dark:bg-slate-900/90 text-gray-700 dark:text-gray-200 rounded-full px-2 py-1">${assets.length}</span>
                </div>
                <div class="p-4">
                    <h3 class="font-bold text-gray-900 dark:text-white truncate mb-2">${category}</h3>
                    <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span><i class="fas fa-boxes-stacked text-brand-500 mr-1"></i>${assets.length} activos</span>
                        ${taskIds.size > 0 ? `<span><i class="fas fa-tasks text-amber-500 mr-1"></i>${taskIds.size}</span>` : ''}
                        ${docsCount > 0 ? `<span><i class="fas fa-paperclip mr-1"></i>${docsCount}</span>` : ''}
                        ${outOfService > 0 ? `<span class="text-red-500"><i class="fas fa-power-off mr-1"></i>${outOfService}</span>` : ''}
                    </div>
                </div>
            </button>
        `;
    },

    openCategory: (category) => {
        const assets = AssetsComponent.assets.filter(asset => (asset.category || 'Sin categoria') === category);
        const modalId = 'asset-category-detail-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="text-2xl font-bold dark:text-white">${category}</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${assets.length} activos</p>
                    </div>
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${assets.map(asset => AssetsComponent.renderAssetCard(asset)).join('')}
                </div>
            </div>
        `;
    },

    renderAssetCard: (asset) => {
        const assetTasks = AssetsComponent.getTasksForAsset(asset.id);
        const pending = assetTasks.filter(t => t.estado === 'Pendiente' || t.estado === 'En Proceso').length;
        const done = assetTasks.filter(t => t.estado === 'Realizado').length;
        const docsCount = (asset.documents || []).length;
        const isOutOfService = (asset.serviceStatus || 'En servicio') === 'Fuera de servicio';

        return `
            <div class="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group border border-transparent hover:border-brand-200 dark:hover:border-brand-900 cursor-pointer" onclick="AssetsComponent.openDetail('${asset.id}'); document.getElementById('asset-category-detail-modal')?.remove();">
                <div class="h-40 bg-gray-100 dark:bg-slate-700 relative overflow-hidden">
                    ${asset.image
                        ? `<img src="${asset.image}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${asset.name}">`
                        : `<div class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600"><i class="fas fa-image text-5xl"></i></div>`
                    }
                    ${AssetsComponent.isEditable ? `<div class="absolute top-2 right-2 flex gap-1" onclick="event.stopPropagation()">
                        <button onclick="AssetsComponent.openAssetModal('${asset.id}')" class="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 text-gray-600 dark:text-gray-300 hover:bg-white flex items-center justify-center text-xs shadow-sm backdrop-blur-sm" title="Editar">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button onclick="AssetsComponent.deleteAsset('${asset.id}')" class="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 text-red-500 hover:bg-red-50 flex items-center justify-center text-xs shadow-sm backdrop-blur-sm" title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>` : ''}
                </div>
                <div class="p-4">
                    <div class="flex items-start justify-between gap-2 mb-1">
                    <h3 class="font-bold text-gray-900 dark:text-white truncate mb-1">${asset.name}</h3>
                        <span class="text-[10px] font-bold rounded-full px-2 py-1 whitespace-nowrap ${isOutOfService ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}">
                            ${asset.serviceStatus || 'En servicio'}
                        </span>
                    </div>
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
    },

    manageCategories: () => {
        if (!AssetsComponent.isEditable) return UI.showToast('Este enlace es de solo lectura', 'warning');

        AssetsComponent.categoryDraft = [...(AssetsComponent.assetCategories || [])];
        const modalId = 'asset-categories-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Agrupadores de Activos</h3>
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>
                <div id="asset-categories-list" class="space-y-2 max-h-[55vh] overflow-y-auto mb-4"></div>
                <div class="flex gap-2">
                    <input id="new-asset-category" class="input-primary flex-1 text-sm" placeholder="Nuevo agrupador">
                    <button onclick="AssetsComponent.addCategoryDraft()" class="btn-secondary px-4"><i class="fas fa-plus"></i></button>
                </div>
                <div class="flex justify-end gap-2 mt-6">
                    <button onclick="document.getElementById('${modalId}').remove()" class="btn-secondary">Cancelar</button>
                    <button onclick="AssetsComponent.saveCategories()" class="btn-primary">Guardar</button>
                </div>
            </div>
        `;

        AssetsComponent.renderCategoryDraft();
    },

    renderCategoryDraft: () => {
        const container = document.getElementById('asset-categories-list');
        if (!container) return;

        container.innerHTML = AssetsComponent.categoryDraft.map((category, index) => `
            <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-700/40 rounded-lg">
                <div class="flex flex-col gap-1">
                    <button onclick="AssetsComponent.moveCategoryDraft(${index}, -1)" class="text-gray-400 hover:text-brand-500 ${index === 0 ? 'invisible' : ''}"><i class="fas fa-chevron-up text-xs"></i></button>
                    <button onclick="AssetsComponent.moveCategoryDraft(${index}, 1)" class="text-gray-400 hover:text-brand-500 ${index === AssetsComponent.categoryDraft.length - 1 ? 'invisible' : ''}"><i class="fas fa-chevron-down text-xs"></i></button>
                </div>
                <input id="asset-category-draft-${index}" value="${category}" class="input-primary text-sm flex-1">
                <button onclick="AssetsComponent.removeCategoryDraft(${index})" class="w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        `).join('');
    },

    addCategoryDraft: () => {
        const input = document.getElementById('new-asset-category');
        const name = input.value.trim();
        if (!name) return;
        if (AssetsComponent.categoryDraft.includes(name)) return UI.showToast('Ese agrupador ya existe', 'warning');
        AssetsComponent.categoryDraft.push(name);
        input.value = '';
        AssetsComponent.renderCategoryDraft();
    },

    removeCategoryDraft: (index) => {
        AssetsComponent.categoryDraft.splice(index, 1);
        AssetsComponent.renderCategoryDraft();
    },

    moveCategoryDraft: (index, direction) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= AssetsComponent.categoryDraft.length) return;
        [AssetsComponent.categoryDraft[index], AssetsComponent.categoryDraft[nextIndex]] = [AssetsComponent.categoryDraft[nextIndex], AssetsComponent.categoryDraft[index]];
        AssetsComponent.renderCategoryDraft();
    },

    saveCategories: async () => {
        const oldCategories = [...(AssetsComponent.assetCategories || [])];
        const inputs = Array.from(document.querySelectorAll('[id^="asset-category-draft-"]'));
        const nextCategories = [...new Set(inputs.map(input => input.value.trim()).filter(Boolean))];

        try {
            await Store.updateAssetCategories(AssetsComponent.projectId, nextCategories);

            const updates = AssetsComponent.assets.map(asset => {
                const current = asset.category || 'Sin categoria';
                const oldIndex = oldCategories.indexOf(current);
                let nextCategory = current;

                if (nextCategories.includes(current)) {
                    nextCategory = current;
                } else if (oldIndex !== -1) {
                    nextCategory = nextCategories[oldIndex] || 'Sin categoria';
                } else {
                    nextCategory = 'Sin categoria';
                }

                return nextCategory !== current
                    ? Store.updateAsset(AssetsComponent.projectId, asset.id, { category: nextCategory })
                    : Promise.resolve();
            });

            await Promise.all(updates);
            document.getElementById('asset-categories-modal')?.remove();
            UI.showToast('Agrupadores actualizados', 'success');
            await AssetsComponent.refreshUI();
        } catch (error) {
            console.error(error);
            UI.showToast('Error al guardar agrupadores', 'error');
        }
    },

    // --- Asset CRUD Modal ---

    openAssetModal: (assetId = null) => {
        if (!AssetsComponent.isEditable) {
            UI.showToast('Este enlace es de solo lectura', 'warning');
            return;
        }

        AssetsComponent.editingAssetId = assetId;
        AssetsComponent.currentAssetAttachments = [];
        AssetsComponent.pendingDeletedFiles = [];

        const modal = document.getElementById('asset-modal');
        const title = document.getElementById('asset-modal-title');
        const form = document.getElementById('asset-form');
        const categorySelect = document.getElementById('asset-category');

        form.reset();
        if (categorySelect) {
            categorySelect.innerHTML = (AssetsComponent.assetCategories || []).map(category => `<option value="${category}">${category}</option>`).join('') +
                '<option value="Sin categoria">Sin categoria</option>';
        }
        document.getElementById('asset-image-preview').innerHTML = '';
        document.getElementById('asset-image-preview').dataset.url = '';
        document.getElementById('asset-image-preview').dataset.removed = '';

        if (assetId) {
            const asset = AssetsComponent.assets.find(a => a.id === assetId);
            if (!asset) return;
            title.textContent = 'Editar Activo';
            document.getElementById('asset-name').value = asset.name || '';
            document.getElementById('asset-description').value = asset.description || '';
            document.getElementById('asset-category').value = asset.category || 'Sin categoria';
            document.getElementById('asset-service-status').value = asset.serviceStatus || 'En servicio';
            if (asset.image) {
                document.getElementById('asset-image-preview').innerHTML = AssetsComponent.renderImagePreview(asset.image);
                document.getElementById('asset-image-preview').dataset.url = asset.image;
            }
            AssetsComponent.currentAssetAttachments = asset.documents ? JSON.parse(JSON.stringify(asset.documents)) : [];
        } else {
            title.textContent = 'Nuevo Activo';
            document.getElementById('asset-category').value = AssetsComponent.assetCategories[0] || 'Sin categoria';
            document.getElementById('asset-service-status').value = 'En servicio';
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

                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Agrupador</label>
                            <select id="asset-category" class="input-primary mt-1">
                                ${(AssetsComponent.assetCategories || []).map(category => `<option value="${category}">${category}</option>`).join('')}
                                <option value="Sin categoria">Sin categoria</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Estado operativo</label>
                            <select id="asset-service-status" class="input-primary mt-1">
                                <option>En servicio</option>
                                <option>Fuera de servicio</option>
                            </select>
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
            const url = await Store.uploadFile(file, AssetsComponent.getUploadContext());
            const preview = document.getElementById('asset-image-preview');
            preview.innerHTML = AssetsComponent.renderImagePreview(url);
            preview.dataset.url = url;
            preview.dataset.removed = '';
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
                const url = await Store.uploadFile(file, AssetsComponent.getUploadContext());
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

    getUploadContext: () => ({
        allowAnonymous: AssetsComponent.isShared,
        fallbackToBase64: AssetsComponent.isShared,
        forceBase64: AssetsComponent.isShared,
        folder: `uploads/assets/${AssetsComponent.projectId}`
    }),

    renderImagePreview: (url) => `
        <div class="relative group">
            <img src="${url}" class="w-full h-32 object-cover rounded-lg">
            <button type="button" onclick="AssetsComponent.removeAssetImage()" class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full shadow flex items-center justify-center opacity-90 hover:opacity-100" title="Quitar imagen">
                <i class="fas fa-trash-alt text-xs"></i>
            </button>
        </div>
    `,

    removeAssetImage: async () => {
        const preview = document.getElementById('asset-image-preview');
        if (!preview) return;

        const oldUrl = preview.dataset.url;
        if (oldUrl) AssetsComponent.pendingDeletedFiles.push(oldUrl);

        preview.innerHTML = '';
        preview.dataset.url = '';
        preview.dataset.removed = 'true';
    },

    removeAssetDoc: (index) => {
        const removed = AssetsComponent.currentAssetAttachments[index];
        if (removed) AssetsComponent.pendingDeletedFiles.push(removed.data);
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
        const category = document.getElementById('asset-category').value || 'Sin categoria';
        const serviceStatus = document.getElementById('asset-service-status').value || 'En servicio';
        const imgPreview = document.getElementById('asset-image-preview');
        let image = imgPreview.dataset.url || '';
        const imageWasRemoved = imgPreview.dataset.removed === 'true';

        // If editing and image wasn't changed, keep existing
        if (AssetsComponent.editingAssetId && !image && !imageWasRemoved) {
            const existing = AssetsComponent.assets.find(a => a.id === AssetsComponent.editingAssetId);
            if (existing) image = existing.image || '';
        }

        const assetData = {
            name,
            description,
            category,
            serviceStatus,
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
            await Promise.all(AssetsComponent.pendingDeletedFiles.map(url => Store.deleteUploadedFile(url)));
            AssetsComponent.pendingDeletedFiles = [];
            AssetsComponent.refreshUI();
        } catch (err) {
            console.error(err);
            UI.showToast('Error al guardar activo', 'error');
        }
    },

    deleteAsset: async (assetId) => {
        if (!AssetsComponent.isEditable) return UI.showToast('Este enlace es de solo lectura', 'warning');
        if (!await UI.confirm('¿Eliminar este activo? Las tareas vinculadas no se eliminarán.')) return;
        try {
            const asset = AssetsComponent.assets.find(a => a.id === assetId);
            if (asset) await AssetsComponent.deleteAssetFiles(asset);
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
        const isOutOfService = (asset.serviceStatus || 'En servicio') === 'Fuera de servicio';

        modal.querySelector('#asset-detail-content').innerHTML = `
            <!-- Image -->
            ${asset.image ? `
                <div class="rounded-xl overflow-hidden mb-6 max-h-64 relative group">
                    <img src="${asset.image}" class="w-full h-full object-cover" alt="${asset.name}">
                    ${AssetsComponent.isEditable ? `
                    <button onclick="AssetsComponent.deleteAssetImage('${assetId}')" class="absolute top-3 right-3 bg-red-500 text-white w-9 h-9 rounded-full shadow flex items-center justify-center opacity-90 hover:opacity-100" title="Eliminar imagen">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                    ` : ''}
                </div>
            ` : ''}

            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-2xl font-bold dark:text-white">${asset.name}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <p class="text-xs text-brand-500 dark:text-brand-400 font-bold uppercase tracking-wide">${asset.category || 'Sin categoria'}</p>
                        <span class="text-[10px] font-bold rounded-full px-2 py-1 ${isOutOfService ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}">
                            ${asset.serviceStatus || 'En servicio'}
                        </span>
                    </div>
                    ${asset.description ? `<p class="text-gray-500 dark:text-gray-400 mt-1">${asset.description}</p>` : ''}
                </div>
                ${AssetsComponent.isEditable ? `<div class="flex gap-2">
                    <button onclick="AssetsComponent.openAssetModal('${assetId}'); document.getElementById('asset-detail-modal').classList.add('hidden');" class="btn-secondary text-sm px-3"><i class="fas fa-pen"></i></button>
                </div>` : ''}
            </div>

            <!-- Documents -->
            ${docs.length > 0 ? `
                <div class="mb-6">
                    <h4 class="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><i class="fas fa-paperclip text-brand-500"></i> Documentos (${docs.length})</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        ${docs.map((doc, index) => {
                            const isImg = doc.type && doc.type.startsWith('image/');
                            const icon = isImg ? 'fas fa-image text-blue-500' : (doc.name.endsWith('.pdf') ? 'fas fa-file-pdf text-red-500' : 'fas fa-file text-gray-400');
                            return `
                                <div class="relative group/doc">
                                    <a href="${doc.data}" target="_blank" class="flex items-center gap-2 p-3 pr-8 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-100 dark:border-slate-600 group">
                                        <i class="${icon} text-lg"></i>
                                        <span class="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-brand-600">${doc.name}</span>
                                    </a>
                                    ${AssetsComponent.isEditable ? `
                                    <button onclick="event.preventDefault(); AssetsComponent.deleteAssetDocument('${assetId}', ${index})" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/doc:opacity-100 transition-opacity" title="Eliminar archivo">
                                        <i class="fas fa-times text-[10px]"></i>
                                    </button>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Tasks -->
            <div>
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"><i class="fas fa-tasks text-brand-500"></i> Tareas Vinculadas (${assetTasks.length})</h4>
                    ${AssetsComponent.isEditable ? `
                    <button onclick="AssetsComponent.createTaskForAsset('${assetId}')" class="text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-900/50 transition-colors font-medium">
                        <i class="fas fa-plus mr-1"></i> Nueva Tarea
                    </button>
                    ` : ''}
                </div>

                ${assetTasks.length === 0 ? `
                    <div class="text-center py-8 text-gray-400 text-sm italic">No hay tareas vinculadas a este activo.</div>
                ` : `
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        ${assetTasks.map(t => {
                            const statusColor = { 'Pendiente': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 'En Proceso': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'Realizado': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', 'Suspendido': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
                            const rowClass = AssetsComponent.isEditable
                                ? 'hover:bg-gray-100 dark:hover:bg-slate-700/60 cursor-pointer'
                                : 'cursor-default';
                            const rowClick = AssetsComponent.isEditable ? `onclick="AssetsComponent.openLinkedTask('${t.id}')"` : '';
                            return `
                                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg transition-colors ${rowClass}" ${rowClick}>
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

    openLinkedTask: (taskId) => {
        if (!AssetsComponent.isEditable) return;

        document.getElementById('asset-detail-modal')?.classList.add('hidden');
        sessionStorage.setItem('nexus_focus_taskId', taskId);
        const route = AssetsComponent.isShared
            ? `#/share/${AssetsComponent.projectId}${AssetsComponent.shareParams}`
            : `#/project/${AssetsComponent.projectId}`;
        App.navigateTo(route);
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
        if (!AssetsComponent.isEditable) return UI.showToast('Este enlace es de solo lectura', 'warning');
        // Close detail modal, navigate to project, and open task modal with asset pre-selected
        document.getElementById('asset-detail-modal').classList.add('hidden');
        // Store the assetId to pre-select after navigation
        sessionStorage.setItem('nexus_prefill_assetId', assetId);
        const route = AssetsComponent.isShared
            ? `#/share/${AssetsComponent.projectId}${AssetsComponent.shareParams}`
            : `#/project/${AssetsComponent.projectId}`;
        App.navigateTo(route);
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
    },

    deleteAssetImage: async (assetId) => {
        if (!AssetsComponent.isEditable) return UI.showToast('Este enlace es de solo lectura', 'warning');
        const asset = AssetsComponent.assets.find(a => a.id === assetId);
        if (!asset || !asset.image) return;
        if (!await UI.confirm('Eliminar la imagen principal de este activo?')) return;

        await Store.deleteUploadedFile(asset.image);
        await Store.updateAsset(AssetsComponent.projectId, assetId, { image: '' });
        UI.showToast('Imagen eliminada', 'success');
        await AssetsComponent.refreshUI();
        document.getElementById('asset-detail-modal')?.classList.add('hidden');
    },

    deleteAssetDocument: async (assetId, index) => {
        if (!AssetsComponent.isEditable) return UI.showToast('Este enlace es de solo lectura', 'warning');
        const asset = AssetsComponent.assets.find(a => a.id === assetId);
        if (!asset || !asset.documents || !asset.documents[index]) return;
        if (!await UI.confirm('Eliminar este archivo del activo?')) return;

        const nextDocs = [...asset.documents];
        const [removed] = nextDocs.splice(index, 1);
        await Store.deleteUploadedFile(removed.data);
        await Store.updateAsset(AssetsComponent.projectId, assetId, { documents: nextDocs });
        UI.showToast('Archivo eliminado', 'success');
        await AssetsComponent.refreshUI();
        if (AssetsComponent.assets.find(a => a.id === assetId)) AssetsComponent.openDetail(assetId);
    },

    deleteAssetFiles: async (asset) => {
        if (asset.image) await Store.deleteUploadedFile(asset.image);
        const docs = asset.documents || [];
        await Promise.all(docs.map(doc => Store.deleteUploadedFile(doc.data)));
    }
};
