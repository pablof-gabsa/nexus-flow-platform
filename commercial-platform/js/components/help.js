const HelpComponent = {
    currentSection: 'intro',

    render: async (container) => {
        const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
        const backLink = user ? '#/dashboard' : '#/';

        container.innerHTML = `
            <div class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-brand-500 selection:text-white pb-20 flex flex-col md:flex-row">
                
                <!-- Sidebar Navigation (Desktop) -->
                <aside class="fixed md:sticky top-0 z-40 w-full md:w-64 h-auto md:h-screen bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-gray-200 dark:border-slate-800 transition-transform">
                    <div class="h-16 flex items-center px-6 border-b border-gray-100 dark:border-slate-800">
                        <img src="assets/logo.jpg" class="h-8 w-8 rounded-lg mr-3" onerror="this.style.display='none'">
                        <span class="font-bold text-lg">Ayuda Nexus</span>
                    </div>

                    <div class="p-4 overflow-y-auto h-[calc(100vh-4rem)]">
                        <div class="space-y-1">
                            <button onclick="HelpComponent.scrollToSection('intro')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                                <i class="fas fa-home w-5 text-center mr-2"></i> Introducción
                            </button>
                            <button onclick="HelpComponent.scrollToSection('dashboard')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <i class="fas fa-th-large w-5 text-center mr-2"></i> Dashboard
                            </button>
                            <button onclick="HelpComponent.scrollToSection('projects')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <i class="fas fa-project-diagram w-5 text-center mr-2"></i> Proyectos
                            </button>
                            <button onclick="HelpComponent.scrollToSection('tasks')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <i class="fas fa-check-circle w-5 text-center mr-2"></i> Tareas
                            </button>
                             <button onclick="HelpComponent.scrollToSection('analytics')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <i class="fas fa-chart-line w-5 text-center mr-2"></i> Estadísticas
                            </button>
                            <button onclick="HelpComponent.scrollToSection('import-export')" class="help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                <i class="fas fa-file-export w-5 text-center mr-2"></i> Importar / Exportar
                            </button>
                        </div>

                        <div class="mt-8 pt-8 border-t border-gray-100 dark:border-slate-800">
                             <a href="${backLink}" class="flex items-center text-sm font-semibold text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors px-4">
                                <i class="fas fa-arrow-left w-5 text-center mr-2"></i> Volver a la App
                            </a>
                        </div>
                    </div>
                </aside>

                <!-- Content Area -->
                <main class="flex-1 min-w-0 overflow-y-auto h-screen scroll-smooth">
                    <div class="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-20">
                        
                        <!-- 1. Intro -->
                        <section id="help-intro" class="scroll-mt-24">
                            <h1 class="text-4xl font-extrabold text-slate-900 dark:text-white mb-6">Documentación de Nexus Flow</h1>
                            <p class="text-xl text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                                Bienvenido al centro de ayuda oficial. Aquí encontrarás todo lo necesario para dominar la plataforma de gestión de proyectos, desde la creación de tu primera tarea hasta la generación de reportes avanzados.
                            </p>
                            
                            <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-2xl p-6">
                                <h3 class="flex items-center text-lg font-bold text-blue-800 dark:text-blue-300 mb-2">
                                    <i class="fas fa-info-circle mr-2"></i> ¿Nuevo en Nexus Flow?
                                </h3>
                                <p class="text-blue-700 dark:text-blue-200">
                                    Si acabas de llegar, te recomendamos empezar por crear una cuenta gratuita con Google o probar el <strong class="underline decoration-wavy">Modo Demo</strong> para explorar sin compromiso.
                                </p>
                            </div>
                        </section>

                        <!-- 2. Dashboard -->
                        <section id="help-dashboard" class="scroll-mt-24">
                            <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                                <span class="bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 rounded-lg w-10 h-10 flex items-center justify-center text-xl"><i class="fas fa-th-large"></i></span>
                                Dashboard Principal
                            </h2>
                            <p class="text-gray-600 dark:text-gray-300 mb-6">
                                El Dashboard es tu centro de comando. Desde aquí tienes una vista panorámica de todos tus proyectos activos.
                            </p>
                            
                            <div class="rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-slate-700 mb-8 group">
                                <img src="assets/help/dashboard_mockup.png" alt="Vista del Dashboard" class="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform duration-500" onerror="this.src='https://via.placeholder.com/800x450?text=Dashboard+Overview'">
                            </div>

                            <ul class="space-y-4 text-gray-600 dark:text-gray-300">
                                <li class="flex gap-3">
                                    <i class="fas fa-check text-green-500 mt-1"></i>
                                    <div><strong>Mis Proyectos:</strong> Grilla con tarjetas de cada proyecto. Muestra el estado general y progreso.</div>
                                </li>
                                <li class="flex gap-3">
                                    <i class="fas fa-check text-green-500 mt-1"></i>
                                    <div><strong>Nuevo Proyecto:</strong> Botón principal para iniciar una nueva obra o gestión.</div>
                                </li>
                                <li class="flex gap-3">
                                    <i class="fas fa-check text-green-500 mt-1"></i>
                                    <div><strong>Buscador Global:</strong> Encuentra tareas o proyectos por nombre instantáneamente.</div>
                                </li>
                            </ul>
                        </section>

                        <!-- 3. Projects -->
                        <section id="help-projects" class="scroll-mt-24">
                            <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                                <span class="bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-lg w-10 h-10 flex items-center justify-center text-xl"><i class="fas fa-project-diagram"></i></span>
                                Gestión de Proyectos
                            </h2>
                            
                            <div class="grid md:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <p class="text-gray-600 dark:text-gray-300 mb-4">
                                        Dentro de un proyecto, las tareas se organizan por <strong>Rubros</strong> (Áreas). Puedes personalizar estos rubros según tu necesidad (ej: Cimentación, Estructura, Acabados).
                                    </p>
                                    <h4 class="font-bold text-gray-800 dark:text-white mb-2">Barra de Herramientas</h4>
                                    <ul class="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-6">
                                        <li><strong class="text-brand-600">Config:</strong> Edita los Rubros y añade Responsables.</li>
                                        <li><strong class="text-brand-600">Filtros:</strong> Visualiza solo tareas pendientes, críticas o de cierto responsable.</li>
                                        <li><strong class="text-brand-600">PDF:</strong> Genera un reporte imprimible del estado actual.</li>
                                    </ul>
                                </div>
                                <div class="rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-slate-700">
                                    <img src="assets/help/project_view_mockup.png" alt="Vista de Proyecto" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=Project+View'">
                                </div>
                            </div>
                        </section>

                        <!-- 4. Tasks -->
                        <section id="help-tasks" class="scroll-mt-24">
                            <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                                <span class="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 rounded-lg w-10 h-10 flex items-center justify-center text-xl"><i class="fas fa-check-circle"></i></span>
                                Creación y Edición de Tareas
                            </h2>

                            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-1 mb-8">
                                <img src="assets/help/task_modal_mockup.png" alt="Modal de Tarea" class="w-full rounded-lg" onerror="this.src='https://via.placeholder.com/800x500?text=Task+Editor+Modal'">
                            </div>

                            <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                    <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-flag text-red-500"></i> Prioridad</h4>
                                    <p class="text-sm text-gray-500">Define la urgencia: Baja, Media, Alta o Crítico. Las tareas críticas aparecen resaltadas.</p>
                                </div>
                                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                    <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-list-ul text-blue-500"></i> Checklist</h4>
                                    <p class="text-sm text-gray-500">Divide una tarea compleja en subtareas más pequeñas para un mejor seguimiento.</p>
                                </div>
                                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                    <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-paperclip text-gray-500"></i> Adjuntos</h4>
                                    <p class="text-sm text-gray-500">Sube imágenes de referencia o evidencia (Max 10MB por imagen).</p>
                                </div>
                                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                    <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-clock text-amber-500"></i> H/H y Costo</h4>
                                    <p class="text-sm text-gray-500">Registra Horas Hombre estimadas vs ejecutadas y el costo monetario asociado.</p>
                                </div>
                                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                    <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-sync text-purple-500"></i> Repetición</h4>
                                    <p class="text-sm text-gray-500">Configura tareas recurrentes (ej: Mantenimiento mensual) que se duplican automáticamente.</p>
                                </div>
                            </div>
                        </section>

                         <!-- 5. Analytics -->
                         <section id="help-analytics" class="scroll-mt-24">
                            <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                                <span class="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-lg w-10 h-10 flex items-center justify-center text-xl"><i class="fas fa-chart-pie"></i></span>
                                Análisis y Estadísticas
                            </h2>
                            <p class="text-gray-600 dark:text-gray-300 mb-6">
                                Toma decisiones basadas en datos reales. Nexus Flow calcula automáticamente el progreso de tu proyecto.
                            </p>
                            
                            <div class="grid md:grid-cols-2 gap-8 items-center">
                                <div class="rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-slate-700">
                                    <img src="assets/help/stats_mockup.png" alt="Estadísticas" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=Analytics+Charts'">
                                </div>
                                <div class="space-y-4">
                                    <div class="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/10">
                                        <h4 class="font-bold text-blue-900 dark:text-white">Progreso Global</h4>
                                        <p class="text-sm text-blue-800 dark:text-blue-200">Basado en el porcentaje de tareas completadas vs total.</p>
                                    </div>
                                    <div class="p-4 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/10">
                                        <h4 class="font-bold text-amber-900 dark:text-white">Estado de Tareas</h4>
                                        <p class="text-sm text-amber-800 dark:text-amber-200">Visualiza rápidamente cuántas tareas están pendientes, en proceso o atrasadas.</p>
                                    </div>
                                    <div class="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/10">
                                        <h4 class="font-bold text-red-900 dark:text-white">Control de Vencimientos</h4>
                                        <p class="text-sm text-red-800 dark:text-red-200">Alerta inmediata de tareas cuya fecha límite ha pasado.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- 6. Import/Export -->
                        <section id="help-import-export" class="scroll-mt-24 border-t border-gray-200 dark:border-slate-800 pt-12">
                             <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                                <span class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg w-10 h-10 flex items-center justify-center text-xl"><i class="fas fa-file-csv"></i></span>
                                Importación y Exportación
                            </h2>

                            <div class="grid md:grid-cols-2 gap-6">
                                <div class="glass-card p-6 rounded-xl">
                                    <h3 class="font-bold text-lg mb-3 flex items-center gap-2"><i class="fas fa-file-excel text-green-600"></i> Importar Excel</h3>
                                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                        Carga masivamente tareas desde un archivo Excel.
                                    </p>
                                    <ol class="list-decimal list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                        <li>Ve a Configuración > Descargar Plantilla.</li>
                                        <li>Llenar los datos respetando las columnas.</li>
                                        <li>Subir el archivo en Configuración > Importar.</li>
                                    </ol>
                                </div>

                                <div class="glass-card p-6 rounded-xl">
                                    <h3 class="font-bold text-lg mb-3 flex items-center gap-2"><i class="fas fa-file-export text-indigo-600"></i> Integración Octavo Piso</h3>
                                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                        Exporta tareas específicas para el módulo de reclamos.
                                    </p>
                                    <ol class="list-decimal list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                        <li>Activa la integración en el menú principal.</li>
                                        <li>En el proyecto, habilita "Modo Selección".</li>
                                        <li>Elige las tareas y exporta.</li>
                                    </ol>
                                </div>
                            </div>
                        </section>

                    </div>
                </main>
            </div>
            
        `;
    },

    scrollToSection: (id) => {
        const el = document.getElementById('help-' + id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
            // Update active state
            document.querySelectorAll('.help-nav-item').forEach(btn => {
                // Reset all to default style
                btn.className = 'help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors';
            });

            // Highlight the clicked button (we'll just use a simple heuristic matching the ID)
            // Ideally we'd pass 'this' or the event, but for now we trust the user clicks the buttons we rendered.
            // Since we can't easily get the specific button element without passing it, we will just rely on the scroll for now.
            // Or better, let's find the button that calls this function with this ID.
            const clickedBtn = document.querySelector(`button[onclick="HelpComponent.scrollToSection('${id}')"]`);
            if (clickedBtn) {
                clickedBtn.className = 'help-nav-item w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300';
            }
        }
    }
};
