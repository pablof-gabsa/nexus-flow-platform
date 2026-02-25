const DashboardComponent = {
    currentView: 'overview', // overview, projects, tasks, stats, users
    viewArchived: false,
    projects: [],
    allTasks: [],
    admins: [],
    allResponsables: new Set(),

    chartInstances: {},
    currentEditingTask: null,
    globalFilters: {
        priority: 'all',
        responsible: 'all',
        status: 'active'
    },
    projectSettings: (() => {
        try {
            return JSON.parse(localStorage.getItem('nexus_project_settings')) || { order: [], hidden: {} };
        } catch (e) {
            console.warn("Error parsing project settings, resetting to defaults", e);
            return { order: [], hidden: {} };
        }
    })(),

    render: async (container, params) => {
        // Handle View Param
        if (params && params.get('view')) {
            DashboardComponent.currentView = params.get('view');
        }

        // Show loading state

        container.innerHTML = `
            ${NavbarComponent.render()}
            <div class="flex h-[calc(100vh-64px)]">
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
                </div>
            </div>
        `;

        // 1. Fetch Resources (Only if not already loaded or forced refresh needed? For now always fetch to be safe)
        try {
            DashboardComponent.projects = await Store.getProjects();
            // Fetch all active projects for global stats
            const projectsToFetch = DashboardComponent.projects.filter(p => true);

            // Fetch Admins if needed for Users view
            if (DashboardComponent.currentView === 'users' && (Store.currentContext.role === 'owner' || Store.currentContext.role === 'admin')) {
                try {
                    DashboardComponent.admins = await Store.getAdmins();
                } catch (e) {
                    console.warn("Could not fetch admins", e);
                    DashboardComponent.admins = [];
                }
            }


            DashboardComponent.allTasks = [];
            DashboardComponent.allResponsables.clear();

            await Promise.all(projectsToFetch.map(async (p) => {
                // We fetch ALL data to ensure Global Stats are accurate, 
                // regardless of whether the project is currently 'visible' in the active list.


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

                    // Update project stats
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

        container.innerHTML = `
            ${navbar}
            <div class="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 overflow-hidden">
                <!-- Sidebar -->
                <aside class="w-20 lg:w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-all duration-300 z-20">
                    ${DashboardComponent.renderSidebarContent()}
                </aside>

                <!-- Main Content -->
                <div class="flex-1 overflow-y-auto min-w-0 p-4 lg:p-8 relative" id="dashboard-main-scroll">
                    <div class="max-w-7xl mx-auto space-y-6 pb-20">
                        ${DashboardComponent.renderCurrentView()}
                    </div>
                </div>
            </div>
            
            <!-- Quick Edit Modal -->
            ${DashboardComponent.renderQuickEditModal()}
        `;

        // 3. Init Charts if in stats view or overview
        setTimeout(() => {
            if (DashboardComponent.currentView === 'overview' || DashboardComponent.currentView === 'stats') {
                DashboardComponent.renderCharts();
            }
            if (DashboardComponent.currentView === 'tasks') {
                DashboardComponent.filterGlobalManager();
            }
            if (DashboardComponent.currentView === 'integrations') {
                // Async render for Integrations
                const container = document.getElementById('integrations-view-container');
                if (container && window.IntegrationsComponent) {
                    container.innerHTML = '<div class="flex justify-center p-20"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>';
                    // We need to wait a tick or just call it.
                    // IntegrationsComponent.render() is async and returns HTML string.
                    IntegrationsComponent.render().then(html => {
                        container.innerHTML = html;
                    }).catch(err => {
                        container.innerHTML = `<div class="p-10 text-center text-red-500">Error cargando integraciones: ${err.message}</div>`;
                    });
                }
            }
        }, 100);

    },

    switchView: (viewName) => {
        DashboardComponent.currentView = viewName;
        DashboardComponent.render(document.getElementById('main-content'));
    },

    renderSidebarContent: () => {
        const views = [
            { id: 'overview', icon: 'th-large', label: 'Resumen' },
            { id: 'projects', icon: 'project-diagram', label: 'Proyectos' },
            { id: 'tasks', icon: 'tasks', label: 'Tareas Globales' },
            { id: 'stats', icon: 'chart-pie', label: 'Estadísticas' },
            { id: 'integrations', icon: 'plug', label: 'Integraciones' },
        ];

        // Add Admin view only if owner/admin
        if (Store.currentContext.role === 'owner' || Store.currentContext.role === 'admin') {
            views.push({ id: 'users', icon: 'users-cog', label: 'Usuarios' });
        }

        return `
            <div class="flex flex-col h-full py-6">
                <nav class="space-y-2 px-2 flex-1">
                    ${views.map(v => `
                        <button onclick="DashboardComponent.switchView('${v.id}')" 
                            class="w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group
                            ${DashboardComponent.currentView === v.id
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 font-bold shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white'
            }">
                            <i class="fas fa-${v.icon} text-xl w-6 text-center transition-colors ${DashboardComponent.currentView === v.id ? '' : 'group-hover:text-brand-500'}"></i>
                            <span class="hidden lg:block text-sm">${v.label}</span>
                            
                            ${v.id === 'tasks' ? `
                                <span class="hidden lg:flex ml-auto bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    ${DashboardComponent.allTasks.filter(t => t.estado === 'Pendiente').length}
                                </span>
                            ` : ''}
                        </button>
                    `).join('')}
                </nav>

                <div class="px-4 mt-auto space-y-2">
                    <button onclick="DashboardComponent.createNewProject()" class="w-full flex items-center justify-center lg:justify-start gap-3 bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 rounded-xl transition-all shadow-md hover:shadow-lg group">
                        <i class="fas fa-plus text-lg"></i>
                        <span class="hidden lg:block font-medium">Nuevo Proyecto</span>
                    </button>
                    
                     <div class="pt-4 border-t border-gray-100 dark:border-slate-700 hidden lg:block">
                        <p class="text-xs text-center text-gray-400">Nexus Flow v3.2</p>
                    </div>
                </div>
            </div>
        `;
    },

    renderCurrentView: () => {
        switch (DashboardComponent.currentView) {
            case 'projects': return DashboardComponent.renderActiveProjectsView();
            case 'tasks': return DashboardComponent.renderGlobalTasksView();
            case 'stats': return DashboardComponent.renderStatsView();
            case 'integrations': return DashboardComponent.renderIntegrationsView();
            case 'users': return DashboardComponent.renderUserManagementView();
            case 'overview':
            default: return DashboardComponent.renderOverviewView();
        }
    },

    renderOverviewView: () => {
        const stats = DashboardComponent.calculateGlobalStats();

        // Welcome Message & Context Switcher
        return `
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <span class="bg-gradient-to-r from-brand-600 to-brand-400 text-transparent bg-clip-text">Hola, ${Store.currentContext.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
                    </h1>
                    <p class="text-gray-500 dark:text-gray-400 mt-1">
                        Aquí tienes el resumen de tu actividad hoy.
                         ${Store.currentContext.availableWorkspaces.length > 1 ?
                `<button onclick="DashboardComponent.openWorkspaceSwitcher()" class="text-brand-600 hover:underline font-medium ml-2 text-sm">
                                <i class="fas fa-exchange-alt"></i> Cambiar Espacio
                             </button>` : ''
            }
                    </p>
                </div>
                <div class="flex gap-2">
                     <div class="text-right">
                        <p class="text-2xl font-bold text-brand-600">${stats.totalPending}</p>
                        <p class="text-xs text-gray-400 uppercase font-semibold">Pendientes</p>
                    </div>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <!-- Active Projects -->
                <div class="glass-card p-5 rounded-2xl flex items-center justify-between cursor-pointer hover:shadow-md transition-all" onclick="DashboardComponent.switchView('projects')">
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Proyectos Activos</p>
                        <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">${DashboardComponent.projects.filter(p => p.status !== 'inactive' && !DashboardComponent.projectSettings?.hidden?.[p.id]).length}</p>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <i class="fas fa-project-diagram text-xl"></i>
                    </div>
                </div>

                <!-- Critical Tasks -->
                <div class="glass-card p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Tareas Críticas</p>
                        <p class="text-3xl font-bold text-red-600 mt-1">${stats.overdueCount}</p>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400">
                        <i class="fas fa-exclamation-triangle text-xl"></i>
                    </div>
                </div>

                <!-- Upcoming -->
                <div class="glass-card p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Vencen Pronto</p>
                        <p class="text-3xl font-bold text-amber-500 mt-1">${stats.upcomingCount}</p>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 dark:text-amber-400">
                        <i class="fas fa-clock text-xl"></i>
                    </div>
                </div>

                 <!-- Team -->
                <div class="glass-card p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Equipo</p>
                        <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">${DashboardComponent.allResponsables.size}</p>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                        <i class="fas fa-users text-xl"></i>
                    </div>
                </div>
            </div>

            <!-- Dashboard Charts & Lists Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Left Col: Charts -->
                <div class="lg:col-span-2 space-y-8">
                    <!-- Global Charts Preview -->
                    <div class="glass-card p-6 rounded-2xl">
                        <div class="flex justify-between items-center mb-6">
                            <h3 class="font-bold text-lg text-gray-900 dark:text-white">Estado General</h3>
                            <button onclick="DashboardComponent.switchView('stats')" class="text-brand-600 text-sm hover:underline">Ver reporte completo</button>
                        </div>
                        <div class="grid md:grid-cols-2 gap-6">
                            <div class="h-48 relative"><canvas id="globalStatusChart"></canvas></div>
                             <div class="h-48 relative"><canvas id="globalResponsibleChart"></canvas></div>
                        </div>
                    </div>

                    <!-- Overdue Tasks List -->
                    <div class="glass-card p-6 rounded-2xl">
                         <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg text-red-600 flex items-center gap-2"><i class="fas fa-fire"></i> Atención Requerida</h3>
                        </div>
                        <div class="overflow-y-auto max-h-60">
                             ${DashboardComponent.renderTaskList(stats.overdueTasks, '¡Excelente! No hay tareas vencidas.')}
                        </div>
                    </div>
                </div>

                <!-- Right Col: Quick Actions / Recent/ Upcoming -->
                <div class="space-y-8">
                     <div class="glass-card p-6 rounded-2xl">
                        <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-4">Próximos Vencimientos</h3>
                        <div class="overflow-y-auto max-h-[400px]">
                           ${DashboardComponent.renderTaskList(stats.upcomingTasks, 'Nada urgente para los próximos 7 días')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderActiveProjectsView: () => {
        const activeProjects = DashboardComponent.projects.filter(p => p.status !== 'inactive');
        const archivedProjects = DashboardComponent.projects.filter(p => p.status === 'inactive');

        // Filter Hidden & Sort
        let list = DashboardComponent.viewArchived ? archivedProjects : activeProjects;

        if (!DashboardComponent.viewArchived) {
            const hidden = DashboardComponent.projectSettings?.hidden || {};
            const order = DashboardComponent.projectSettings?.order || [];

            // 1. Filter
            list = list.filter(p => !hidden[p.id]);

            // 2. Sort - Alphabetical Order enforced
            list.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
        }

        return `
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                        ${DashboardComponent.viewArchived ? 'Proyectos Archivados' : 'Proyectos Activos'}
                    </h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Gestiona tus obras y contratos en curso</p>
                </div>
                <div class="flex gap-2">
                     ${!DashboardComponent.viewArchived ? `
                        <button onclick="DashboardComponent.manageProjects()" class="btn-secondary text-sm" title="Configurar Visibilidad y Orden">
                            <i class="fas fa-cog mr-2"></i> Configurar
                        </button>
                     ` : ''}
                     <button onclick="DashboardComponent.toggleViewArchived()" class="btn-secondary text-sm">
                        <i class="fas fa-${DashboardComponent.viewArchived ? 'box-open' : 'archive'} mr-2"></i>
                        ${DashboardComponent.viewArchived ? 'Ver Activos' : 'Ver Archivados'}
                    </button>
                    <button onclick="DashboardComponent.createNewProject()" class="btn-primary text-sm">
                        <i class="fas fa-plus mr-2"></i> Nuevo Proyecto
                    </button>
                </div>
            </div>

            ${list.length === 0 ? `
                <div class="text-center py-20">
                    <div class="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <i class="fas fa-folder-open text-3xl"></i>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">No hay proyectos ${DashboardComponent.viewArchived ? 'archivados' : 'activos'}</h3>
                    <p class="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-2">
                        ${DashboardComponent.viewArchived ? 'Los proyectos que archives aparecerán aquí.' : 'Comienza creando tu primer proyecto para gestionar tareas.'}
                    </p>
                </div>
            ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${list.map(p => `
                        <div class="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group border border-transparent hover:border-brand-200 dark:hover:border-brand-900 relative">
                             <div class="p-5 cursor-pointer" onclick="App.navigateTo('#/project/${p.id}')">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-lg font-bold">
                                        ${p.name.charAt(0).toUpperCase()}
                                    </div>
                                    
                                     <div class="relative z-10" onclick="event.stopPropagation()">
                                        <button onclick="DashboardComponent.toggleProjectStatus('${p.id}', '${p.status}')" class="text-gray-400 hover:text-brand-600 p-1" title="${p.status === 'inactive' ? 'Restaurar' : 'Archivar'}">
                                            <i class="fas fa-${p.status === 'inactive' ? 'box-open' : 'box-archive'}"></i>
                                        </button>
                                        ${Store.currentContext.role === 'owner' ? `
                                        <button onclick="DashboardComponent.deleteProject('${p.id}')" class="text-gray-400 hover:text-red-600 p-1 ml-1" title="Eliminar Proyecto">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                        ` : ''}
                                     </div>
                                </div>
                                
                                <h3 class="font-bold text-gray-900 dark:text-white text-lg mb-1 truncate">${p.name}</h3>
                                 ${(p.description && p.description !== 'Nuevo proyecto' && p.description !== 'Sin descripción') ? `
                                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">${p.description}</p>
                                 ` : ''}
                                
                                <div class="space-y-2">
                                    <div class="flex justify-between text-xs text-gray-500">
                                        <span>Progreso</span>
                                        <span>${p.progress || 0}%</span>
                                    </div>
                                    <div class="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                                        <div class="bg-brand-500 h-2 rounded-full transition-all duration-500" style="width: ${p.progress || 0}%"></div>
                                    </div>
                                </div>

                                <div class="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700/50 flex justify-end">
                                     <span class="text-xs text-gray-400">Creado: ${new Date(p.createdAt).toLocaleDateString()}</span>
                                </div>
                             </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
    },

    renderGlobalTasksView: () => {
        return `
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión Global de Tareas</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Visualiza, filtra y gestiona tareas de todos los proyectos en un solo lugar.</p>
                </div>
            </div>

            ${DashboardComponent.renderGlobalFilters()}

            ${DashboardComponent.renderCollaboratorManager()}
        `;
    },

    renderStatsView: () => {
        return `
            <div class="flex justify-between items-center mb-6">
                 <div>
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Estadísticas y Métricas</h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Análisis detallado del rendimiento de proyectos y equipo.</p>
                </div>
            </div>

            ${DashboardComponent.renderGlobalFilters()}

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-6">Distribución de Estado</h3>
                    <div class="h-64 relative"><canvas id="globalStatusChart"></canvas></div>
                </div>
                 <div class="glass-card p-6 rounded-2xl">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-6">Carga de Trabajo por Responsable</h3>
                    <div class="h-64 relative"><canvas id="globalResponsibleChart"></canvas></div>
                </div>
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-6">Tareas por Prioridad</h3>
                    <div class="h-64 relative"><canvas id="globalPriorityChart"></canvas></div>
                </div>
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-6">Pendientes por Proyecto</h3>
                    <div class="h-64 relative"><canvas id="globalProjectChart"></canvas></div>
                </div>
            </div>

             <div class="glass-card p-6 rounded-2xl">
                 <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-4">Métricas Clave</h3>
                 <p class="text-gray-500 italic">Más métricas detalladas próximamente...</p>
            </div>
        `;
    },
    renderIntegrationsView: () => {
        return `
            <div id="integrations-view-container" class="min-h-[400px]">
                <!-- Loading State injected by render() -->
            </div>
        `;
    },

    renderUserManagementView: () => {
        if (Store.currentContext.role !== 'owner' && Store.currentContext.role !== 'admin') {
            return `<div class="p-10 text-center text-red-500">Acceso Denegado</div>`;
        }

        const admins = DashboardComponent.admins || [];

        return `
             <div class="flex justify-between items-center mb-8">
                <div>
                     <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <i class="fas fa-users-cog text-brand-500"></i> Gestión de Usuarios
                    </h2>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Administra quién tiene acceso al panel y sus permisos.</p>
                </div>
                 <button onclick="DashboardComponent.manageAdmins()" class="btn-primary">
                    <i class="fas fa-plus mr-2"></i> Nuevo Administrador
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div class="lg:col-span-2 space-y-6">
                    <div class="glass-card overflow-hidden rounded-2xl">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-gray-50 dark:bg-slate-800/50 text-gray-500 font-semibold uppercase text-xs border-b border-gray-100 dark:border-slate-700">
                                <tr>
                                    <th class="p-4">Usuario</th>
                                    <th class="p-4">Rol</th>
                                    <th class="p-4">Fecha Agregado</th>
                                    <th class="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                                <!-- Owner Row (Always First) -->
                                <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors bg-brand-50/50 dark:bg-brand-900/10">
                                    <td class="p-4 font-medium text-gray-900 dark:text-white">
                                        <div class="flex items-center gap-3">
                                             <div class="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-white dark:ring-slate-800">
                                                <i class="fas fa-crown text-[10px]"></i>
                                             </div>
                                             ${Store.currentContext.role === 'owner' ? Auth.getCurrentUser().email + ' (Tú)' : 'Propietario del Espacio'}
                                        </div>
                                    </td>
                                    <td class="p-4 text-brand-600 font-bold">Propietario</td>
                                    <td class="p-4 text-gray-400 text-xs italic">Permanente</td>
                                    <td class="p-4 text-right">
                                         <span class="text-gray-300 cursor-not-allowed" title="No se puede eliminar"><i class="fas fa-lock"></i></span>
                                    </td>
                                </tr>

                                ${admins.map(a => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td class="p-4 font-medium text-gray-900 dark:text-white">
                                            <div class="flex items-center gap-3">
                                                 <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 font-bold text-xs">
                                                    ${a.email.charAt(0).toUpperCase()}
                                                 </div>
                                                 ${a.email}
                                            </div>
                                        </td>
                                        <td class="p-4 text-gray-500">Administrador</td>
                                        <td class="p-4 text-gray-500">${new Date(a.addedAt).toLocaleDateString()}</td>
                                        <td class="p-4 text-right">
                                             <button onclick="DashboardComponent.removeAdmin('${a.email}')" class="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Revocar Acceso">
                                                <i class="fas fa-trash-alt"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${admins.length === 0 ? `
                                    <tr><td colspan="4" class="p-8 text-center text-gray-400 italic text-xs">No hay administradores adicionales.</td></tr>
                                ` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="glass-card p-6 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                        <h3 class="font-bold text-blue-800 dark:text-blue-300 mb-2"><i class="fas fa-info-circle"></i> Roles y Permisos</h3>
                        <ul class="space-y-3 text-sm text-blue-900 dark:text-blue-200 opacity-80">
                            <li class="flex gap-2">
                                <i class="fas fa-check mt-1 text-xs"></i>
                                <span><strong>Propietario</strong>: Acceso total, facturación y eliminar proyectos.</span>
                            </li>
                            <li class="flex gap-2">
                                <i class="fas fa-check mt-1 text-xs"></i>
                                <span><strong>Administrador</strong>: Puede ver, crear y editar todos los proyectos, pero no eliminarlos.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    },

    renderGlobalFilters: () => {
        return `
            <div class="glass-card p-4 rounded-xl flex flex-wrap items-center gap-4 mb-6">
                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <i class="fas fa-filter text-brand-500"></i>
                    <span class="font-medium text-sm">Filtros Globales:</span>
                </div>
                
                <select onchange="DashboardComponent.setGlobalFilter('status', this.value)" class="input-primary text-sm py-1.5 w-auto">
                    <option value="active" ${DashboardComponent.globalFilters.status === 'active' ? 'selected' : ''}>Activas (Pend/Proc)</option>
                    <option value="all" ${DashboardComponent.globalFilters.status === 'all' ? 'selected' : ''}>Todas</option>
                    <option value="Pendiente" ${DashboardComponent.globalFilters.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="En Proceso" ${DashboardComponent.globalFilters.status === 'En Proceso' ? 'selected' : ''}>En Proceso</option>
                    <option value="Realizado" ${DashboardComponent.globalFilters.status === 'Realizado' ? 'selected' : ''}>Realizado</option>
                    <option value="Suspendido" ${DashboardComponent.globalFilters.status === 'Suspendido' ? 'selected' : ''}>Suspendido</option>
                </select>

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
        DashboardComponent.globalFilters = { priority: 'all', responsible: 'all', status: 'active' };
        DashboardComponent.render(document.getElementById('main-content'));
    },

    getFilteredTasks: () => {
        const hidden = DashboardComponent.projectSettings?.hidden || {};

        return DashboardComponent.allTasks.filter(t => {
            // 1. Visibility Filter (By Project)
            if (hidden[t.projectId]) return false;

            // 2. Status Filter
            const sFilter = DashboardComponent.globalFilters.status || 'active'; // Default safety

            if (sFilter === 'active') {
                if (t.estado === 'Realizado' || t.estado === 'Suspendido') return false;
            } else if (sFilter !== 'all') {
                // Specific status
                if (t.estado !== sFilter) return false;
            }
            // if 'all', logic passes (no return false based on status)

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

        // --- NEW CHARTS ---

        // Priority Chart
        const prioCtx = document.getElementById('globalPriorityChart');
        if (prioCtx) {
            const counts = { 'Crítico': 0, 'Alta': 0, 'Media': 0, 'Baja': 0 };
            tasks.forEach(t => {
                // Only count pending/process for priority urgency
                if (t.estado !== 'Realizado' && t.estado !== 'Suspendido') {
                    if (counts[t.prioridad] !== undefined) counts[t.prioridad]++;
                    else counts['Media']++; // Default fallback
                }
            });

            if (DashboardComponent.chartInstances.prio) DashboardComponent.chartInstances.prio.destroy();

            DashboardComponent.chartInstances.prio = new Chart(prioCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(counts),
                    datasets: [{
                        data: Object.values(counts),
                        backgroundColor: ['#EF4444', '#F97316', '#FBBF24', '#10B981'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } },
                    cutout: '70%'
                }
            });
        }

        // Project Chart (Bar)
        const projCtx = document.getElementById('globalProjectChart');
        if (projCtx) {
            const counts = {};
            tasks.forEach(t => {
                if (t.estado !== 'Realizado' && t.estado !== 'Suspendido') {
                    counts[t.projectName] = (counts[t.projectName] || 0) + 1;
                }
            });

            // Sort by count
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

            if (DashboardComponent.chartInstances.proj) DashboardComponent.chartInstances.proj.destroy();

            DashboardComponent.chartInstances.proj = new Chart(projCtx, {
                type: 'bar',
                data: {
                    labels: sorted.map(x => x[0]),
                    datasets: [{
                        label: 'Pendientes',
                        data: sorted.map(x => x[1]),
                        backgroundColor: '#8B5CF6',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } },
                        y: { beginAtZero: true }
                    }
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

        // Global Sort: Deadline -> Project Name
        filtered.sort((a, b) => {
            // 1. Deadline (Earliest first)
            // Handle limits: if one has deadline and other doesn't
            if (a.deadline && !b.deadline) return -1; // a comes first
            if (!a.deadline && b.deadline) return 1;  // b comes first

            // Both have deadline?
            if (a.deadline && b.deadline) {
                const dC = a.deadline.localeCompare(b.deadline);
                if (dC !== 0) return dC;
            }

            // Fallback (or if neither has deadline): Sort by Project Name
            return a.projectName.localeCompare(b.projectName);
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
                await Store.createProject({ name, description: '', createdAt: new Date().toISOString() });
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
                            <div class="mt-2 text-right">
                                <button onclick="document.getElementById('${modalId}').classList.add('hidden'); DashboardComponent.manageTemplates()" class="text-xs text-brand-600 hover:text-brand-800 hover:underline">
                                    <i class="fas fa-cog"></i> Gestionar Plantillas
                                </button>
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
                    let projectData = { name, description: '', createdAt: new Date().toISOString() };

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

        const order = DashboardComponent.projectSettings?.order || [];
        const hidden = DashboardComponent.projectSettings?.hidden || {};

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

        if (!DashboardComponent.projectSettings) DashboardComponent.projectSettings = { order: [], hidden: {} };
        DashboardComponent.projectSettings.order = order;
        localStorage.setItem('nexus_project_settings', JSON.stringify(DashboardComponent.projectSettings));
        DashboardComponent.manageProjects(); // Re-render modal
    },

    toggleProjectVisibility: (id) => {
        const hidden = DashboardComponent.projectSettings?.hidden || {};
        if (hidden[id]) {
            delete hidden[id];
        } else {
            hidden[id] = true;
        }
        if (!DashboardComponent.projectSettings) DashboardComponent.projectSettings = { order: [], hidden: {} };
        DashboardComponent.projectSettings.hidden = hidden;
        localStorage.setItem('nexus_project_settings', JSON.stringify(DashboardComponent.projectSettings));
        DashboardComponent.manageProjects(); // Re-render modal
    },

    manageAdmins: async () => {
        // Only Owner check
        if (Store.currentContext.role !== 'owner') {
            return UI.showToast("Acceso restringido al Propietario.", "error");
        }

        const modalId = 'manage-admins-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm hidden flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold dark:text-white flex items-center gap-2"><i class="fas fa-user-plus text-brand-500"></i> Agregar Administrador</h3>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 text-sm text-blue-800 dark:text-blue-200">
                    <p class="mb-1"><strong><i class="fas fa-info-circle"></i> Importante:</strong></p>
                    <ul class="list-disc ml-4 space-y-1 text-xs">
                        <li>El administrador tendrá acceso completo a tus proyectos.</li>
                        <li>Podrá crear, editar y archivar proyectos y tareas.</li>
                    </ul>
                </div>

                <div class="pt-0">
                    <form id="add-admin-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                            <input type="email" id="new-admin-email" placeholder="usuario@ejemplo.com" class="input-primary w-full" required autofocus>
                        </div>
                        <div class="flex justify-end gap-2">
                             <button type="button" onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-secondary">Cancelar</button>
                             <button type="submit" class="btn-primary">Agregar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        document.getElementById('new-admin-email').focus();

        document.getElementById('add-admin-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('new-admin-email').value.trim();
            if (!email) return;

            try {
                await Store.addAdmin(email);
                UI.showToast(`Administrador ${email} agregado`, "success");
                document.getElementById(modalId).classList.add('hidden');
                DashboardComponent.render(document.getElementById('main-content')); // Refresh full view
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

                // Safety check: only hide if it exists and is not already hidden (though hide usually doesn't throw, 
                // but let's be sure we're not causing TypeErrors)
                const modal = document.getElementById('manage-admins-modal');
                if (modal) modal.classList.add('hidden');

                // Correct Refresh: render the full main content to update the table
                DashboardComponent.render(document.getElementById('main-content'));
            } catch (err) {
                console.error(err);
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
                    <div class="flex gap-1">
                        <button onclick="DashboardComponent.editTemplate('${t.id}')" class="text-brand-600 hover:bg-brand-50 p-2 rounded-full transition-colors"><i class="fas fa-edit"></i></button>
                        <button onclick="DashboardComponent.deleteTemplate('${t.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><i class="fas fa-trash"></i></button>
                    </div>
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
                        <input type="hidden" id="template-id">
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

                        <button type="submit" id="btn-save-template" class="btn-primary w-full text-sm">Guardar Plantilla</button>
                        <button type="button" id="btn-cancel-edit" onclick="DashboardComponent.resetTemplateForm()" class="btn-secondary w-full text-sm hidden">Cancelar Edición</button>
                    </form>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        document.getElementById('create-template-form').onsubmit = async (e) => {
            e.preventDefault();
            const templateId = document.getElementById('template-id').value;
            const name = document.getElementById('new-template-name').value.trim();
            const rubrosStr = document.getElementById('new-template-rubros').value;
            const respsStr = document.getElementById('new-template-resps').value;

            if (!name) return;

            const rubros = rubrosStr.split(',').map(s => s.trim()).filter(s => s);
            // Ensure 'Realizados' and 'Eliminado'
            if (!rubros.includes('Realizados')) rubros.push('Realizados');
            if (!rubros.includes('Eliminado')) rubros.push('Eliminado');

            const responsables = respsStr.split(',').map(s => s.trim()).filter(s => s);

            if (templateId) {
                // Update
                try {
                    await Store.updateProjectTemplate(templateId, { name, rubros, responsables });
                    UI.showToast("Plantilla actualizada", "success");
                    DashboardComponent.manageTemplates(); // Refresh
                } catch (err) {
                    UI.showToast("Error al actualizar", "error");
                }
            } else {
                // Create
                try {
                    await Store.createProjectTemplate({ name, rubros, responsables });
                    UI.showToast("Plantilla creada", "success");
                    DashboardComponent.manageTemplates(); // Refresh
                } catch (err) {
                    UI.showToast("Error al guardar plantilla", "error");
                }
            }
        };
    },

    editTemplate: (id) => {
        // Find existing data
        // We need to fetch again or access local closure 'templates' if we are lucky... 
        // properly we should refetch or store in Component
        Store.getProjectTemplates().then(templates => {
            const t = templates.find(x => x.id === id);
            if (!t) return;

            document.getElementById('template-id').value = t.id;
            document.getElementById('new-template-name').value = t.name;
            document.getElementById('new-template-rubros').value = (t.rubros || []).join(', ');
            document.getElementById('new-template-resps').value = (t.responsables || []).join(', ');

            document.getElementById('btn-save-template').textContent = "Actualizar Plantilla";
            document.getElementById('btn-cancel-edit').classList.remove('hidden');
        });
    },

    resetTemplateForm: () => {
        document.getElementById('create-template-form').reset();
        document.getElementById('template-id').value = '';
        document.getElementById('btn-save-template').textContent = "Guardar Plantilla";
        document.getElementById('btn-cancel-edit').classList.add('hidden');
    },

    deleteTemplate: async (id) => {
        if (await UI.confirm("¿Eliminar esta plantilla?")) {
            await Store.deleteProjectTemplate(id);
            document.getElementById('manage-templates-modal').classList.add('hidden');
            DashboardComponent.manageTemplates(); // Refresh
        }
    },


};
