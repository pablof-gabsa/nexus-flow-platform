const HelpComponent = {
    render: async (container) => {
        // Simple navigation tailored for the help page context
        const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
        const backLink = user ? '#/dashboard' : '#/';
        const backText = user ? 'Volver al Dashboard' : 'Volver al Inicio';

        container.innerHTML = `
            <div class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-brand-500 selection:text-white pb-20">
                
                <!-- Navbar -->
                <nav class="fixed w-full z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-800">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="flex justify-between items-center h-16">
                            <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.hash = '${backLink}'">
                                <img src="assets/logo.jpg" class="h-8 w-8 rounded-lg" onerror="this.style.display='none'">
                                <span class="font-bold text-xl">Nexus Flow <span class="text-brand-500 font-normal">| Ayuda</span></span>
                            </div>
                            <a href="${backLink}" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
                                <i class="fas fa-arrow-left mr-2"></i>${backText}
                            </a>
                        </div>
                    </div>
                </nav>

                <!-- Content -->
                <div class="max-w-4xl mx-auto px-4 pt-28 sm:px-6 lg:px-8">
                    
                    <div class="text-center mb-12">
                        <h1 class="text-4xl font-extrabold mb-4 text-slate-900 dark:text-white">Centro de Ayuda</h1>
                        <p class="text-xl text-gray-500 dark:text-gray-400">Todo lo que necesitas saber para gestionar tus proyectos con éxito.</p>
                    </div>

                    <div class="grid gap-8">

                        <!-- Section 1: Primeros Pasos -->
                        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8">
                            <h2 class="text-2xl font-bold mb-6 flex items-center gap-3 text-brand-600 dark:text-brand-400">
                                <i class="fas fa-rocket"></i> Primeros Pasos
                            </h2>
                            <div class="space-y-4">
                                <div>
                                    <h3 class="font-bold text-lg mb-2">1. Crear una Cuenta</h3>
                                    <p class="text-gray-600 dark:text-gray-300">
                                        Puedes registrarte usando tu cuenta de Google para guardar tus datos en la nube.
                                        Alternativamente, puedes usar el <strong>Modo Demo</strong> sin registrarte.
                                    </p>
                                </div>
                                <div class="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r">
                                    <p class="text-amber-800 dark:text-amber-200 text-sm">
                                        <strong>⚠ Importante sobre el Modo Demo:</strong> Los datos se guardan solo en tu navegador (LocalStorage). Si borras el caché o cambias de navegador, perderás tus proyectos. ¡Úsalo solo para probar!
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Section 2: Gestión de Proyectos -->
                        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8">
                            <h2 class="text-2xl font-bold mb-6 flex items-center gap-3 text-blue-600 dark:text-blue-400">
                                <i class="fas fa-project-diagram"></i> Gestión de Proyectos
                            </h2>
                            <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                                <strong>Nota:</strong> El Dashboard principal es para el propietario de la cuenta. Los colaboradores y clientes acceden individualmente a los proyectos que se les han compartido.
                            </div>
                            <ul class="space-y-6">
                                <li class="flex gap-4">
                                    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold">1</div>
                                    <div>
                                        <h4 class="font-bold">Nuevo Proyecto</h4>
                                        <p class="text-gray-600 dark:text-gray-300 mt-1">Desde el Dashboard, haz clic en "+ Nuevo Proyecto". Asigna un nombre al proyecto.</p>
                                    </div>
                                </li>
                                <li class="flex gap-4">
                                    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold">2</div>
                                    <div>
                                        <h4 class="font-bold">Configuración (Rubros y Responsables)</h4>
                                        <p class="text-gray-600 dark:text-gray-300 mt-1">
                                            Dentro de un proyecto, usa el botón <strong>"Config"</strong> en la barra superior para editar los Rubros (Categorías) y las personas Responsables.
                                            También puedes editarlos directamente al crear una tarea usando el icono <i class="fas fa-cog text-gray-400"></i>.
                                        </p>
                                    </div>
                                </li>
                                <li class="flex gap-4">
                                    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold">3</div>
                                    <div>
                                        <h4 class="font-bold">Compartir</h4>
                                        <p class="text-gray-600 dark:text-gray-300 mt-1">
                                            Genera un enlace público de solo lectura para compartir el avance con clientes sin darles acceso a editar.
                                        </p>
                                    </div>
                                </li>
                            </ul>
                        </div>

                        <!-- Section 3: Tareas -->
                        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8">
                            <h2 class="text-2xl font-bold mb-6 flex items-center gap-3 text-green-600 dark:text-green-400">
                                <i class="fas fa-check-circle"></i> Tareas y Subtareas
                            </h2>
                            <div class="space-y-4">
                                <p class="text-gray-600 dark:text-gray-300">
                                    Las tareas son el corazón de Nexus Flow. Cada tarea puede tener:
                                </p>
                                <ul class="list-disc list-inside text-gray-600 dark:text-gray-300 ml-4 space-y-2">
                                    <li><strong>Estado:</strong> Pendiente, En Proceso, Realizado, Suspendido.</li>
                                    <li><strong>Prioridad:</strong> Baja, Media, Alta (afecta el orden visual).</li>
                                    <li><strong>Vencimiento:</strong> Fecha límite para completar la tarea.</li>
                                    <li><strong>Repetición:</strong> Tareas que se repiten diaria, semanal o mensualmente.</li>
                                    <li><strong>Subtareas:</strong> Divide una tarea compleja en pasos más pequeños.</li>
                                </ul>
                                <div class="mt-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <h4 class="font-bold mb-2"><i class="fas fa-bolt text-yellow-500"></i> Edición Rápida</h4>
                                    <p class="text-sm text-gray-600 dark:text-gray-300">
                                        Desde el Dashboard global, puedes usar el botón de editar (lápiz) para modificar una tarea sin entrar al proyecto.
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Footer Help -->
                    <div class="mt-12 text-center text-gray-500 pb-10">
                        <p>¿Tienes más dudas? Contáctanos en <a href="mailto:soporte@nexusflow.com" class="text-brand-600 hover:underline">soporte@nexusflow.com</a></p>
                    </div>

                </div>
            </div>
        `;
    }
};
