const DashboardComponent = {
    viewArchived: false,
    projects: [],
    allTasks: [],
    allResponsables: new Set(),
    chartInstances: {},
    currentEditingTask: null,
    globalFilters: {
        priority: 'all',
        responsible: 'all'
    },
    projectSettings: JSON.parse(localStorage.getItem('nexus_project_settings')) || { order: [], hidden: {} },

    render: async (container) => {
        // Show loading state
        container.innerHTML = `
            ${NavbarComponent.render()}
            <div class="flex h-[calc(100vh-64px)]">
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
                </div>
            </div>
        `;

        // 1. Fetch Resources
        try {
            DashboardComponent.projects = await Store.getProjects();
            // Fetch all active projects for global stats
            const projectsToFetch = DashboardComponent.projects.filter(p => true);

            DashboardComponent.allTasks = [];
            DashboardComponent.allResponsables.clear();

            await Promise.all(projectsToFetch.map(async (p) => {
                if (p.status === 'inactive' && !DashboardComponent.viewArchived) return;

                try {
                    const data = await Store.getProjectData(p.id);
                    const tasks = data.tasks ? Object.keys(data.tasks).map(key => ({
                        id: key,
                        ...data.tasks[key]
                    })) : [];

                    // Collect Responsibles from Config
                    if (data.responsables && Array.isArray(data.responsables)) {
                        data.responsables.forEach(r => DashboardComponent.allResponsables.add(r));
                    }

                    // Enrich tasks
                    tasks.forEach(t => {
                        DashboardComponent.allTasks.push({
                            ...t,
                            projectId: p.id,
                            projectName: p.name,
                            projectStatus: p.status,
                            // Ensure we use the correct property name from project.js (requerimiento)
                            text: t.requerimiento || t.text || 'Sin nombre'
                        });
                    });

                    // Update project stats for sidebar
                    const total = tasks.length;
                    const done = tasks.filter(t => t.estado === 'Realizado').length;
                    p.progress = total > 0 ? Math.round((done / total) * 100) : 0;
                } catch (err) {
                    console.warn(`Error loading data for project ${p.id}`, err);
                }
            }));

        } catch (e) {
            console.error(e);
            UI.showToast("Error cargando datos del dashboard", "error");
            return;
        }

        // 2. Render Layout
        const navbar = NavbarComponent.render();
        const sidebar = DashboardComponent.renderSidebar();
        const content = DashboardComponent.renderMainContent();

        container.innerHTML = `
            ${navbar}
            <div class="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 overflow-hidden">
                <!-- Sidebar -->
                ${sidebar}

                <!-- Main Content -->
                <div class="flex-1 overflow-y-auto min-w-0 p-4 lg:p-8" id="dashboard-main-scroll">
                    <div class="max-w-7xl mx-auto space-y-8 pb-20">
                        ${content}
                    </div>
                </div>
            </div>
            
            <!-- Quick Edit Modal -->
            ${DashboardComponent.renderQuickEditModal()}
        `;

        // 3. Init Charts
        setTimeout(() => {
            DashboardComponent.renderCharts();
            // Init Modal Logic if needed (event listeners are inline)
        }, 100);
    },

    renderSidebar: () => {
        const order = DashboardComponent.projectSettings.order || [];
        const hidden = DashboardComponent.projectSettings.hidden || {};

        const sortProjects = (a, b) => {
            const idxA = order.indexOf(a.id);
            const idxB = order.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return 0;
        };

        const activeProjects = DashboardComponent.projects
            .filter(p => p.status !== 'inactive' && !hidden[p.id])
            .sort(sortProjects);

        const archivedProjects = DashboardComponent.projects.filter(p => p.status === 'inactive');
        const list = DashboardComponent.viewArchived ? archivedProjects : activeProjects;

        return `
            <aside class="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 hidden lg:flex flex-col h-full shadow-lg z-10 transition-all duration-300">
                <div class="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                    <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Proyectos</h2>
                     <div class="flex gap-1">
                        <button onclick="DashboardComponent.manageProjects()" class="text-gray-400 hover:text-brand-600 p-1.5 rounded-lg transition-colors" title="Configurar Proyectos">
                             <i class="fas fa-cog"></i>
                        </button>
                        <button onclick="DashboardComponent.manageAdmins()" class="text-gray-400 hover:text-brand-600 p-1.5 rounded-lg transition-colors" title="Gestionar Administradores">
                            <i class="fas fa-user-shield"></i>
                        </button>
                        <button onclick="DashboardComponent.manageTemplates()" class="text-gray-400 hover:text-brand-600 p-1.5 rounded-lg transition-colors" title="Gestionar Plantillas">
                            <i class="fas fa-layer-group"></i>
                        </button>
                        <button onclick="DashboardComponent.createNewProject()" class="text-brand-600 hover:bg-brand-50 p-1.5 rounded-lg transition-colors" title="Nuevo Proyecto">
                            <i class="fas fa-plus"></i>
                        </button>
                     </div>
                </div>
                
                <div class="flex-1 overflow-y-auto py-2 p-2 space-y-1">
                    ${list.length === 0 ? `
                        <div class="text-center py-8 px-4 text-gray-400 text-sm">
                            No hay proyectos ${DashboardComponent.viewArchived ? 'archivados' : 'activos'}
                        </div>
                    ` : list.map(p => `
                        <div class="group flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-all border border-transparent hover:border-gray-100 dark:hover:border-slate-600 relative">
                            <div class="min-w-0 flex-1" onclick="App.navigateTo('#/project/${p.id}')">
                                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-200 truncate group-hover:text-brand-600 transition-colors">${p.name}</h3>
                                <div class="flex items-center gap-2 mt-1">
                                    <div class="h-1.5 flex-1 bg-gray-200 dark:bg-slate-600 rounded-full max-w-[50px]">
                                        <div class="h-1.5 bg-brand-500 rounded-full" style="width: ${p.progress || 0}%"></div>
                                    </div>
                                    <span class="text-[10px] text-gray-400">${p.progress || 0}%</span>
                                </div>
                            </div>
                            
                            <!-- Quick Actions (Hover) -->
                            <div class="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-100 dark:border-slate-600">
                                <button onclick="DashboardComponent.toggleProjectStatus('${p.id}', '${p.status}')" class="p-1.5 text-gray-400 hover:text-brand-600" title="${p.status === 'inactive' ? 'Restaurar' : 'Archivar'}">
                                    <i class="fas fa-${p.status === 'inactive' ? 'box-open' : 'box-archive'} text-xs"></i>
                                </button>
                                <button onclick="DashboardComponent.deleteProject('${p.id}')" class="p-1.5 text-gray-400 hover:text-red-500" title="Eliminar">
                                    <i class="fas fa-trash-alt text-xs"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <button onclick="DashboardComponent.toggleViewArchived()" class="w-full btn-secondary text-xs py-2">
                        <i class="fas fa-${DashboardComponent.viewArchived ? 'box-open' : 'archive'} mr-2"></i>
                        ${DashboardComponent.viewArchived ? 'Ver Activos' : 'Ver Archivados'}
                    </button>
                </div>
            </aside>
        `;
    },

    renderMainContent: () => {
        const stats = DashboardComponent.calculateGlobalStats();

        return `
            <!-- Header -->
            <div class="flex justify-between items-end">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        Panel de Control
                        ${Store.currentContext.role === 'admin' ?
                `<span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full border border-orange-200">Modo Admin</span>` :
                `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full border border-gray-200">Personal</span>`
            }
                    </h1>
                    <p class="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
                        Resumen global de todos tus proyectos
                        ${Store.currentContext.availableWorkspaces.length > 1 ?
                `<button onclick="DashboardComponent.openWorkspaceSwitcher()" class="text-brand-600 hover:underline font-medium ml-2">
                                <i class="fas fa-exchange-alt"></i> Cambiar Espacio
                             </button>` : ''
            }
                    </p>
                </div>
                <div class="text-right hidden sm:block">
                   <p class="text-2xl font-bold text-brand-600">${stats.totalPending}</p>
                   <p class="text-xs text-gray-400 uppercase">Tareas Pendientes Total</p>
                </div>
            </div>

            <!-- Global Filter Bar -->
            <div class="glass-card p-4 rounded-xl flex flex-wrap items-center gap-4 mb-6">
                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <i class="fas fa-filter text-brand-500"></i>
                    <span class="font-medium text-sm">Filtros Globales:</span>
                </div>
                
                <select onchange="DashboardComponent.setGlobalFilter('responsible', this.value)" class="input-primary text-sm py-1.5 w-auto">
                    <option value="all" ${DashboardComponent.globalFilters.responsible === 'all' ? 'selected' : ''}>Todos los Responsables</option>
                    ${[...DashboardComponent.allResponsables].sort().map(r => `<option value="${r}" ${DashboardComponent.globalFilters.responsible === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>

                <select onchange="DashboardComponent.setGlobalFilter('priority', this.value)" class="input-primary text-sm py-1.5 w-auto">
                    <option value="all" ${DashboardComponent.globalFilters.priority === 'all' ? 'selected' : ''}>Todas Prioridades</option>
                    <option value="Crítico" ${DashboardComponent.globalFilters.priority === 'Crítico' ? 'selected' : ''}>Crítico</option>
                    <option value="Alta" ${DashboardComponent.globalFilters.priority === 'Alta' ? 'selected' : ''}>Alta</option>
                    <option value="Media" ${DashboardComponent.globalFilters.priority === 'Media' ? 'selected' : ''}>Media</option>
                    <option value="Baja" ${DashboardComponent.globalFilters.priority === 'Baja' ? 'selected' : ''}>Baja</option>
                </select>

                ${(DashboardComponent.globalFilters.priority !== 'all' || DashboardComponent.globalFilters.responsible !== 'all') ?
                `<button onclick="DashboardComponent.clearGlobalFilters()" class="text-xs text-red-500 hover:underline">Limpiar Filtros</button>` : ''}
            </div>

            <!-- Top Area: Global Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Status Distribution -->
                <div class="glass-card p-5 rounded-xl">
                    <h3 class="text-sm font-bold text-gray-700 dark:text-white mb-4">Estado de Tareas</h3>
                    <div class="h-48 relative flex justify-center">
                        <canvas id="globalStatusChart"></canvas>
                    </div>
                </div>

                <!-- Responsible Workload -->
                <div class="glass-card p-5 rounded-xl">
                    <h3 class="text-sm font-bold text-gray-700 dark:text-white mb-4">Carga por Responsable</h3>
                     <div class="h-48 relative">
                        <canvas id="globalResponsibleChart"></canvas>
                    </div>
                </div>

                <!-- Overdue vs Upcoming summary -->
                 <div class="glass-card p-5 rounded-xl flex flex-col justify-center space-y-4">
                    <div class="flex items-center gap-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
                        <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                            <i class="fas fa-exclamation-circle text-2xl"></i>
                        </div>
                        <div>
                            <p class="text-3xl font-bold">${stats.overdueCount}</p>
                            <p class="text-xs font-semibold uppercase opacity-75">Tareas Vencidas</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-yellow-700 dark:text-yellow-300">
                         <div class="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                            <i class="fas fa-clock text-2xl"></i>
                        </div>
                        <div>
                            <p class="text-3xl font-bold">${stats.upcomingCount}</p>
                            <p class="text-xs font-semibold uppercase opacity-75">Vencen pronto (7d)</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Middle Area: Critical Tasks Lists -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Overdue Tasks -->
                <div class="glass-card rounded-xl overflow-hidden flex flex-col h-80">
                    <div class="p-4 border-b border-gray-100 dark:border-slate-700 bg-red-50 dark:bg-red-900/10 flex justify-between items-center">
                        <h3 class="font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                            <i class="fas fa-fire"></i> Tareas Vencidas
                        </h3>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2">
                        ${DashboardComponent.renderTaskList(stats.overdueTasks, 'Sin tareas vencidas 🎉')}
                    </div>
                </div>

                <!-- Upcoming Tasks -->
                <div class="glass-card rounded-xl overflow-hidden flex flex-col h-80">
                    <div class="p-4 border-b border-gray-100 dark:border-slate-700 bg-yellow-50 dark:bg-yellow-900/10 flex justify-between items-center">
                        <h3 class="font-bold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                            <i class="fas fa-hourglass-half"></i> Próximas a Vencer
                        </h3>
                    </div>
                     <div class="flex-1 overflow-y-auto p-2">
                        ${DashboardComponent.renderTaskList(stats.upcomingTasks, 'Nada urgente para los próximos 7 días')}
                    </div>
                </div>
            </div>

            <!-- Bottom Area: Unified Task Manager -->
            ${DashboardComponent.renderCollaboratorManager()}
        `;
    },

    renderTaskList: (tasks, emptyMsg) => {
        if (tasks.length === 0) return `<div class="h-full flex items-center justify-center text-gray-400 text-sm italic">${emptyMsg}</div>`;

        return `
            <table class="w-full text-left border-collapse">
                <tbody>
                    ${tasks.map(t => `
                        <tr class="group hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 hover:z-10 cursor-pointer" onclick="DashboardComponent.openQuickEdit('${t.id}', '${t.projectId}')">
                            <td class="p-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                ${t.text}
                                <div class="text-[10px] text-gray-400 mt-0.5">${t.projectName}</div>
                            </td>
                            <td class="p-3 text-xs text-right whitespace-nowrap">
                                <span class="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                                    ${Utils.formatDate(t.deadline)}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    renderCollaboratorManager: () => {
        // Use collected responsibles from all project configs
        const collaborators = [...DashboardComponent.allResponsables].sort();

        return `
            <div class="glass-card rounded-xl p-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fas fa-users-cog text-brand-500"></i> Gestor Global de Tareas
                    </h3>
                    <!-- Filters moved to top -->
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-50 dark:bg-slate-800/50 text-gray-500 font-semibold uppercase text-xs">
                            <tr>
                                <th class="p-3 rounded-l-lg">Tarea</th>
                                <th class="p-3">Proyecto</th>
                                <th class="p-3">Vencimiento</th>
                                <th class="p-3">Estado</th>
                                <th class="p-3 rounded-r-lg text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="global-manager-body" class="divide-y divide-gray-100 dark:divide-gray-800">
                            <!-- Injected via JS based on filters -->
                        </tbody>
                    </table>
                </div>
                 <div class="text-center mt-4">
                     <button onclick="DashboardComponent.loadMoreGlobalTasks()" id="global-load-more" class="text-sm text-brand-600 hover:text-brand-700 font-medium hidden">
                        Ver más tareas
                     </button>
                </div>
            </div>
        `;
    },

    renderQuickEditModal: () => {
        return `
            <div id="quick-edit-modal" class="fixed inset-0 z-[60] hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity backdrop-blur-sm" onclick="DashboardComponent.closeQuickEdit()"></div>
                <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <div class="relative transform overflow-hidden rounded-lg bg-white dark:bg-slate-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-100 dark:border-slate-700">
                            <div class="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                                <h3 class="text-lg font-bold leading-6 text-gray-900 dark:text-white mb-4" id="modal-title">Editar Tarea</h3>
                                <form id="quick-edit-form" class="space-y-4">
                                    <input type="hidden" id="qe-task-id">
                                    <input type="hidden" id="qe-project-id">
                                    
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarea</label>
                                        <input type="text" id="qe-text" class="input-primary w-full" required>
                                    </div>
                                    
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                                            <select id="qe-status" class="input-primary w-full">
                                                <option value="Pendiente">Pendiente</option>
                                                <option value="En Proceso">En Proceso</option>
                                                <option value="Realizado">Realizado</option>
                                                <option value="Suspendido">Suspendido</option>
                                            </select>
                                        </div>
                                         <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vencimiento</label>
                                            <input type="date" id="qe-deadline" class="input-primary w-full">
                                        </div>
                                    </div>

                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
                                        <select id="qe-responsible" class="input-primary w-full">
                                             <!-- Populated dynamically -->
                                        </select>
                                    </div>
                                    
                                    <!-- Subtasks Section -->
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subtareas</label>
                                        <div id="qe-subtasks-list" class="space-y-2 max-h-40 overflow-y-auto bg-gray-50 dark:bg-slate-900 p-2 rounded border border-gray-100 dark:border-slate-700">
                                            <!-- Injected via JS -->
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                                <button type="button" onclick="DashboardComponent.saveQuickEdit()" class="btn-primary w-full sm:w-auto sm:ml-3">Guardar</button>
                                <button type="button" onclick="DashboardComponent.closeQuickEdit()" class="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-slate-600 sm:mt-0 sm:w-auto">Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // --- Logic & Helpers ---

    // --- Logic & Helpers ---

    setGlobalFilter: (key, value) => {
        DashboardComponent.globalFilters[key] = value;
        // Refresh entire dashboard to update stats and charts
        DashboardComponent.render(document.getElementById('main-content'));
    },

    clearGlobalFilters: () => {
        DashboardComponent.globalFilters = { priority: 'all', responsible: 'all' };
        DashboardComponent.render(document.getElementById('main-content'));
    },

    getFilteredTasks: () => {
        return DashboardComponent.allTasks.filter(t => {
            if (t.estado === 'Realizado' || t.estado === 'Suspendido') return false; // Base filter

            if (DashboardComponent.globalFilters.responsible !== 'all' && t.responsable !== DashboardComponent.globalFilters.responsible) return false;
            if (DashboardComponent.globalFilters.priority !== 'all' && t.prioridad !== DashboardComponent.globalFilters.priority) return false;

            return true;
        });
    },

    calculateGlobalStats: () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        let overdueCount = 0;
        let upcomingCount = 0;
        let overdueTasks = [];
        let upcomingTasks = [];
        let totalPending = 0;

        // Use filtered tasks
        const tasks = DashboardComponent.getFilteredTasks();

        tasks.forEach(t => {
            totalPending++;

            if (!t.deadline) return;

            // Date Parsing
            const [y, m, d] = t.deadline.split('-').map(Number);
            const date = new Date(y, m - 1, d);

            if (date < today) {
                overdueCount++;
                overdueTasks.push(t);
            } else if (date <= nextWeek) {
                upcomingCount++;
                upcomingTasks.push(t);
            }
        });

        // Sort by urgency
        overdueTasks.sort((a, b) => a.deadline.localeCompare(b.deadline));
        upcomingTasks.sort((a, b) => a.deadline.localeCompare(b.deadline));

        return {
            totalPending,
            overdueCount,
            upcomingCount,
            overdueTasks: overdueTasks.slice(0, 10),
            upcomingTasks: upcomingTasks.slice(0, 10)
        };
    },

    renderCharts: () => {
        const tasks = DashboardComponent.getFilteredTasks();

        // Status Chart
        const statusCtx = document.getElementById('globalStatusChart');
        if (statusCtx) {
            const counts = { 'Pendiente': 0, 'En Proceso': 0, 'Realizado': 0, 'Suspendido': 0 };

            // For Status Chart, we usually want to see ALL status distribution, 
            // BUT if we are filtering by Priority/Responsible, we should only show status OF those tasks.
            // My getFilteredTasks excludes 'Realizado'/'Suspendido'. 
            // For key stats ('Pendiente'/'En Proceso'), this is fine.
            // If the user wants to see "How many Realizado" for a person, they can't with current logic (as getFilteredTasks excludes them). 
            // HOWEVER, standard behavior asked is usually "Open Tasks".
            // Let's stick to Open Tasks for now as per "getFilteredTasks".

            tasks.forEach(t => {
                if (counts[t.estado] !== undefined) counts[t.estado]++;
            });

            if (DashboardComponent.chartInstances.status) DashboardComponent.chartInstances.status.destroy();

            DashboardComponent.chartInstances.status = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(counts),
                    datasets: [{
                        data: Object.values(counts),
                        backgroundColor: ['#FBBF24', '#60A5FA', '#2563EB', '#9CA3AF'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true } } }
                }
            });
        }

        // Responsible Chart (Only Pending/Process)
        const respCtx = document.getElementById('globalResponsibleChart');
        if (respCtx) {
            const counts = {};
            tasks.forEach(t => {
                // Already filtered by getFilteredTasks (excludes Resolved/Suspended)
                const r = t.responsable || 'Sin Asignar';
                counts[r] = (counts[r] || 0) + 1;
            });

            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const top = sorted.slice(0, 5);
            if (sorted.length > 5) {
                const others = sorted.slice(5).reduce((acc, curr) => acc + curr[1], 0);
                top.push(['Otros', others]);
            }

            if (DashboardComponent.chartInstances.resp) DashboardComponent.chartInstances.resp.destroy();

            DashboardComponent.chartInstances.resp = new Chart(respCtx, {
                type: 'bar',
                data: {
                    labels: top.map(x => x[0]),
                    datasets: [{
                        label: 'Tareas Pendientes',
                        data: top.map(x => x[1]),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }
                }
            });
        }

        DashboardComponent.filterGlobalManager();
    },

    filterGlobalManager: (limit = 20) => {
        const tbody = document.getElementById('global-manager-body');
        const loadMoreBtn = document.getElementById('global-load-more');
        if (!tbody) return;

        // Use the centralized filtered tasks logic
        let filtered = DashboardComponent.getFilteredTasks();

        /* Removed local DOM reading */

        // Global Sort: Project Name -> Deadline
        filtered.sort((a, b) => {
            const pC = a.projectName.localeCompare(b.projectName);
            if (pC !== 0) return pC;
            if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            if (a.deadline) return -1;
            if (b.deadline) return 1;
            return 0;
        });

        const toShow = filtered.slice(0, limit);
        DashboardComponent.renderGlobalManagerRows(toShow, tbody);

        if (filtered.length > limit) {
            loadMoreBtn.classList.remove('hidden');
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    },

    loadMoreGlobalTasks: () => {
        const tbody = document.getElementById('global-manager-body');
        if (tbody) {
            const currentCount = tbody.children.length;
            DashboardComponent.filterGlobalManager(currentCount + 20);
        }
    },

    renderGlobalManagerRows: (tasks, container) => {
        if (tasks.length === 0) {
            container.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">No hay tareas pendientes para este criterio</td></tr>';
            return;
        }

        const statusColors = {
            'Pendiente': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
            'En Proceso': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
            'Realizado': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        };

        container.innerHTML = tasks.map(t => `
            <tr class="group hover:bg-white dark:hover:bg-slate-700/30 transition-colors">
                <td class="p-3 font-medium text-gray-800 dark:text-gray-200">
                    ${t.text}
                    <div class="text-xs text-brand-600 dark:text-brand-400 block sm:hidden">${t.projectName}</div>
                </td>
                <td class="p-3 text-gray-500 hidden sm:table-cell">${t.projectName}</td>
                <td class="p-3 text-gray-500 text-xs">${t.deadline ? Utils.formatDate(t.deadline) : '-'}</td>
                <td class="p-3">
                     <span class="${statusColors[t.estado] || 'bg-gray-100 text-gray-600'} text-xs px-2 py-1 rounded-full font-medium">
                        ${t.estado}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button onclick="DashboardComponent.openQuickEdit('${t.id}', '${t.projectId}')" class="text-brand-600 hover:text-brand-800 text-sm font-medium hover:underline">
                        Editar
                    </button>
                </td>
            </tr>
        `).join('');
    },

    // --- Quick Edit Modal Logic ---

    openQuickEdit: (taskId, projectId) => {
        const task = DashboardComponent.allTasks.find(t => t.id === taskId && t.projectId === projectId);
        if (!task) return;

        DashboardComponent.currentEditingTask = task;

        document.getElementById('qe-task-id').value = taskId;
        document.getElementById('qe-project-id').value = projectId;
        document.getElementById('qe-text').value = task.text;
        document.getElementById('qe-status').value = task.estado;
        document.getElementById('qe-deadline').value = task.deadline || '';

        // Populate responsibles in modal
        const respSelect = document.getElementById('qe-responsible');
        respSelect.innerHTML = `<option value="">Sin Asignar</option>` +
            [...DashboardComponent.allResponsables].sort().map(r =>
                `<option value="${r}" ${task.responsable === r ? 'selected' : ''}>${r}</option>`
            ).join('');

        // Populate Subtasks
        const stContainer = document.getElementById('qe-subtasks-list');
        if (task.subtasks && task.subtasks.length > 0) {
            stContainer.innerHTML = task.subtasks.map((st, idx) => `
                <label class="flex items-center gap-2 p-1 hover:bg-white dark:hover:bg-slate-800 rounded cursor-pointer">
                    <input type="checkbox" class="qe-subtask-check rounded text-brand-600 focus:ring-brand-500" ${st.done ? 'checked' : ''} data-idx="${idx}">
                    <span class="text-xs text-gray-700 dark:text-gray-300 select-none ${st.done ? 'line-through opacity-60' : ''}">${st.text}</span>
                </label>
            `).join('');
            stContainer.parentElement.classList.remove('hidden');
        } else {
            stContainer.innerHTML = '<p class="text-xs text-gray-400 italic text-center">Sin subtareas</p>';
            stContainer.parentElement.classList.add('hidden'); // Optional: hide if empty? User might want to see there are none. Let's keep it visible but empty msg.
            stContainer.parentElement.classList.remove('hidden');
        }

        document.getElementById('quick-edit-modal').classList.remove('hidden');
    },

    closeQuickEdit: () => {
        document.getElementById('quick-edit-modal').classList.add('hidden');
        DashboardComponent.currentEditingTask = null;
    },

    saveQuickEdit: async () => {
        const taskId = document.getElementById('qe-task-id').value;
        const projectId = document.getElementById('qe-project-id').value;
        const updates = {
            requerimiento: document.getElementById('qe-text').value, // Map back to origin prop
            estado: document.getElementById('qe-status').value,
            deadline: document.getElementById('qe-deadline').value,
            responsable: document.getElementById('qe-responsible').value,
            subtasks: DashboardComponent.currentEditingTask.subtasks || []
        };

        // Update subtask states from UI
        const subtaskChecks = document.querySelectorAll('.qe-subtask-check');
        subtaskChecks.forEach((chk, idx) => {
            if (updates.subtasks[idx]) {
                updates.subtasks[idx].done = chk.checked;
            }
        });

        try {
            await Store.updateTask(projectId, taskId, updates);
            UI.showToast("Tarea actualizada", "success");
            DashboardComponent.closeQuickEdit();
            DashboardComponent.render(document.getElementById('main-content')); // Reload dashboard
        } catch (e) {
            console.error(e);
            UI.showToast("Error al guardar", "error");
        }
    },

    // --- Basic Actions ---

    createNewProject: async () => {
        // Check for templates
        const templates = await Store.getProjectTemplates();

        if (templates.length === 0) {
            // Standard Creation
            const name = prompt("Nombre del Proyecto:");
            if (!name) return;
            try {
                await Store.createProject({ name, description: 'Nuevo proyecto', createdAt: new Date().toISOString() });
                UI.showToast("Proyecto creado exitosamente", "success");
                DashboardComponent.render(document.getElementById('main-content'));
            } catch (e) { UI.showToast("Error al crear proyecto", "error"); }
        } else {
            // Template Selection Modal
            const modalId = 'project-create-modal';
            let modal = document.getElementById(modalId);
            if (!modal) {
                modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                    <h3 class="text-xl font-bold dark:text-white mb-4">Crear Proyecto</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                            <input type="text" id="new-project-name-input" class="input-primary w-full" placeholder="Nombre del proyecto" autofocus>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plantilla</label>
                            <div class="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                <label class="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <input type="radio" name="project-template" value="blank" checked class="text-brand-600 focus:ring-brand-500">
                                    <div>
                                        <div class="font-bold text-sm text-gray-800 dark:text-white">En Blanco</div>
                                        <div class="text-xs text-gray-500">Sin configuración predefinida</div>
                                    </div>
                                </label>
                                ${templates.map(t => `
                                    <label class="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <input type="radio" name="project-template" value="${t.id}" class="text-brand-600 focus:ring-brand-500">
                                        <div>
                                            <div class="font-bold text-sm text-gray-800 dark:text-white">${t.name}</div>
                                            <div class="text-xs text-gray-500">${t.rubros ? t.rubros.length + ' Areas' : ''}</div>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 mt-6">
                        <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-secondary">Cancelar</button>
                        <button id="confirm-create-project" class="btn-primary">Crear</button>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
            document.getElementById('new-project-name-input').focus();

            document.getElementById('confirm-create-project').onclick = async () => {
                const name = document.getElementById('new-project-name-input').value.trim();
                const templateId = document.querySelector('input[name="project-template"]:checked').value;

                if (!name) {
                    UI.showToast("El nombre es requerido", "warning");
                    return;
                }

                try {
                    let projectData = { name, description: 'Nuevo proyecto', createdAt: new Date().toISOString() };

                    // Apply Template Data
                    if (templateId !== 'blank') {
                        const t = templates.find(x => x.id === templateId);
                        if (t) {
                            // We need to pass these to createProject so it initializes defaults correctly
                            projectData.rubros = t.rubros;
                            projectData.responsables = t.responsables;
                        }
                    }

                    await Store.createProject(projectData);
                    UI.showToast("Proyecto creado exitosamente", "success");
                    document.getElementById(modalId).classList.add('hidden');
                    DashboardComponent.render(document.getElementById('main-content'));
                } catch (e) {
                    console.error(e);
                    UI.showToast("Error al crear proyecto", "error");
                }
            };
        }
    },

    deleteProject: async (id) => {
        // PERMISSION CHECK
        try {
            if (Store.currentContext.role !== 'owner') {
                return UI.showToast("Solo el propietario puede eliminar proyectos.", "warning");
            }

            const project = DashboardComponent.projects.find(p => p.id === id);
            const name = project ? project.name : 'ELIMINAR';
            if (await UI.confirm("⚠️ ¿Eliminar proyecto y sus tareas?")) {
                const conf = prompt(`Escribe "${name}" para confirmar:`);
                if (conf === name) {
                    await Store.deleteProject(id);
                    UI.showToast("Proyecto eliminado", "success");
                    DashboardComponent.render(document.getElementById('main-content'));
                }
            }
        } catch (e) { UI.showToast("Error al eliminar", "error"); }
    },

    toggleProjectStatus: async (id, current) => {
        const isArchiving = current !== 'inactive';
        try {
            await Store.updateProject(id, { status: isArchiving ? 'inactive' : 'active' });
            UI.showToast(`Proyecto ${isArchiving ? 'archivado' : 'restaurado'}`, 'success');
            DashboardComponent.render(document.getElementById('main-content'));
        } catch (e) { UI.showToast("Error al actualizar estado", "error"); }
    },

    toggleViewArchived: () => {
        DashboardComponent.viewArchived = !DashboardComponent.viewArchived;
        DashboardComponent.render(document.getElementById('main-content'));
    },

    // --- Admin & Config Features ---

    editCompanyName: () => {
        // Simple prompt for now, could be persisted in User Profile
        // Since we don't have a dedicated "Company" object in the specified architecture,
        // we'll store it in localStorage for this browser as a lightweight solution,
        // or effectively we would need a proper User Profile store.
        // Given constraints, we'll just update the UI locally for the session/local.
        const current = document.getElementById('company-name-display').textContent;
        const name = prompt("Nombre de la Empresa / Panel:", current);
        if (name) {
            document.getElementById('company-name-display').textContent = name;
            localStorage.setItem('nexus_company_name', name);
        }
    },

    switchContext: async () => {
        const isCurrentlyAdmin = Store.currentContext.role === 'admin';
        const target = isCurrentlyAdmin ? 'personal' : 'admin';

        Store.switchContext(target);

        const msg = target === 'admin' ? "Cambiando a Espacio de Administración..." : "Cambiando a Espacio Personal...";
        UI.showToast(msg, 'info');

        // Small delay to feel the transition
        setTimeout(() => {
            DashboardComponent.render(document.getElementById('main-content'));
        }, 500);
    },

    // --- Workspace Switcher ---
    openWorkspaceSwitcher: async () => {
        const user = Auth.getCurrentUser();
        const workspaces = Store.currentContext.availableWorkspaces;
        const modalId = 'workspace-switcher-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        // Fetch names for all owner IDs to show "Empresa X" instead of UID
        // Optimistic UI: Show UIDs first or "Cargando..." then update?
        // Let's resolve names first (fast enough usually)

        let listHtml = '';
        for (const ws of workspaces) {
            let name = 'Mi Espacio Personal';
            if (ws.type === 'admin') {
                // Fetch name
                try {
                    const snap = await db.ref(`users/${ws.ownerId}/config/companyName`).once('value');
                    name = snap.val() || `Espacio de ${ws.ownerId.slice(0, 6)}...`;
                } catch (e) { name = 'Espacio Desconocido'; }
            }

            const isActive = ws.ownerId === Store.currentContext.ownerId;
            listHtml += `
                <button onclick="Store.switchContext('${ws.ownerId}'); document.getElementById('${modalId}').classList.add('hidden');" 
                        class="w-full text-left p-4 rounded-xl border ${isActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'} transition-all mb-3 flex items-center justify-between group">
                    <div>
                        <p class="font-bold text-gray-900 dark:text-white ${isActive ? 'text-brand-700 dark:text-brand-400' : ''}">${name}</p>
                        <p class="text-xs text-gray-500 uppercase tracking-wider">${ws.type === 'personal' ? 'Propietario' : 'Administrador'}</p>
                    </div>
                    ${isActive ? '<i class="fas fa-check-circle text-brand-500 text-xl"></i>' : '<i class="fas fa-arrow-right text-gray-300 group-hover:text-brand-500 transition-colors"></i>'}
                </button>
            `;
        }

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Selecciona un Espacio</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>
                <div class="max-h-[60vh] overflow-y-auto">
                    ${listHtml}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    manageProjects: () => {
        const modalId = 'manage-projects-modal';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove(); // Always refreshing

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);

        const order = DashboardComponent.projectSettings.order || [];
        const hidden = DashboardComponent.projectSettings.hidden || {};

        // Ensure all projects are in the list
        const activeProjects = DashboardComponent.projects.filter(p => p.status !== 'inactive');

        // Sort for Modal based on current order
        activeProjects.sort((a, b) => {
            const idxA = order.indexOf(a.id);
            const idxB = order.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            return 1;
        });

        modal.innerHTML = `
             <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Configurar Proyectos</h3>
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <p class="text-sm text-gray-500 mb-4">Ordena y oculta los proyectos que no quieres ver en la barra lateral.</p>

                <div class="space-y-2 max-h-[60vh] overflow-y-auto mb-6" id="manage-proj-list">
                    ${activeProjects.map((p, index) => `
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-100 dark:border-slate-600">
                            <div class="flex items-center gap-3">
                                <div class="flex flex-col gap-1">
                                    <button onclick="DashboardComponent.moveProject('${p.id}', -1)" class="text-gray-400 hover:text-brand-500 ${index === 0 ? 'invisible' : ''}"><i class="fas fa-chevron-up text-xs"></i></button>
                                    <button onclick="DashboardComponent.moveProject('${p.id}', 1)" class="text-gray-400 hover:text-brand-500 ${index === activeProjects.length - 1 ? 'invisible' : ''}"><i class="fas fa-chevron-down text-xs"></i></button>
                                </div>
                                <span class="font-medium text-gray-700 dark:text-gray-200">${p.name}</span>
                            </div>
                            <button onclick="DashboardComponent.toggleProjectVisibility('${p.id}')" class="p-2 ${hidden[p.id] ? 'text-gray-300' : 'text-brand-600'} hover:bg-gray-200 rounded">
                                <i class="fas fa-${hidden[p.id] ? 'eye-slash' : 'eye'}"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>

                <div class="flex justify-end">
                    <button onclick="document.getElementById('${modalId}').remove(); DashboardComponent.render(document.getElementById('main-content'));" class="btn-primary">Listo</button>
                </div>
            </div>
        `;
    },

    moveProject: (id, direction) => {
        let order = DashboardComponent.projectSettings.order || [];
        // If order is empty/partial, initialize it with current full list
        const activeIds = DashboardComponent.projects.filter(p => p.status !== 'inactive').map(p => p.id);
        if (order.length < activeIds.length) {
            // merge existing order with missing ids
            const missing = activeIds.filter(i => !order.includes(i));
            order = [...order, ...missing];
        }

        const idx = order.indexOf(id);
        if (idx === -1) return;

        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= order.length) return;

        // Swap
        [order[idx], order[newIdx]] = [order[newIdx], order[idx]];

        DashboardComponent.projectSettings.order = order;
        localStorage.setItem('nexus_project_settings', JSON.stringify(DashboardComponent.projectSettings));
        DashboardComponent.manageProjects(); // Re-render modal
    },

    toggleProjectVisibility: (id) => {
        const hidden = DashboardComponent.projectSettings.hidden || {};
        if (hidden[id]) {
            delete hidden[id];
        } else {
            hidden[id] = true;
        }
        DashboardComponent.projectSettings.hidden = hidden;
        localStorage.setItem('nexus_project_settings', JSON.stringify(DashboardComponent.projectSettings));
        DashboardComponent.manageProjects(); // Re-render modal
    },

    manageAdmins: async () => {
        // Only Owner check
        if (Store.currentContext.role !== 'owner') {
            return UI.showToast("Acceso restringido al Propietario.", "error");
        }

        const admins = await Store.getAdmins();
        const modalId = 'manage-admins-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        const renderAdminList = () => {
            return admins.length === 0 ? '<p class="text-gray-400 italic text-center text-sm py-4">No hay administradores definidos</p>' :
                admins.map(a => `
                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-100 dark:border-slate-600 mb-2">
                    <div>
                        <div class="font-bold text-gray-800 dark:text-white text-sm">${a.email}</div>
                        <div class="text-xs text-gray-500">Agregado: ${new Date(a.addedAt).toLocaleDateString()}</div>
                    </div>
                    <button onclick="DashboardComponent.removeAdmin('${a.email}')" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors" title="Eliminar acceso"><i class="fas fa-trash"></i></button>
                </div>
             `).join('');
        };

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white flex items-center gap-2"><i class="fas fa-user-shield text-brand-500"></i> Administradores</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 text-sm text-blue-800 dark:text-blue-200">
                    <p class="mb-1"><strong><i class="fas fa-info-circle"></i> Importante:</strong></p>
                    <ul class="list-disc ml-4 space-y-1 text-xs">
                        <li>Los administradores tendrán acceso completo a tus proyectos.</li>
                        <li>Podrán crear, editar y archivar proyectos y tareas.</li>
                        <li><strong>No podrán eliminar</strong> proyectos.</li>
                    </ul>
                </div>

                <div class="space-y-2 max-h-60 overflow-y-auto mb-6" id="admins-list-container">
                    ${renderAdminList()}
                </div>

                <div class="border-t border-gray-100 dark:border-slate-700 pt-4">
                    <h4 class="text-sm font-bold text-gray-700 dark:text-white mb-2">Agregar Administrador</h4>
                    <form id="add-admin-form" class="flex gap-2">
                        <input type="email" id="new-admin-email" placeholder="email@gmail.com" class="input-primary flex-1 text-sm" required>
                        <button type="submit" class="btn-primary text-sm whitespace-nowrap"><i class="fas fa-plus"></i></button>
                    </form>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        document.getElementById('add-admin-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('new-admin-email').value.trim();
            if (!email) return;

            try {
                await Store.addAdmin(email);
                UI.showToast(`Administrador ${email} agregado`, "success");
                document.getElementById(modalId).classList.add('hidden');
                DashboardComponent.manageAdmins(); // Refresh
            } catch (err) {
                UI.showToast(err.message || "Error al agregar", "error");
            }
        };
    },

    removeAdmin: async (email) => {
        if (await UI.confirm(`¿Quitar acceso a ${email}?`)) {
            try {
                await Store.removeAdmin(email);
                UI.showToast("Acceso revocado", "success");
                document.getElementById('manage-admins-modal').classList.add('hidden');
                DashboardComponent.manageAdmins(); // Refresh
            } catch (err) {
                UI.showToast("Error al eliminar", "error");
            }
        }
    },

    // --- Template Management ---

    manageTemplates: async () => {
        const templates = await Store.getProjectTemplates();
        const modalId = 'manage-templates-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        const renderTemplatesList = () => {
            return templates.length === 0 ? '<p class="text-gray-400 italic text-center text-sm py-4">No hay plantillas creadas</p>' :
                templates.map(t => `
                <div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-100 dark:border-slate-600">
                    <div>
                        <h4 class="font-bold text-gray-800 dark:text-white text-sm">${t.name}</h4>
                        <p class="text-xs text-gray-500">${t.rubros?.length || 0} Areas, ${t.responsables?.length || 0} Resp.</p>
                    </div>
                    <button onclick="DashboardComponent.deleteTemplate('${t.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><i class="fas fa-trash"></i></button>
                </div>
             `).join('');
        };

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white">Plantillas de Proyecto</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div class="space-y-2 max-h-60 overflow-y-auto mb-6" id="templates-list-container">
                    ${renderTemplatesList()}
                </div>

                <div class="border-t border-gray-100 dark:border-slate-700 pt-4">
                    <h4 class="text-sm font-bold text-gray-700 dark:text-white mb-2">Crear Nueva Plantilla</h4>
                    <p class="text-xs text-gray-500 mb-3">Define la estructura base para nuevos proyectos.</p>
                    
                    <form id="create-template-form" class="space-y-3">
                        <input type="text" id="new-template-name" placeholder="Nombre de la Plantilla" class="input-primary w-full text-sm" required>
                        
                        <div class="grid grid-cols-2 gap-2">
                             <div>
                                <label class="text-xs font-semibold text-gray-500 uppercase">Areas (sep. coma)</label>
                                <textarea id="new-template-rubros" class="input-primary w-full text-xs" rows="3">Area 1, Area 2, Realizados</textarea>
                             </div>
                             <div>
                                <label class="text-xs font-semibold text-gray-500 uppercase">Responsables (sep. coma)</label>
                                <textarea id="new-template-resps" class="input-primary w-full text-xs" rows="3">Admin, Colaborador</textarea>
                             </div>
                        </div>

                        <button type="submit" class="btn-primary w-full text-sm">Guardar Plantilla</button>
                    </form>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        document.getElementById('create-template-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-template-name').value.trim();
            const rubrosStr = document.getElementById('new-template-rubros').value;
            const respsStr = document.getElementById('new-template-resps').value;

            if (!name) return;

            const rubros = rubrosStr.split(',').map(s => s.trim()).filter(s => s);
            // Ensure 'Realizados' and 'Eliminado'
            if (!rubros.includes('Realizados')) rubros.push('Realizados');
            if (!rubros.includes('Eliminado')) rubros.push('Eliminado');

            const responsables = respsStr.split(',').map(s => s.trim()).filter(s => s);

            try {
                await Store.createProjectTemplate({ name, rubros, responsables });
                UI.showToast("Plantilla creada", "success");
                document.getElementById(modalId).classList.add('hidden');
                DashboardComponent.manageTemplates(); // Re-open/Refresh
            } catch (err) {
                UI.showToast("Error al guardar plantilla", "error");
            }
        };
    },

    deleteTemplate: async (id) => {
        if (await UI.confirm("¿Eliminar esta plantilla?")) {
            await Store.deleteProjectTemplate(id);
            document.getElementById('manage-templates-modal').classList.add('hidden');
            DashboardComponent.manageTemplates(); // Refresh
        }
    },

    showIntegrations: async () => {
        const container = document.querySelector('#dashboard-main-scroll > div');
        container.innerHTML = `
            <div class="flex items-center justify-center h-64">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
        `;
        try {
            container.innerHTML = await IntegrationsComponent.render();
        } catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-red-500">Error cargando integraciones</p>';
        }
    }
};
