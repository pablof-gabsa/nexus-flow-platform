const ProjectComponent = {
    projectId: null,
    data: [], // Tasks
    rubros: [],
    responsables: [],

    // Filters State
    filters: {
        status: 'Todos',
        priority: 'Todos',
        date: 'Todas',
        responsible: 'Todos'
    },
    sortBy: 'deadline', // 'deadline', 'priority', 'name', 'manual'
    sortOrder: 'asc',
    openRubros: new Set(),
    openTasks: new Set(),
    sortable: null,
    editingSubtasks: [],
    isShared: false,
    isEditable: true,

    // Constants
    statusColors: {
        'Pendiente': '#FBBF24',
        'Realizado': '#2563EB',
        'En Proceso': '#60A5FA',
        'Suspendido': '#9CA3AF'
    },

    // Attachments State
    currentAttachments: [],

    // Export State
    isSelectionMode: false,
    selectedTasks: new Set(),


    render: async (container, projectId, options = {}) => {
        ProjectComponent.projectId = projectId;
        ProjectComponent.isShared = !!options.isShared;
        ProjectComponent.isEditable = options.isEditable !== false;

        // Fetch Project Data
        // If Shared, we bypass the secure Store.getProject and go straight to public data
        let projectInfo;
        if (ProjectComponent.isShared) {
            const data = await Store.getProjectData(projectId);
            // Create dummy project info from public data
            projectInfo = { id: projectId, name: data.name || 'Proyecto Compartido', ...data };
        } else {
            projectInfo = await Store.getProject(projectId);
        }

        if (!projectInfo) {
            container.innerHTML = `<div class="p-10 text-center dark:text-gray-300">Proyecto no encontrado o acceso denegado.</div>`;
            return;
        }

        // Setup Realtime Listeners (Simulated with fetch for now, can be upgraded to on() later)
        // For MVP structure we will just fetch once, logic supports reload.
        await ProjectComponent.refreshData();
        await IntegrationsComponent.load();

        container.innerHTML = `
            ${!ProjectComponent.isShared ? NavbarComponent.render() : ''}
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
                
                <!-- Toolbar -->
                <div class="glass-panel p-4 rounded-xl mb-6 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 md:top-20 z-30 transition-all duration-300 shadow-sm backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-white/20">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            ${!ProjectComponent.isShared ?
                `<span onclick="App.navigateTo('#/dashboard')" class="cursor-pointer hover:text-brand-600"><i class="fas fa-arrow-left"></i></span>` :
                `<span class="bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 text-xs px-2 py-1 rounded uppercase tracking-wider">Compartido</span>`
            }
                            <div class="group flex items-center gap-2">
                                <span id="project-name-display" class="${ProjectComponent.isEditable ? 'cursor-text hover:bg-gray-50 dark:hover:bg-slate-800 px-2 rounded border border-transparent hover:border-gray-200 dark:hover:border-slate-700 transition-all' : ''}" 
                                      ${ProjectComponent.isEditable ? 'onclick="ProjectComponent.editProjectName()"' : ''}>
                                    ${projectInfo.name}
                                </span>
                                ${ProjectComponent.isEditable ? '<i class="fas fa-pen text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"></i>' : ''}
                            </div>
                        </h2>
                    </div>
                    
                    <div class="flex flex-wrap gap-2 pointer-events-${ProjectComponent.isEditable ? 'auto' : 'none'} ${ProjectComponent.isEditable ? '' : 'opacity-50'}">

                        ${ProjectComponent.isEditable ? `
                        <div class="flex items-center shadow-lg shadow-brand-500/30 rounded-lg">
                            <button onclick="ProjectComponent.openTaskModal()" class="btn-primary text-sm px-4 rounded-r-none border-r border-brand-400/30">
                                <i class="fas fa-plus"></i> <span class="hidden sm:inline">Nueva Tarea</span>
                            </button>
                            ${IntegrationsComponent.isEnabled('octavo_piso') ? `
                            <button onclick="ProjectComponent.toggleSelectionMode()" class="btn-primary text-sm px-4 border-l border-brand-400/30 bg-indigo-600 hover:bg-indigo-700" title="Exportar a Octavo Piso">
                                <i class="fas fa-file-export"></i> Exp. Octavo
                            </button>
                            ` : ''}
                            <div class="relative group h-full">
                                <button class="btn-primary text-sm px-2 rounded-l-none rounded-r-lg h-full">
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </button>
                                <div class="absolute right-0 top-full pt-2 w-48 z-50 hidden group-hover:block text-left">
                                    <div class="glass-card p-1 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                                        <button onclick="ProjectComponent.importFromExcel()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2">
                                            <i class="fas fa-file-excel text-emerald-600"></i> Importar Excel
                                        </button>
                                        <button onclick="ProjectComponent.downloadExampleTemplate()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2">
                                            <i class="fas fa-download text-gray-500"></i> Bajar Plantilla
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${!ProjectComponent.isShared ? `
                        <button onclick="ProjectComponent.shareProject()" class="btn-secondary text-sm px-4">
                            <i class="fas fa-share-alt"></i> <span class="hidden sm:inline">Compartir</span>
                        </button>
                        ` : ''}


                        <div class="relative group">
                            <button class="btn-secondary text-sm px-4">
                                <i class="fas fa-cog"></i> <span class="hidden sm:inline">Configuración</span>
                            </button>
                            <!-- Dropdown Wrapper -->
                            <div class="absolute right-0 top-full pt-2 w-64 z-50 hidden group-hover:block">
                                <div class="glass-card p-1 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 max-h-[80vh] overflow-y-auto">
                                    
                                    <!-- Theme -->
                                    <button onclick="ProjectComponent.toggleTheme()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex justify-between items-center group/item">
                                        <span><i class="fas fa-palette mr-2 text-purple-500 w-5 text-center"></i> Tema</span>
                                        <i class="fas fa-moon dark:hidden text-gray-400 group-hover/item:text-gray-600"></i>
                                        <i class="fas fa-sun hidden dark:inline text-yellow-500"></i>
                                    </button>

                                    <div class="my-1 border-t border-gray-100 dark:border-slate-700"></div>

                                    <!-- View Options -->
                                    <button onclick="ProjectComponent.openFilterModal()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex justify-between items-center">
                                        <span><i class="fas fa-filter mr-2 text-brand-500 w-5 text-center"></i> Filtros</span>
                                        ${(ProjectComponent.filters.status !== 'Todos' || ProjectComponent.filters.priority !== 'Todos' || ProjectComponent.filters.date !== 'Todas' || ProjectComponent.filters.responsible !== 'Todos') ? '<span class="w-2 h-2 bg-brand-500 rounded-full"></span>' : ''}
                                    </button>

                                    <!-- Sort Sub-menu -->
                                    <div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Ordenar por</div>
                                    
                                    <button onclick="ProjectComponent.setSort('deadline')" class="w-full text-left px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex justify-between items-center">
                                        <span class="pl-9">Fecha</span> 
                                        ${ProjectComponent.sortBy === 'deadline' ? '<i class="fas fa-check text-brand-500 text-xs"></i>' : ''}
                                    </button>
                                    <button onclick="ProjectComponent.setSort('priority')" class="w-full text-left px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex justify-between items-center">
                                        <span class="pl-9">Prioridad</span> 
                                        ${ProjectComponent.sortBy === 'priority' ? '<i class="fas fa-check text-brand-500 text-xs"></i>' : ''}
                                    </button>
                                    <button onclick="ProjectComponent.setSort('name')" class="w-full text-left px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex justify-between items-center">
                                        <span class="pl-9">Nombre</span>
                                        ${ProjectComponent.sortBy === 'name' ? '<i class="fas fa-check text-brand-500 text-xs"></i>' : ''}
                                    </button>
                                     <button onclick="ProjectComponent.setSortOrder()" class="w-full text-left px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex items-center">
                                        <span class="pl-9 flex items-center gap-2"><i class="fas fa-sort text-xs"></i> Invertir Orden</span>
                                    </button>

                                    <div class="my-1 border-t border-gray-100 dark:border-slate-700"></div>

                                    <!-- Management -->
                                    <button onclick="ProjectComponent.manageRubros()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                                        <i class="fas fa-folder mr-2 text-blue-500 w-5 text-center"></i> Areas
                                    </button>
                                    <button onclick="ProjectComponent.manageResponsables()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                                        <i class="fas fa-users mr-2 text-green-500 w-5 text-center"></i> Responsables
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button onclick="ProjectComponent.exportPDF()" class="btn-secondary text-sm px-4 pointer-events-auto">
                            <i class="fas fa-file-pdf"></i> <span class="hidden sm:inline">PDF</span>
                        </button>
                    </div>
                </div>

                <!-- Metrics & Charts -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div class="glass-card p-6 rounded-xl lg:col-span-2">
                        <h3 class="font-bold text-gray-700 dark:text-white mb-4">Progreso Global</h3>
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4">
                                <div id="project-progress-bar" class="bg-brand-600 h-4 rounded-full transition-all duration-500" style="width: 0%"></div>
                            </div>
                            <span id="project-progress-text" class="font-bold text-brand-600">0%</span>
                        </div>
                        <div class="h-48 relative">
                            <canvas id="statusChart"></canvas>
                        </div>
                    </div>
                    <div class="glass-card p-6 rounded-xl">
                        <h3 class="font-bold text-gray-700 dark:text-white mb-4">Resumen</h3>
                        <div id="project-stats" class="space-y-4">
                            <!-- Stats injected via JS -->
                        </div>
                    </div>
                </div>

                <!-- Checklist Container -->
                <div id="checklist-container" class="space-y-4"></div>

                <!-- Export Bar -->
                <!-- Export Bar Container -->
                <div id="project-export-bar"></div>
            </div>
            </div>

            <!-- Task Modal (Hidden) -->
            <div id="task-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4">
                <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-scale-up">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-3">
                            <h3 id="modal-title" class="text-2xl font-bold dark:text-white">Nueva Tarea</h3>
                            <button type="button" onclick="ProjectComponent.openTaskTemplates()" class="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded hover:bg-brand-200 transition-colors" title="Usar Plantilla">
                                <i class="fas fa-magic"></i> Plantillas
                            </button>
                        </div>
                        <button onclick="document.getElementById('task-modal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                    </div>
                    <form id="task-form" onsubmit="ProjectComponent.handleTaskSubmit(event)" class="space-y-4">
                        <input type="hidden" name="id" id="task-id">
                        
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Título</label>
                            <input type="text" name="requerimiento" id="task-req" required class="input-primary mt-1" placeholder="Resumen de la tarea">
                        </div>
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300">Descripción</label>
                            <textarea name="description" id="task-desc" rows="3" class="input-primary mt-1" placeholder="Detalles adicionales..."></textarea>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Area</label>
                                <div class="flex gap-2">
                                    <select name="rubro" id="task-rubro" class="input-primary mt-1 flex-1"></select>
                                    <button type="button" onclick="ProjectComponent.manageRubros()" class="mt-1 px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors" title="Editar Areas">
                                        <i class="fas fa-cog"></i>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Responsable</label>
                                <div class="flex gap-2">
                                    <select name="responsable" id="task-resp" class="input-primary mt-1 flex-1"></select>
                                    <button type="button" onclick="ProjectComponent.manageResponsables()" class="mt-1 px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors" title="Editar Responsables">
                                        <i class="fas fa-cog"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Prioridad</label>
                                <select name="prioridad" id="task-prio" class="input-primary mt-1">
                                    <option>Baja</option> <option>Media</option> <option>Alta</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Vencimiento</label>
                                <input type="date" name="deadline" id="task-date" class="input-primary mt-1">
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Costo Est.</label>
                                <input type="number" name="costo" id="task-cost" step="0.01" class="input-primary mt-1">
                             </div>
                             <div>
                                <label class="block text-sm font-medium dark:text-gray-300">H/H Est.</label>
                                <input type="number" name="hh_estimated" id="task-hh-est" step="0.5" class="input-primary mt-1">
                             </div>
                             <div>
                                <label class="block text-sm font-medium dark:text-gray-300">H/H Eje.</label>
                                <input type="number" name="hh_executed" id="task-hh-exe" step="0.5" class="input-primary mt-1">
                             </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label class="block text-sm font-medium dark:text-gray-300">Repetición</label>
                                <select name="recurrence" id="task-recurrence" class="input-primary mt-1" onchange="ProjectComponent.toggleRecurrenceOptions(this.value)">
                                    <option value="none">No repetir</option>
                                    <option value="daily">Diariamente</option>
                                    <option value="weekly">Semanalmente</option>
                                    <option value="monthly">Mensualmente</option>
                                    <option value="yearly">Anualmente</option>
                                    <option value="periodic">Periódicamente</option>
                                </select>
                             </div>
                        </div>

                        <!-- Dynamic Recurrence Options -->
                        <div id="recurrence-options" class="hidden border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/10 mb-4 transition-all">
                            
                            <!-- Weekly -->
                            <div id="rec-weekly" class="hidden">
                                <label class="block text-sm font-medium dark:text-gray-300 mb-2">Repetir los días:</label>
                                <div class="flex flex-wrap gap-2">
                                    ${['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d, i) => `
                                        <label class="flex items-center gap-1 cursor-pointer bg-white dark:bg-slate-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700">
                                            <input type="checkbox" name="rec_days" value="${i}" class="text-brand-600 focus:ring-brand-500 rounded-sm">
                                            <span class="text-xs font-bold text-gray-700 dark:text-gray-300">${d}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- Monthly -->
                            <div id="rec-monthly" class="hidden space-y-3">
                                <div>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="rec_monthly_type" value="fixed" checked onchange="ProjectComponent.toggleMonthlyOptions()" class="text-brand-600 focus:ring-brand-500">
                                        <span class="text-sm text-gray-700 dark:text-gray-300">Día fijo del mes</span>
                                    </label>
                                    <div id="rec-monthly-fixed" class="mt-2 ml-6">
                                        <input type="number" id="rec-month-day" min="1" max="31" class="input-primary w-24" placeholder="Ej: 15">
                                    </div>
                                </div>
                                <div>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="rec_monthly_type" value="relative" onchange="ProjectComponent.toggleMonthlyOptions()" class="text-brand-600 focus:ring-brand-500">
                                        <span class="text-sm text-gray-700 dark:text-gray-300">Posición relativa</span>
                                    </label>
                                    <div id="rec-monthly-relative" class="mt-2 ml-6 hidden flex gap-2">
                                        <select id="rec-relative-week" class="input-primary w-auto text-sm">
                                            <option value="1">1er</option>
                                            <option value="2">2do</option>
                                            <option value="3">3er</option>
                                            <option value="4">4to</option>
                                            <option value="5">Último</option>
                                        </select>
                                        <select id="rec-relative-day" class="input-primary w-auto text-sm">
                                            <option value="0">Lunes</option>
                                            <option value="1">Martes</option>
                                            <option value="2">Miércoles</option>
                                            <option value="3">Jueves</option>
                                            <option value="4">Viernes</option>
                                            <option value="5">Sábado</option>
                                            <option value="6">Domingo</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Periodic -->
                            <div id="rec-periodic" class="hidden">
                                <label class="block text-sm font-medium dark:text-gray-300 mb-2">Cada cuántos días:</label>
                                <div class="flex items-center gap-2">
                                    <input type="number" id="rec-periodic-days" min="1" class="input-primary w-24" placeholder="Ej: 10">
                                    <span class="text-sm text-gray-500 dark:text-gray-400">días</span>
                                </div>
                            </div>
                        </div>

                        <!-- Subtasks Section -->
                        <div class="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50/50 dark:bg-slate-700/20">
                            <label class="block text-sm font-medium dark:text-gray-300 mb-2">Checklist (Subtareas)</label>
                            <div class="flex gap-2 mb-2">
                                <input type="text" id="new-subtask-input" placeholder="Agregar ítem..." class="input-primary text-sm">
                                <button type="button" onclick="ProjectComponent.addSubtask()" class="btn-secondary px-3"><i class="fas fa-plus"></i></button>
                            </div>
                            <div id="subtasks-edit-list" class="space-y-2 max-h-40 overflow-y-auto"></div>
                        </div>

                        <!-- Attachments Section -->
                        <div>
                             <label class="block text-sm font-medium dark:text-gray-300 mb-2">Adjuntos (Imágenes max 10MB)</label>
                             <div class="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 text-center hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors relative">
                                <input type="file" id="task-attachments" multiple accept="image/*" onchange="ProjectComponent.handleFileSelect(event)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                                <i class="fas fa-cloud-upload-alt text-2xl text-gray-400 mb-2"></i>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Arrastra imágenes o haz clic para subir</p>
                             </div>
                             <div id="attachments-preview" class="flex flex-wrap gap-2 mt-2"></div>
                        </div>

                        <div class="flex justify-end pt-4">
                            <button type="button" onclick="ProjectComponent.saveAsTaskTemplate()" class="btn-secondary mr-2 text-xs">Guardar como Plantilla</button>
                            <button type="submit" class="btn-primary">Guardar Tarea</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        await ProjectComponent.refreshUI();
    },

    refreshData: async () => {
        const fullData = await Store.getProjectData(ProjectComponent.projectId);

        ProjectComponent.rubros = fullData.rubros || [];
        ProjectComponent.responsables = fullData.responsables || [];

        // Convert map to array
        ProjectComponent.data = fullData.tasks ? Object.keys(fullData.tasks).map(k => ({ id: k, ...fullData.tasks[k] })) : [];
    },

    refreshUI: async () => {
        await ProjectComponent.refreshData(); // Ensure fresh data
        ProjectComponent.renderChecklist();
        ProjectComponent.renderCharts();
        ProjectComponent.renderStats();
        ProjectComponent.renderModalOptions();
        ProjectComponent.renderExportBar();
    },

    renderExportBar: () => {
        const container = document.getElementById('project-export-bar');
        if (!container) return;

        if (!ProjectComponent.isSelectionMode) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white rounded-xl shadow-2xl p-4 z-50 flex items-center gap-6 animate-scale-up">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-lg">${ProjectComponent.selectedTasks.size}</span>
                    <span class="text-sm text-indigo-100">tareas seleccionadas</span>
                </div>
                <div class="h-8 w-px bg-indigo-500"></div>
                <div class="flex gap-2">
                    <button onclick="ProjectComponent.toggleSelectionMode()" class="px-4 py-2 text-sm hover:bg-indigo-700 rounded-lg transition-colors">Cancelar</button>
                    <button onclick="ProjectComponent.executeOctavoExport()" class="bg-white text-indigo-600 px-6 py-2 rounded-lg font-bold hover:bg-indigo-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" ${ProjectComponent.selectedTasks.size === 0 ? 'disabled' : ''}>
                        Exportar Excel
                    </button>
                </div>
            </div>
        `;
    },

    renderStats: () => {
        const tasks = ProjectComponent.getFilteredData();
        const done = tasks.filter(t => t.estado === 'Realizado').length;
        const total = tasks.length;
        const totalCost = tasks.reduce((sum, t) => sum + (t.costo || 0), 0);

        // Calculate Overdue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdue = tasks.filter(t => {
            if (!t.deadline || t.estado === 'Realizado' || t.estado === 'Suspendido') return false;
            const d = new Date(t.deadline);
            d.setHours(0, 0, 0, 0); // compare dates only
            // Fix: timezone offset issue often makes deadline look like previous day. 
            // Assuming deadline string "YYYY-MM-DD" is local.
            const [y, m, d_] = t.deadline.split('-').map(Number);
            const deadlineDate = new Date(y, m - 1, d_);
            return deadlineDate < today;
        }).length;

        const container = document.getElementById('project-stats');
        if (container) {
            container.innerHTML = `
                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    <span class="text-gray-600 dark:text-gray-300">Total Tareas</span>
                    <span class="font-bold text-gray-800 dark:text-white">${total}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span class="text-green-600 dark:text-green-400">Completadas</span>
                    <span class="font-bold text-green-700 dark:text-green-300">${done}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <span class="text-red-600 dark:text-red-400">Vencidas</span>
                    <span class="font-bold text-red-700 dark:text-red-300">${overdue}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span class="text-blue-600 dark:text-blue-400">Costo Estimado</span>
                    <span class="font-mono font-bold text-blue-700 dark:text-blue-300">${Utils.formatMoney(totalCost)}</span>
                </div>
            `;

            // HH Stats
            const totalEst = tasks.reduce((sum, t) => sum + (parseFloat(t.hh_estimated) || 0), 0);
            const totalExe = tasks.reduce((sum, t) => sum + (parseFloat(t.hh_executed) || 0), 0);

            container.innerHTML += `
               <div class="flex justify-between items-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg mt-2">
                    <span class="text-purple-600 dark:text-purple-400">H/H Est / Eje</span>
                    <span class="font-bold text-purple-700 dark:text-purple-300">
                        ${totalEst} / ${totalExe}
                    </span>
                </div>
            `;

            // Update progress bar
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            const bar = document.getElementById('project-progress-bar');
            const pText = document.getElementById('project-progress-text');
            if (bar) bar.style.width = `${percent}%`;
            if (pText) pText.textContent = `${percent}%`;
        }
    },

    renderModalOptions: () => {
        const rubroSelect = document.getElementById('task-rubro');
        const respSelect = document.getElementById('task-resp');
        if (rubroSelect) rubroSelect.innerHTML = ProjectComponent.rubros.map(r => `<option>${r}</option>`).join('');
        if (respSelect) respSelect.innerHTML = ProjectComponent.responsables.map(r => `<option>${r}</option>`).join('');
    },

    setFilter: (type, value) => {
        ProjectComponent.filters[type] = value;
        ProjectComponent.render(document.getElementById('main-content'), ProjectComponent.projectId, {
            isShared: ProjectComponent.isShared,
            isEditable: ProjectComponent.isEditable
        });

        // If modal is open, re-render it to update selection state
        const modal = document.getElementById('filter-modal');
        if (modal && !modal.classList.contains('hidden')) {
            ProjectComponent.openFilterModal();
        }
        if (modal && !modal.classList.contains('hidden')) {
            ProjectComponent.openFilterModal();
        }
    },

    setSort: (type) => {
        ProjectComponent.sortBy = type;
        ProjectComponent.refreshUI();
    },

    setSortOrder: () => {
        ProjectComponent.sortOrder = ProjectComponent.sortOrder === 'asc' ? 'desc' : 'asc';
        ProjectComponent.refreshUI();
    },

    getFilteredData: () => {
        return ProjectComponent.data.filter(t => {
            // Status
            if (ProjectComponent.filters.status !== 'Todos' && t.estado !== ProjectComponent.filters.status) return false;

            // Priority
            if (ProjectComponent.filters.priority !== 'Todos' && t.prioridad !== ProjectComponent.filters.priority) return false;

            // Responsible
            if (ProjectComponent.filters.responsible !== 'Todos' && t.responsable !== ProjectComponent.filters.responsible) return false;

            // Date / Due
            if (ProjectComponent.filters.date !== 'Todas') {
                if (!t.deadline) return false;
                const d = new Date(t.deadline);
                // fix strict date comparison by resetting time
                const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (ProjectComponent.filters.date === 'Vencidas') {
                    // Overdue and NOT done
                    if (t.estado === 'Realizado' || t.estado === 'Suspendido') return false;
                    return dDate < today;
                }
                if (ProjectComponent.filters.date === 'Vencen Hoy') return dDate.getTime() === today.getTime();

                if (ProjectComponent.filters.date === 'Vencen este mes') {
                    return dDate.getMonth() === today.getMonth() && dDate.getFullYear() === today.getFullYear();
                }

                if (ProjectComponent.filters.date === 'Próximas (7d)') {
                    const nextWeek = new Date(today);
                    nextWeek.setDate(today.getDate() + 7);
                    return dDate >= today && dDate <= nextWeek;
                }
            }

            return true;
        });
    },

    openFilterModal: () => {
        const modalId = 'filter-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        const f = ProjectComponent.filters;
        const pillClass = (active) => active ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-slate-600';

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Filtros</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div class="space-y-6">
                    <!-- Status -->
                    <div>
                        <h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Estado</h4>
                        <div class="flex flex-wrap gap-2">
                            ${['Todos', 'Pendiente', 'En Proceso', 'Realizado', 'Suspendido'].map(val =>
            `<button onclick="ProjectComponent.setFilter('status', '${val}')" class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${pillClass(f.status === val)}">${val}</button>`
        ).join('')}
                        </div>
                    </div>

                    <!-- Priority -->
                    <div>
                        <h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Prioridad</h4>
                        <div class="flex flex-wrap gap-2">
                            ${['Todos', 'Baja', 'Media', 'Alta'].map(val =>
            `<button onclick="ProjectComponent.setFilter('priority', '${val}')" class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${pillClass(f.priority === val)}">${val === 'Todos' ? 'Todas' : val}</button>`
        ).join('')}
                        </div>
                    </div>

                    <!-- Due Date -->
                    <div>
                        <h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Vencimiento</h4>
                        <div class="flex flex-wrap gap-2">
                             ${['Todas', 'Vencidas', 'Vencen Hoy', 'Vencen este mes', 'Próximas (7d)'].map(val =>
            `<button onclick="ProjectComponent.setFilter('date', '${val}')" class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${pillClass(f.date === val)}">${val}</button>`
        ).join('')}
                        </div>
                    </div>

                    <!-- Responsible -->
                    <div>
                        <h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Responsable</h4>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="ProjectComponent.setFilter('responsible', 'Todos')" class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${pillClass(f.responsible === 'Todos')}">Todos</button>
                             ${ProjectComponent.responsables.map(r =>
            `<button onclick="ProjectComponent.setFilter('responsible', '${r}')" class="px-4 py-2 rounded-full text-sm font-medium border transition-colors ${pillClass(f.responsible === r)}">${r}</button>`
        ).join('')}
                        </div>
                    </div>
                </div>

                <div class="flex justify-end mt-8">
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-primary px-6">Cerrar</button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    renderChecklist: () => {
        const container = document.getElementById('checklist-container');
        if (!container) return;

        const filtered = ProjectComponent.getFilteredData();
        const groups = filtered.reduce((acc, item) => {
            (acc[item.rubro] = acc[item.rubro] || []).push(item);
            return acc;
        }, {});

        container.innerHTML = ProjectComponent.rubros.map(rubro => {
            let items = groups[rubro] || [];

            // SORTING LOGIC:
            items.sort((a, b) => {
                let res = 0;

                if (ProjectComponent.sortBy === 'deadline') {
                    if (a.deadline && b.deadline) res = a.deadline.localeCompare(b.deadline);
                    else if (a.deadline && !b.deadline) res = -1;
                    else if (!a.deadline && b.deadline) res = 1;
                    else res = a.requerimiento.localeCompare(b.requerimiento);
                } else if (ProjectComponent.sortBy === 'priority') {
                    const map = { 'Alta': 3, 'Media': 2, 'Baja': 1, 'Normal': 0 };
                    const pA = map[a.prioridad] || 0;
                    const pB = map[b.prioridad] || 0;
                    res = pB - pA; // Descending by default for priority (High first)
                } else if (ProjectComponent.sortBy === 'name') {
                    res = a.requerimiento.localeCompare(b.requerimiento);
                }

                return ProjectComponent.sortOrder === 'asc' ? res : -res;
            });
            // if (rubro === 'Eliminado' && items.length === 0) return ''; // Always show all rubros
            // if (rubro === 'Eliminado' && items.length === 0) return ''; // Always show all rubros

            const isOpen = ProjectComponent.openRubros.has(rubro);
            const doneCount = items.filter(i => i.estado === 'Realizado').length;

            return `
                <div class="glass-card rounded-xl overflow-hidden mb-4">
                    <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                         onclick="ProjectComponent.toggleRubro('${rubro}')">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-folder text-brand-400"></i>
                            <h3 class="font-bold text-gray-800 dark:text-white">${rubro}</h3>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="text-sm font-medium text-gray-500">${doneCount} / ${items.length}</span>
                            <i class="fas fa-chevron-${isOpen ? 'up' : 'down'} text-gray-400"></i>
                        </div>
                    </div>
                    
                    <div class="${isOpen ? 'block' : 'hidden'} border-t border-gray-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                        ${items.length === 0 ? '<p class="p-4 text-center text-gray-400 text-sm">No hay tareas</p>' :
                    `<ul class="divide-y divide-gray-100 dark:divide-slate-700">
                                ${items.map(item => ProjectComponent.renderTaskItem(item)).join('')}
                           </ul>`
                }
                    </div>
                </div>
            `;
        }).join('');
    },

    renderTaskItem: (item) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let isOverdue = false;
        if (item.deadline && item.estado !== 'Realizado' && item.estado !== 'Suspendido') {
            const [y, m, d] = item.deadline.split('-').map(Number);
            const deadlineDate = new Date(y, m - 1, d);
            if (deadlineDate < today) isOverdue = true;
        }

        const statusClass = {
            'Pendiente': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-700',
            'En Proceso': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-700',
            'Realizado': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-700',
            'Suspendido': 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
        }[item.estado] || '';

        const overdueClass = isOverdue ? 'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10' : '';
        const overdueText = isOverdue ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-800 dark:text-gray-200';

        const subtasksTotal = item.subtasks ? item.subtasks.length : 0;
        const subtasksDone = item.subtasks ? item.subtasks.filter(s => s.done).length : 0;
        const recurrenceIcon = item.recurrence && item.recurrence.type !== 'none' ?
            `<i class="fas fa-sync-alt text-blue-500 ml-1" title="Se repite ${item.recurrence.type}"></i>` : '';

        return `
            <li class="p-4 hover:bg-white dark:hover:bg-slate-700/50 transition-colors group ${overdueClass}">
                <div class="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div class="flex-1 flex items-center gap-3">
                        ${ProjectComponent.isSelectionMode ? `
                            <input type="checkbox" 
                                class="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                ${ProjectComponent.selectedTasks.has(item.id) ? 'checked' : ''}
                                onchange="ProjectComponent.toggleTaskSelection('${item.id}', this.checked)">
                        ` : ''}
                        <div class="flex items-center gap-2">
                            <p class="font-medium ${overdueText}">${item.requerimiento}</p>
                            ${item.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl truncate">${item.description}</p>` : ''}
                            ${isOverdue ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300">VENCIDA</span>' : ''}
                            ${item.prioridad === 'Alta' ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800" title="Prioridad Alta">ALTA</span>' : ''}
                            ${item.prioridad === 'Media' ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800" title="Prioridad Media">Med</span>' : ''}
                            ${recurrenceIcon}
                        </div>
                         ${subtasksTotal > 0 ? `
                            <div class="mt-2 text-sm">
                                <div class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 p-1 rounded -ml-1" onclick="ProjectComponent.toggleTaskSubtasks('${item.id}')">
                                    <i class="fas fa-chevron-${ProjectComponent.openTasks.has(item.id) ? 'up' : 'down'} text-gray-400 text-xs transition-transform"></i>
                                    <div class="flex-1">
                                        <div class="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-1.5 overflow-hidden">
                                            <div class="bg-brand-500 h-1.5 rounded-full transition-all duration-300" style="width: ${(subtasksDone / subtasksTotal) * 100}%"></div>
                                        </div>
                                    </div>
                                    <span class="text-xs text-brand-600 dark:text-brand-400 font-medium">${subtasksDone}/${subtasksTotal}</span>
                                </div>
                                
                                <!-- Subtasks List -->
                                <div class="${ProjectComponent.openTasks.has(item.id) ? 'block' : 'hidden'} mt-2 pl-2 space-y-1 animate-slide-up">
                                    ${item.subtasks.map((st, idx) => `
                                        <label class="flex items-start gap-2 ${ProjectComponent.isEditable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30' : 'cursor-default'} group/st p-1 rounded">
                                            <input type="checkbox" ${st.done ? 'checked' : ''} ${!ProjectComponent.isEditable ? 'disabled' : ''}
                                                onchange="ProjectComponent.toggleSubtaskCheck('${item.id}', ${idx})"
                                                class="mt-0.5 rounded text-brand-600 focus:ring-brand-500 bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-gray-600 ${!ProjectComponent.isEditable ? 'opacity-50 cursor-not-allowed' : ''}">
                                            <span class="text-xs ${st.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'} ${ProjectComponent.isEditable ? 'group-hover/st:text-brand-600' : ''} transition-colors">
                                                ${st.text}
                                            </span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <div class="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 overflow-x-auto">
                            <span class="flex items-center gap-1"><i class="far fa-user"></i> ${item.responsable}</span>
                            ${item.deadline ? `<span class="flex items-center gap-1"><i class="far fa-calendar"></i> ${Utils.formatDate(item.deadline)}</span>` : ''}
                            ${item.costo > 0 ? `<span class="font-mono text-brand-600 dark:text-brand-400">${Utils.formatMoney(item.costo)}</span>` : ''}
                            ${(item.hh_estimated || item.hh_executed) ?
                `<span class="font-bold text-purple-600 dark:text-purple-400" title="H/H Estimadas / Ejecutadas">
                                    <i class="fas fa-clock text-xs"></i> ${item.hh_estimated || 0} / ${item.hh_executed || 0}
                                 </span>` : ''}
                             ${item.attachments && item.attachments.length > 0 ?
                `<div class="flex items-center gap-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 rounded px-1" title="Ver adjuntos" onclick="ProjectComponent.viewAttachments('${item.id}'); event.stopPropagation();">
                                    <i class="fas fa-paperclip text-brand-500"></i> <span class="text-xs font-bold text-gray-600 dark:text-gray-400">${item.attachments.length}</span>
                                </div>` : ''}
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                        ${ProjectComponent.isEditable ? `
                        <select onchange="ProjectComponent.updateStatus('${item.id}', this.value)" 
                                class="text-xs font-bold rounded-full px-3 py-1 border-0 cursor-pointer outline-none ring-0 ${statusClass}">
                            <option ${item.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option ${item.estado === 'En Proceso' ? 'selected' : ''}>En Proceso</option>
                            <option ${item.estado === 'Realizado' ? 'selected' : ''}>Realizado</option>
                            <option ${item.estado === 'Suspendido' ? 'selected' : ''}>Suspendido</option>
                        </select>
                        ` : `
                        <span class="text-xs font-bold rounded-full px-3 py-1 ${statusClass}">
                            ${item.estado}
                        </span>
                        `}
                        
                        ${ProjectComponent.isEditable ? `
                        <div class="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="ProjectComponent.openMoveModal('${item.id}')" class="p-2 text-purple-500 hover:bg-purple-50 rounded-full" title="Mover a otra Area"><i class="fas fa-folder-open"></i></button>
                            <button onclick="ProjectComponent.editTask('${item.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-full"><i class="fas fa-edit"></i></button>
                            <button onclick="ProjectComponent.deleteTask('${item.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-full"><i class="fas fa-trash"></i></button>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </li>
        `;
    },

    toggleRubro: (rubro) => {
        if (ProjectComponent.openRubros.has(rubro)) ProjectComponent.openRubros.delete(rubro);
        else ProjectComponent.openRubros.add(rubro);
        ProjectComponent.renderChecklist();
    },

    toggleTaskSubtasks: (taskId) => {
        if (ProjectComponent.openTasks.has(taskId)) ProjectComponent.openTasks.delete(taskId);
        else ProjectComponent.openTasks.add(taskId);
        ProjectComponent.renderChecklist();
    },

    toggleSubtaskCheck: async (taskId, index) => {
        const task = ProjectComponent.data.find(t => t.id === taskId);
        if (!task || !task.subtasks) return;

        // Optimistic update
        task.subtasks[index].done = !task.subtasks[index].done;
        ProjectComponent.renderChecklist();

        try {
            await Store.updateTask(ProjectComponent.projectId, taskId, { subtasks: task.subtasks });
            // If all done, maybe ask to complete? (Optional feature for later)
        } catch (e) {
            console.error(e);
            UI.showToast('Error al actualizar subtarea', 'error');
            // Revert on error
            task.subtasks[index].done = !task.subtasks[index].done;
            ProjectComponent.renderChecklist();
        }
    },

    // Subtasks State
    editingSubtasks: [],

    // Actions
    addSubtask: () => {
        const input = document.getElementById('new-subtask-input');
        const text = input.value.trim();
        if (text) {
            ProjectComponent.editingSubtasks.push({ text, done: false });
            input.value = '';
            ProjectComponent.renderSubtasksEdit();
        }
    },

    removeSubtask: (index) => {
        ProjectComponent.editingSubtasks.splice(index, 1);
        ProjectComponent.renderSubtasksEdit();
    },

    renderSubtasksEdit: () => {
        const container = document.getElementById('subtasks-edit-list');
        if (!container) return;
        container.innerHTML = ProjectComponent.editingSubtasks.map((st, i) => `
            <div class="flex items-center gap-2 bg-gray-50 dark:bg-slate-700/50 p-2 rounded group" data-id="${i}">
                 <i class="fas fa-grip-vertical text-gray-400 cursor-move hover:text-gray-600"></i>
                 <input type="text" value="${st.text}" onchange="ProjectComponent.updateSubtaskText(${i}, this.value)" class="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm text-gray-800 dark:text-gray-200">
                <button type="button" onclick="ProjectComponent.removeSubtask(${i})" class="text-red-500 hover:text-red-700">&times;</button>
            </div>
        `).join('');

        // Re-init Sortable if it exists
        if (ProjectComponent.sortable) ProjectComponent.sortable.destroy();

        ProjectComponent.sortable = new Sortable(container, {
            animation: 150,
            handle: '.fa-grip-vertical',
            onEnd: function (evt) {
                const itemEl = evt.item;  // dragged HTMLElement
                const newIndex = evt.newIndex; // New index within parent
                const oldIndex = evt.oldIndex; // Old index within parent

                const movedItem = ProjectComponent.editingSubtasks.splice(oldIndex, 1)[0];
                ProjectComponent.editingSubtasks.splice(newIndex, 0, movedItem);

                // Re-render to update indices in onclick handlers
                ProjectComponent.renderSubtasksEdit();
            },
        });
    },

    updateSubtaskText: (index, text) => {
        ProjectComponent.editingSubtasks[index].text = text;
    },

    // Attachments Logic
    handleFileSelect: async (event) => {
        const files = Array.from(event.target.files);
        if (ProjectComponent.currentAttachments.length + files.length > 3) {
            UI.showToast('Máximo 3 adjuntos por tarea', 'warning');
            return;
        }

        // 1. Upload Loop
        for (const file of files) {
            // 10MB Limit for Storage
            if (file.size > 10 * 1024 * 1024) {
                UI.showToast(`El archivo ${file.name} es muy pesado (Max 10MB)`, 'error');
                continue;
            }

            try {
                UI.showToast(`Subiendo ${file.name}...`, 'info');

                // Call Store to upload
                const url = await Store.uploadFile(file);

                ProjectComponent.currentAttachments.push({
                    name: file.name,
                    data: url, // Now it's a URL, not Base64
                    type: file.type
                });

                UI.showToast('Imagen subida correctamente', 'success');

            } catch (e) {
                console.error(e);
                UI.showToast(`Error subiendo ${file.name}`, 'error');
            }
        }

        ProjectComponent.renderAttachmentsPreview();
        // Reset input
        event.target.value = '';
    },

    removeAttachment: (index) => {
        ProjectComponent.currentAttachments.splice(index, 1);
        ProjectComponent.renderAttachmentsPreview();
    },

    renderAttachmentsPreview: () => {
        const container = document.getElementById('attachments-preview');
        if (!container) return;
        container.innerHTML = ProjectComponent.currentAttachments.map((att, i) => `
            <div class="relative group w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-slate-600">
                <img src="${att.data}" class="w-full h-full object-cover">
                <button type="button" onclick="ProjectComponent.removeAttachment(${i})" class="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `).join('');
    },

    // Recurrence UI
    toggleRecurrenceOptions: (val) => {
        const container = document.getElementById('recurrence-options');
        const weekly = document.getElementById('rec-weekly');
        const monthly = document.getElementById('rec-monthly');
        const periodic = document.getElementById('rec-periodic');

        if (!container) return;

        if (val === 'none' || val === 'daily' || val === 'yearly') {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
            if (weekly) weekly.classList.toggle('hidden', val !== 'weekly');
            if (monthly) monthly.classList.toggle('hidden', val !== 'monthly');
            if (periodic) periodic.classList.toggle('hidden', val !== 'periodic');
        }
    },

    toggleMonthlyOptions: () => {
        const type = document.querySelector('input[name="rec_monthly_type"]:checked').value;
        const fixed = document.getElementById('rec-monthly-fixed');
        const relative = document.getElementById('rec-monthly-relative');

        if (type === 'fixed') {
            fixed.classList.remove('hidden');
            relative.classList.add('hidden');
        } else {
            fixed.classList.add('hidden');
            relative.classList.remove('hidden');
        }
    },

    // Actions
    openTaskModal: (taskId = null) => {
        const modal = document.getElementById('task-modal');
        const title = document.getElementById('modal-title');

        ProjectComponent.editingSubtasks = [];
        ProjectComponent.currentAttachments = [];

        // Reset Form
        document.getElementById('task-form').reset();
        document.getElementById('task-id').value = '';

        if (taskId) {
            const task = ProjectComponent.data.find(t => t.id === taskId);
            if (!task) return;

            document.getElementById('task-id').value = task.id;
            title.textContent = 'Editar Tarea';

            document.getElementById('task-req').value = task.requerimiento;
            document.getElementById('task-desc').value = task.description || '';
            document.getElementById('task-rubro').value = task.rubro;
            document.getElementById('task-resp').value = task.responsable;
            document.getElementById('task-prio').value = task.prioridad;
            document.getElementById('task-date').value = task.deadline || '';
            document.getElementById('task-cost').value = task.costo || '';
            document.getElementById('task-hh-est').value = task.hh_estimated || '';
            document.getElementById('task-hh-exe').value = task.hh_executed || '';

            // Recurrence
            const recType = task.recurrence ? task.recurrence.type : 'none';
            document.getElementById('task-recurrence').value = recType;
            ProjectComponent.toggleRecurrenceOptions(recType);

            if (task.recurrence) {
                if (task.recurrence.type === 'weekly' && task.recurrence.days) {
                    task.recurrence.days.forEach(d => {
                        const cb = document.querySelector(`input[name="rec_days"][value="${d}"]`);
                        if (cb) cb.checked = true;
                    });
                }
                if (task.recurrence.type === 'monthly') {
                    const mType = task.recurrence.monthlyType || 'fixed';
                    const radio = document.querySelector(`input[name="rec_monthly_type"][value="${mType}"]`);
                    if (radio) { radio.checked = true; ProjectComponent.toggleMonthlyOptions(); }

                    if (mType === 'fixed' && task.recurrence.day) {
                        document.getElementById('rec-month-day').value = task.recurrence.day;
                    } else {
                        if (task.recurrence.week) document.getElementById('rec-relative-week').value = task.recurrence.week;
                        if (task.recurrence.dayOfWeek !== undefined) document.getElementById('rec-relative-day').value = task.recurrence.dayOfWeek;
                    }
                }
                if (task.recurrence.type === 'periodic' && task.recurrence.interval) {
                    document.getElementById('rec-periodic-days').value = task.recurrence.interval;
                }
            }

            // Subtasks
            if (task.subtasks) ProjectComponent.editingSubtasks = [...task.subtasks];

            // Attachments
            if (task.attachments) ProjectComponent.currentAttachments = [...task.attachments];

        } else {
            title.textContent = 'Nueva Tarea';
            document.getElementById('task-rubro').value = ProjectComponent.rubros[0] || '';
            document.getElementById('task-resp').value = ProjectComponent.responsables[0] || '';
            ProjectComponent.toggleRecurrenceOptions('none');
        }

        ProjectComponent.renderSubtasksEdit();
        ProjectComponent.renderAttachmentsPreview();
        modal.classList.remove('hidden');
    },

    handleTaskSubmit: async (e) => {
        e.preventDefault();
        const id = document.getElementById('task-id').value;
        const recType = document.getElementById('task-recurrence').value;

        // Recurrence Config
        let recurrence = { type: recType };
        if (recType === 'weekly') {
            const checked = Array.from(document.querySelectorAll('input[name="rec_days"]:checked')).map(cb => parseInt(cb.value));
            recurrence.days = checked;
        } else if (recType === 'monthly') {
            const monthlyType = document.querySelector('input[name="rec_monthly_type"]:checked').value;
            recurrence.monthlyType = monthlyType;
            if (monthlyType === 'fixed') {
                recurrence.day = parseInt(document.getElementById('rec-month-day').value) || 1;
            } else {
                recurrence.week = parseInt(document.getElementById('rec-relative-week').value);
                recurrence.dayOfWeek = parseInt(document.getElementById('rec-relative-day').value);
            }
        } else if (recType === 'periodic') {
            recurrence.interval = parseInt(document.getElementById('rec-periodic-days').value) || 1;
        }

        const taskData = {
            requerimiento: document.getElementById('task-req').value,
            description: document.getElementById('task-desc').value,
            rubro: document.getElementById('task-rubro').value,
            responsable: document.getElementById('task-resp').value,
            prioridad: document.getElementById('task-prio').value,
            deadline: document.getElementById('task-date').value,
            costo: parseFloat(document.getElementById('task-cost').value) || 0,
            hh_estimated: parseFloat(document.getElementById('task-hh-est').value) || 0,
            hh_executed: parseFloat(document.getElementById('task-hh-exe').value) || 0,
            subtasks: ProjectComponent.editingSubtasks,
            attachments: ProjectComponent.currentAttachments,
            recurrence: recurrence,
            estado: id ? ProjectComponent.data.find(t => t.id === id).estado : 'Pendiente'
        };

        try {
            if (id) {
                await Store.updateTask(ProjectComponent.projectId, id, taskData);
                UI.showToast('Tarea actualizada', 'success');
            } else {
                await Store.addTask(ProjectComponent.projectId, taskData);
                UI.showToast('Tarea creada', 'success');
            }
            document.getElementById('task-modal').classList.add('hidden');
            ProjectComponent.refreshUI();
        } catch (err) {
            console.error(err);
            UI.showToast('Error al guardar', 'error');
        }
    },

    updateStatus: async (taskId, newStatus) => {
        try {
            const task = ProjectComponent.data.find(t => t.id === taskId);

            // Logic: Move to 'Realizados' if marked as done
            if (task && newStatus === 'Realizado' && task.rubro !== 'Realizados') {
                if (await UI.confirm('¿Desea mover esta tarea al área de Realizados?')) {
                    // Ensure 'Realizados' exists
                    if (!ProjectComponent.rubros.includes('Realizados')) {
                        const newRubros = [...ProjectComponent.rubros, 'Realizados'];
                        await Store.updateRubros(ProjectComponent.projectId, newRubros);
                        ProjectComponent.rubros = newRubros;
                    }

                    await Store.updateTask(ProjectComponent.projectId, taskId, { estado: newStatus, rubro: 'Realizados' });
                    ProjectComponent.refreshUI();
                    UI.showToast('Tarea completada y movida a Realizados', 'success');
                    return;
                }
            }

            // Default behavior
            await Store.updateTask(ProjectComponent.projectId, taskId, { estado: newStatus });
            ProjectComponent.refreshUI();
        } catch (e) {
            console.error(e);
            UI.showToast('Error de conexión', 'error');
        }
    },

    editTask: (taskId) => {
        ProjectComponent.openTaskModal(taskId);
    },

    deleteTask: async (taskId) => {
        if (!ProjectComponent.isEditable) return; // Safety check

        const task = ProjectComponent.data.find(t => t.id === taskId);
        if (!task) return;

        if (task.rubro !== 'Eliminado') {
            if (await UI.confirm('¿Mover esta tarea a Eliminados?')) {
                // Ensure 'Eliminado' exists in rubros
                if (!ProjectComponent.rubros.includes('Eliminado')) {
                    const newRubros = [...ProjectComponent.rubros, 'Eliminado'];
                    await Store.updateRubros(ProjectComponent.projectId, newRubros);
                    ProjectComponent.rubros = newRubros;
                }

                await Store.updateTask(ProjectComponent.projectId, taskId, { rubro: 'Eliminado', estado: 'Suspendido' });
                await ProjectComponent.refreshUI(); // Force wait
                UI.showToast('Tarea movida a Eliminados', 'info');
            }
        } else {
            // Restriction for Shared Mode
            if (ProjectComponent.isShared) {
                UI.showToast('Acción no permitida en Modo Colaborador', 'warning');
                return;
            }

            if (await UI.confirm('¿Eliminar definitivamente esta tarea? Esta acción no se puede deshacer.')) {
                await Store.deleteTask(ProjectComponent.projectId, taskId);
                await ProjectComponent.refreshUI(); // Force wait
                UI.showToast('Tarea eliminada definitivamente', 'info');
            }
        }
    },

    shareProject: () => {
        const modalId = 'share-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        // Base URL logic: remove query params and ensure we point to #/share/ID
        const baseUrl = window.location.href.split('?')[0].replace('#/dashboard', '').replace('#/project/', '#/share/');
        // If we are already at #/project/ID, the replace works. 
        // Safer: construct from origin + hash
        const cleanHash = window.location.hash.split('?')[0].replace('#/project/', '#/share/');
        const projectUrl = window.location.origin + window.location.pathname + cleanHash;

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Compartir Proyecto</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div class="space-y-4">
                    <!-- Edit Option -->
                    <div class="glass-card p-4 rounded-xl border border-blue-100 dark:border-blue-900 hover:border-blue-300 transition-colors cursor-pointer group" onclick="ProjectComponent.copyLink('${projectUrl}?mode=edit')">
                        <div class="flex items-center gap-4">
                            <div class="bg-blue-100 dark:bg-blue-900 p-3 rounded-full text-blue-600 dark:text-blue-300">
                                <i class="fas fa-edit text-xl"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-gray-800 dark:text-white">Colaborador</h4>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Permite editar tareas, estados y añadir notas.</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-gray-300 group-hover:text-brand-500"></i>
                        </div>
                    </div>

                    <!-- Read Only Option -->
                    <div class="glass-card p-4 rounded-xl border border-green-100 dark:border-green-900 hover:border-green-300 transition-colors cursor-pointer group" onclick="ProjectComponent.copyLink('${projectUrl}?mode=readonly')">
                        <div class="flex items-center gap-4">
                            <div class="bg-green-100 dark:bg-green-900 p-3 rounded-full text-green-600 dark:text-green-300">
                                <i class="fas fa-eye text-xl"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-gray-800 dark:text-white">Invitado (Solo Lectura)</h4>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Solo puede ver el progreso, sin modificar nada.</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-gray-300 group-hover:text-brand-500"></i>
                        </div>
                    </div>
                </div>

                <p class="text-center text-xs text-gray-400 mt-6">
                    Haz clic en una opción para copiar el enlace al portapapeles.
                </p>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    copyLink: (url) => {
        // Fix double hashing if present
        const cleanUrl = url.replace(new RegExp('#/share/#/share/', 'g'), '#/share/');

        navigator.clipboard.writeText(cleanUrl).then(() => {
            UI.showToast('¡Enlace copiado!', 'success');
            document.getElementById('share-modal').classList.add('hidden');
        }).catch(err => {
            console.error('Error copy: ', err);
            prompt("Copia tu enlace:", cleanUrl);
        });
    },

    // Move Task Feature
    movingTaskId: null,

    openMoveModal: (taskId) => {
        ProjectComponent.movingTaskId = taskId;
        const modalId = 'move-task-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        const task = ProjectComponent.data.find(t => t.id === taskId);
        const currentRubro = task ? task.rubro : '';

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-up">
                <h3 class="text-xl font-bold dark:text-white mb-4">Mover Tarea</h3>
                <p class="text-sm text-gray-500 mb-4">Selecciona el nuevo rubro para la tarea:</p>
                
                <select id="move-rubro-select" class="input-primary mb-6">
                    ${ProjectComponent.rubros.map(r => `<option value="${r}" ${r === currentRubro ? 'selected' : ''}>${r}</option>`).join('')}
                </select>

                <div class="flex justify-end gap-3">
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-secondary">Cancelar</button>
                    <button onclick="ProjectComponent.confirmMoveTask()" class="btn-primary">Mover</button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    confirmMoveTask: async () => {
        const modal = document.getElementById('move-task-modal');
        const select = document.getElementById('move-rubro-select');
        const newRubro = select.value;
        const taskId = ProjectComponent.movingTaskId;

        if (taskId && newRubro) {
            try {
                await Store.updateTask(ProjectComponent.projectId, taskId, { rubro: newRubro });
                UI.showToast(`Tarea movida a ${newRubro}`, 'success');
                ProjectComponent.refreshUI();
            } catch (e) {
                console.error(e);
                UI.showToast('Error al mover tarea', 'error');
            }
        }
        modal.classList.add('hidden');
    },

    exportPDF: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Header
        doc.setFontSize(18);
        doc.text("Reporte de Proyecto", 14, 20);

        doc.setFontSize(12);
        doc.setTextColor(100);
        const projectName = document.querySelector('h2').innerText || 'Proyecto';
        doc.text(projectName, 14, 30);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 36);

        // Stats
        let statsY = 45;
        const tasks = ProjectComponent.getFilteredData();
        const done = tasks.filter(t => t.estado === 'Realizado').length;
        doc.setFontSize(10);
        doc.text(`Total: ${tasks.length} | Realizadas: ${done} | Pendientes: ${tasks.length - done}`, 14, statsY);

        // Table
        let yPos = statsY + 10;

        // Simple manual table implementation for now (autoTable is external plugin, if not loaded, fallback)
        // Since we didn't explicitly load autotable plugin in index, we'll do a simple list output

        ProjectComponent.rubros.forEach(rubro => {
            const items = tasks.filter(t => t.rubro === rubro);
            if (items.length === 0) return;

            if (yPos > 270) { doc.addPage(); yPos = 20; }

            doc.setFont(undefined, 'bold');
            doc.setFillColor(240, 240, 240);
            doc.rect(14, yPos, 180, 8, 'F');
            doc.setTextColor(0);
            doc.text(rubro, 16, yPos + 5);
            yPos += 12;

            doc.setFont(undefined, 'normal');
            items.forEach(item => {
                const check = item.estado === 'Realizado' ? '[X]' : '[ ]';
                const text = `${check} ${item.requerimiento} (${item.responsable})`;

                // Text wrap
                const splitText = doc.splitTextToSize(text, 170);
                if (yPos + (splitText.length * 5) > 280) { doc.addPage(); yPos = 20; }

                doc.text(splitText, 16, yPos);
                yPos += (splitText.length * 5) + 2;
            });
            yPos += 4;
        });

        doc.save(`${projectName.replace(/\s+/g, '_')}_Report.pdf`);
    },

    // --- Export Selection Logic ---
    toggleSelectionMode: () => {
        ProjectComponent.isSelectionMode = !ProjectComponent.isSelectionMode;
        ProjectComponent.selectedTasks.clear();
        ProjectComponent.refreshUI();
    },

    toggleTaskSelection: (id, checked) => {
        if (checked) ProjectComponent.selectedTasks.add(id);
        else ProjectComponent.selectedTasks.delete(id);
        ProjectComponent.refreshUI(); // Full refresh to update checkboxes state
    },

    executeOctavoExport: async () => {
        const selectedIds = Array.from(ProjectComponent.selectedTasks);
        if (selectedIds.length === 0) return UI.showToast('Selecciona al menos una tarea', 'warning');

        const tasks = ProjectComponent.data.filter(t => selectedIds.includes(t.id));

        // Call export directly with filtered tasks
        await ProjectComponent.exportOctavoPiso(tasks);

        // Exist selection mode
        ProjectComponent.toggleSelectionMode();
    },

    exportOctavoPiso: async (tasksToExport = null) => {
        // If passed explicit list (from selection mode), usage it. Otherwise filter current view.
        const tasks = tasksToExport || ProjectComponent.getFilteredData();

        if (tasks.length === 0) {
            UI.showToast('No hay tareas para exportar', 'info');
            return;
        }

        // Only ask confirmation if NOT coming from Selection Mode (tasksToExport is null)
        if (!tasksToExport) {
            const confirmed = await UI.confirm(`¿Exportar ${tasks.length} tareas visualizadas a formato Octavo Piso?`);
            if (!confirmed) return;
        }

        // 2. Map Data
        // Columns: Título | Descripción | Etiquetas | Prioridad | Estado | Visibilidad | Presupuesto
        const exportData = tasks.map(t => ({
            "Titulo": t.requerimiento || t.text || "Tarea sin título",
            "Descripcion": t.description || "",
            "Etiquetas": "",
            "Prioridad": 30, // Fixed
            "Estado": 10,   // Fixed
            "Visibilidad": 10, // Fixed
            "Presupuesto": parseFloat(t.costo) || 0
        }));

        // 3. Generate Excel
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reclamos");

        // 4. Save
        const filename = `Reclamos_OctavoPiso_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);

        UI.showToast('Exportación completada', 'success');
    },

    toggleTheme: () => {
        document.documentElement.classList.toggle('dark');
    },

    // Management Actions
    manageRubros: () => {
        ProjectComponent.openManageModal('Gestionar Areas', ProjectComponent.rubros, async (newList) => {
            // Protect 'Realizados' and 'Eliminado'
            if (!newList.includes('Realizados')) newList.push('Realizados');
            if (!newList.includes('Eliminado')) newList.push('Eliminado');

            await Store.updateRubros(ProjectComponent.projectId, newList);
            ProjectComponent.rubros = newList;
            ProjectComponent.renderModalOptions();
            ProjectComponent.renderChecklist();
            UI.showToast('Areas actualizadas', 'success');
        });
    },

    manageResponsables: () => {
        ProjectComponent.openManageModal('Gestionar Responsables', ProjectComponent.responsables, async (newList, oldList) => {
            // Detect Renames to update Tasks
            if (oldList) {
                const renames = {};
                oldList.forEach((oldName, idx) => {
                    const newName = newList[idx];
                    if (newName && oldName !== newName) {
                        renames[oldName] = newName;
                    }
                });

                if (Object.keys(renames).length > 0) {
                    // Update all tasks with new responsible names
                    const tasksToUpdate = ProjectComponent.data.filter(t => renames[t.responsable]);
                    await Promise.all(tasksToUpdate.map(t =>
                        Store.updateTask(ProjectComponent.projectId, t.id, { responsable: renames[t.responsable] })
                    ));
                }
            }

            await Store.updateResponsables(ProjectComponent.projectId, newList);
            ProjectComponent.responsables = newList;
            ProjectComponent.renderModalOptions();
            ProjectComponent.refreshUI(); // Refresh to show new names on cards
            UI.showToast('Responsables actualizados', 'success');
        });
    },

    openManageModal: (title, currentList, onSave) => {
        const modalId = 'manage-modal';
        let modal = document.getElementById(modalId);

        // Create modal if not exists
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        // Temporary state for the modal
        let tempList = [...currentList];

        const renderList = () => {
            const listContainer = document.getElementById('manage-list-items');
            if (listContainer) {
                listContainer.innerHTML = tempList.map((item, i) => {
                    const isEditable = item !== 'Eliminado' && item !== 'Realizados';
                    return `
                    <div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-700/50 rounded mb-2 group" data-value="${item}">
                        <div class="flex items-center gap-3 flex-1">
                            <i class="fas fa-grip-vertical text-gray-400 ${isEditable ? 'cursor-move hover:text-gray-600' : 'opacity-30 cursor-not-allowed'}"></i>
                            ${isEditable ?
                            `<input type="text" class="bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-200 w-full p-0 font-medium cursor-text hover:bg-white/50 dark:hover:bg-slate-600/50 rounded px-1 transition-colors" 
                                    value="${item}" 
                                    onchange="document.dispatchEvent(new CustomEvent('rename-manage-item', {detail: {idx: ${i}, val: this.value}}))">`
                            : `<span class="text-gray-500 italic cursor-not-allowed select-none px-1">${item}</span>`
                        }
                        </div>
                        ${isEditable ? `
                        <button onclick="document.dispatchEvent(new CustomEvent('remove-manage-item', {detail: ${i}}))" class="text-red-500 hover:text-red-700 p-1 opacity-50 group-hover:opacity-100 transition-opacity" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>` : `<span class="p-1"><i class="fas fa-lock text-gray-300 dark:text-gray-600 text-xs"></i></span>`}
                    </div>
                `}).join('');

                // Init Sortable (Disable for 'Eliminado' if needed, but easier to just filter)
                if (listContainer._sortable) listContainer._sortable.destroy();
                listContainer._sortable = new Sortable(listContainer, {
                    animation: 150,
                    handle: '.fa-grip-vertical',
                    filter: '.fa-lock', // Cannot drag locked items
                    onEnd: () => {
                        // Re-read *current* values from DOM inputs if renaming happened before drag end? 
                        // Safer to read data attributes as base, assuming rename updates array.
                        // Actually, updating array via onEnding might overwrite pending rename inputs? 
                        // Let's rely on map of DOM elements.
                        const newOrder = Array.from(listContainer.children).map(el => {
                            const input = el.querySelector('input');
                            return input ? input.value : el.getAttribute('data-value');
                        });
                        tempList = newOrder;
                    }
                });
            }
        };

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">${title}</h3>
                    <button id="close-manage-modal" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>
                
                <div class="flex gap-2 mb-4">
                    <input type="text" id="new-manage-item" class="input-primary" placeholder="Nuevo elemento...">
                    <button id="add-manage-item" class="btn-primary px-4"><i class="fas fa-plus"></i></button>
                </div>

                <div id="manage-list-items" class="max-h-60 overflow-y-auto mb-6"></div>

                <div class="flex justify-end gap-3">
                    <button id="cancel-manage" class="btn-secondary">Cancelar</button>
                    <button id="save-manage" class="btn-primary">Guardar Cambios</button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        renderList();

        // Event Handlers
        const close = () => modal.classList.add('hidden');

        document.getElementById('close-manage-modal').onclick = close;
        document.getElementById('cancel-manage').onclick = close;

        document.getElementById('add-manage-item').onclick = () => {
            const val = document.getElementById('new-manage-item').value.trim();
            if (val && !tempList.includes(val)) {
                tempList.push(val);
                document.getElementById('new-manage-item').value = '';
                renderList();
            }
        };

        // Custom event for dynamic removal (event delegation would be better but this works for isolated modal)
        const removeHandler = (e) => {
            tempList.splice(e.detail, 1);
            renderList();
        };
        document.addEventListener('remove-manage-item', removeHandler);

        // Rename Handler
        const renameHandler = (e) => {
            const { idx, val } = e.detail;
            if (val && val.trim() !== '') {
                tempList[idx] = val.trim();
                // We don't re-render list here to avoid losing focus, input value is already there by user typing.
                // But we update the data-value attribute for sorting logic
                const listContainer = document.getElementById('manage-list-items');
                if (listContainer && listContainer.children[idx]) {
                    listContainer.children[idx].setAttribute('data-value', val.trim());
                }
            }
        };
        document.addEventListener('rename-manage-item', renameHandler);


        document.getElementById('save-manage').onclick = () => {
            // Final read of order just in case
            const listContainer = document.getElementById('manage-list-items');
            if (listContainer) {
                // Determine final list from DOM order
                const finalOrder = Array.from(listContainer.children).map(el => {
                    const input = el.querySelector('input');
                    return input ? input.value : el.getAttribute('data-value'); // Fallback for readonly
                }).filter(x => x && x.trim() !== ''); // Filter empties

                onSave(finalOrder, [...currentList]); // Pass old list for comparison
            } else {
                onSave(tempList, [...currentList]);
            }
            document.removeEventListener('remove-manage-item', removeHandler);
            document.removeEventListener('rename-manage-item', renameHandler); // Cleanup
            close();
        };
    },

    renderModalOptions: () => {
        const rubroSelect = document.getElementById('task-rubro');
        const respSelect = document.getElementById('task-resp');

        if (rubroSelect) {
            const current = rubroSelect.value;
            rubroSelect.innerHTML = ProjectComponent.rubros
                .map(r => `<option value="${r}">${r}</option>`).join('');
            if (current && ProjectComponent.rubros.includes(current)) {
                rubroSelect.value = current;
            } else if (ProjectComponent.rubros.length > 0) {
                rubroSelect.value = ProjectComponent.rubros[0];
            }
        }

        if (respSelect) {
            const current = respSelect.value;
            respSelect.innerHTML = ProjectComponent.responsables
                .map(r => `<option value="${r}">${r}</option>`).join('');
            if (current && ProjectComponent.responsables.includes(current)) {
                respSelect.value = current;
            } else if (ProjectComponent.responsables.length > 0) {
                respSelect.value = ProjectComponent.responsables[0];
            }
        }
    },

    renderCharts: () => {
        const ctx = document.getElementById('statusChart');
        if (!ctx) return;

        // Stats
        const stats = {
            'Pendiente': 0, 'En Proceso': 0, 'Realizado': 0, 'Suspendido': 0
            // Management Actions
        };
        ProjectComponent.data.forEach(t => {
            if (stats[t.estado] !== undefined) stats[t.estado]++;
        });

        // Progress Bar
        const total = ProjectComponent.data.length;
        const pcent = total > 0 ? Math.round((stats['Realizado'] / total) * 100) : 0;
        document.getElementById('project-progress-bar').style.width = `${pcent}%`;
        document.getElementById('project-progress-text').textContent = `${pcent}%`;

        // Chart
        if (ProjectComponent.chartInstance) ProjectComponent.chartInstance.destroy();

        ProjectComponent.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(stats),
                datasets: [{
                    data: Object.values(stats),
                    backgroundColor: Object.keys(stats).map(k => ProjectComponent.statusColors[k]),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 10, usePointStyle: true }
                    }
                }
            }
        });

        // Stats Text
        document.getElementById('project-stats').innerHTML = `
            <div class="flex justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700"><span>Total</span> <span class="font-bold">${total}</span></div>
            <div class="flex justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700"><span>Pendientes</span> <span class="font-bold text-yellow-600">${stats['Pendiente']}</span></div>
            <div class="flex justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700"><span>En Proceso</span> <span class="font-bold text-blue-600">${stats['En Proceso']}</span></div>
            <div class="flex justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700"><span>Realizado</span> <span class="font-bold text-green-600">${stats['Realizado']}</span></div>
        `;
    },

    editProjectName: async () => {
        const span = document.getElementById('project-name-display');
        const currentName = span.textContent.trim();

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-brand-500 focus:outline-none w-auto';

        const save = async () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                try {
                    await Store.updateProject(ProjectComponent.projectId, { name: newName });
                    span.textContent = newName;
                    UI.showToast('Nombre actualizado', 'success');
                } catch (e) {
                    UI.showToast('Error al actualizar nombre', 'error');
                    span.textContent = currentName;
                }
            } else {
                span.textContent = currentName;
            }
            input.replaceWith(span);
        };

        input.onblur = save;
        input.onkeydown = (e) => { if (e.key === 'Enter') save(); };

        span.replaceWith(input);
        input.focus();
    },

    // --- Task Templates ---

    openTaskTemplates: async () => {
        const templates = await Store.getTaskTemplates();
        const modalId = 'task-templates-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold dark:text-white">Plantillas de Tareas</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-lg">&times;</button>
                </div>
                
                <div class="space-y-2 max-h-60 overflow-y-auto mb-4">
                    ${templates.length === 0 ? '<p class="text-gray-400 text-xs italic text-center">No hay plantillas guardadas</p>' :
                templates.map(t => `
                        <div class="flex justify-between items-center p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded cursor-pointer border border-transparent hover:border-gray-100"
                             onclick="ProjectComponent.applyTaskTemplate('${t.id}')">
                            <span class="text-sm text-gray-800 dark:text-gray-200">${t.name}</span>
                            <button onclick="event.stopPropagation(); ProjectComponent.deleteTaskTemplate('${t.id}')" class="text-red-400 hover:text-red-600 p-1"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    applyTaskTemplate: async (templateId) => {
        const templates = await Store.getTaskTemplates();
        const t = templates.find(x => x.id === templateId);
        if (t) {
            document.getElementById('task-req').value = t.requerimiento || '';
            document.getElementById('task-prio').value = t.prioridad || 'Media';
            // Cost, Recurrence, Subtasks could also be applied
            if (t.subtasks) {
                ProjectComponent.editingSubtasks = [...t.subtasks];
                ProjectComponent.renderSubtasksEdit();
            }
            UI.showToast('Plantilla aplicada', 'info');
            document.getElementById('task-templates-modal').classList.add('hidden');
        }
    },

    viewAttachments: (taskId) => {
        const task = ProjectComponent.data.find(t => t.id === taskId);
        if (!task || !task.attachments || task.attachments.length === 0) return;

        // Create Lightbox
        const lightboxId = 'attachment-lightbox';
        let lightbox = document.getElementById(lightboxId);
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = lightboxId;
            lightbox.className = "fixed inset-0 z-[100] bg-black/90 hidden flex flex-col items-center justify-center p-4 backdrop-blur-sm";
            document.body.appendChild(lightbox);
        }

        lightbox.innerHTML = `
            <button onclick="document.getElementById('${lightboxId}').classList.add('hidden')" class="absolute top-4 right-4 text-white text-3xl hover:text-gray-300">&times;</button>
            <div class="flex flex-wrap justify-center gap-4 max-w-6xl">
                ${task.attachments.map(att => `
                    <div class="relative group">
                        <img src="${att.data}" class="max-h-[80vh] max-w-full object-contain rounded shadow-2xl border border-gray-800">
                        <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                            ${att.name}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        lightbox.classList.remove('hidden');
    },

    saveAsTaskTemplate: async () => {
        const req = document.getElementById('task-req').value;
        if (!req) return UI.showToast('La tarea debe tener una descripción', 'warning');

        const name = prompt("Nombre de la plantilla:", req.substring(0, 20) + '...');
        if (name) {
            const template = {
                name,
                requerimiento: req,
                prioridad: document.getElementById('task-prio').value,
                subtasks: ProjectComponent.editingSubtasks,
                // Add H/H to template if desired, skipping for now
            };
            try {
                await Store.createTaskTemplate(template);
                UI.showToast('Plantilla guardada', 'success');
            } catch (e) {
                UI.showToast('Error al guardar plantilla', 'error');
            }
        }
    },

    // --- Excel Import ---
    importFromExcel: () => {
        // Create hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx, .xls, .csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) ProjectComponent.handleExcelFile(file);
        };
        input.click();
    },

    downloadExampleTemplate: () => {
        if (!window.XLSX) return UI.showToast('Librería Excel no cargada', 'error');

        const headers = [
            'Requerimiento', 'Descripcion', 'Area', 'Responsable', 'Prioridad', 'Estado',
            'Vencimiento', 'Costo', 'HH Estimadas', 'HH Ejecutadas',
            'Recurrencia', 'Subtareas'
        ];

        const data = [
            headers,
            ['Ejemplo: Revisar Login', 'Detalles del bug de login', 'Desarrollo', 'Juan Perez', 'Alta', 'Pendiente', '2023-12-31', 100, 5, 0, 'Diaria', 'Paso 1 | Paso 2'],
            ['Ejemplo: Comprar Materiales', 'Compras', 'Ana Gomez', 'Media', 'Pendiente', '', 50.5, 2, 0, '', '']
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
        XLSX.writeFile(wb, "Plantilla_Carga_Tareas.xlsx");
    },

    handleExcelFile: (file) => {
        if (!window.XLSX) {
            UI.showToast('Librería Excel no cargada. Recarga la página.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                if (jsonData.length === 0) {
                    UI.showToast('El archivo está vacío', 'warning');
                    return;
                }

                if (!confirm(`Se encontraron ${jsonData.length} tareas. ¿Deseas importarlas ahora?`)) return;

                let imported = 0;

                for (const row of jsonData) {
                    // Map Columns (Case Insensitive normalization helper could be used, but manual is fine for key fields)
                    const req = row['Requerimiento'] || row['Tarea'] || row['Titulo'];
                    const desc = row['Descripcion'] || row['Descripción'] || '';
                    if (!req) continue;

                    // Basic Fields
                    const rubro = row['Rubro'] || row['Area'] || 'General';
                    const responsable = row['Responsable'] || 'Sin Asignar';
                    const prioridad = row['Prioridad'] || 'Media';
                    const estado = row['Estado'] || 'Pendiente';
                    const hhEst = parseFloat(row['HH Estimadas'] || row['Estimadas']) || 0;
                    const hhExe = parseFloat(row['HH Ejecutadas'] || row['Ejecutadas']) || 0;
                    const costo = parseFloat(row['Costo'] || row['Costo Estimado']) || 0;

                    // Subtasks: Split by '|'
                    let subtasks = [];
                    const subtasksRaw = row['Subtareas'] || row['Checklist'];
                    if (subtasksRaw) {
                        subtasks = subtasksRaw.split('|').map(s => ({ text: s.trim(), done: false })).filter(s => s.text);
                    }

                    // Recurrence: "Diariamente", "Semanalmente", etc.
                    let recurrence = { type: 'none' };
                    const recRaw = row['Recurrencia'] || row['Repeticion'];
                    if (recRaw) {
                        const lower = recRaw.toLowerCase();
                        if (lower.includes('diaria')) recurrence.type = 'daily';
                        else if (lower.includes('semanal')) recurrence.type = 'weekly'; // Defaults to no specific days (daily logic fallback or just simple weekly trigger?) -> Store logic handles "weekly" with no days as fallback +1 day basically.
                        else if (lower.includes('mensual')) recurrence.type = 'monthly';
                        else if (lower.includes('anual')) recurrence.type = 'yearly';
                        else if (lower.includes('periodica')) recurrence.type = 'periodic'; // defaults to 1 day if interval not found
                    }

                    // Deadline
                    let deadline = '';
                    const dateRaw = row['Vencimiento'] || row['Fecha Limite'] || row['Deadline'];
                    if (dateRaw) {
                        // SheetJS serial date number
                        if (typeof dateRaw === 'number') {
                            const dateObj = XLSX.SSF.parse_date_code(dateRaw);
                            // Format YYYY-MM-DD
                            deadline = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
                        } else if (typeof dateRaw === 'string') {
                            // Try to parse string... simplified: assume user gives YYYY-MM-DD or DD/MM/YYYY
                            // If it's valid ISO, keep it.
                            if (dateRaw.match(/^\d{4}-\d{2}-\d{2}$/)) deadline = dateRaw;
                        }
                    }

                    const taskData = {
                        requerimiento: req,
                        description: desc,
                        rubro: rubro,
                        responsable: responsable,
                        prioridad: prioridad,
                        hh_estimated: hhEst,
                        hh_executed: hhExe,
                        costo: costo,
                        estado: estado,
                        subtasks: subtasks,
                        recurrence: recurrence,
                        deadline: deadline
                    };

                    // Ensure Rubro exists
                    if (!ProjectComponent.rubros.includes(taskData.rubro)) {
                        const newRubros = [...ProjectComponent.rubros, taskData.rubro];
                        await Store.updateRubros(ProjectComponent.projectId, newRubros);
                        ProjectComponent.rubros = newRubros;
                    }

                    // Create Task
                    await Store.addTask(ProjectComponent.projectId, taskData);
                    imported++;
                }

                UI.showToast(`${imported} tareas importadas exitosamente`, 'success');
                ProjectComponent.refreshUI();

            } catch (err) {
                console.error(err);
                UI.showToast('Error al procesar archivo Excel', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },
};
