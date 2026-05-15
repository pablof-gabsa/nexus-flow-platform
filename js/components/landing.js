const LandingComponent = {
    render: async (container) => {
        let user = null;
        try {
            if (typeof Auth !== 'undefined') user = Auth.getCurrentUser();
        } catch (e) { console.warn('Auth check failed', e); }

        const ctaLink = user ? '#/dashboard' : '#/login';
        const ctaText = user ? 'Ir a mi espacio' : 'Ingresar con Google';

        window.startDemo = () => {
            if (confirm('AVISO DE DEMO\n\nEsta entrando en modo DEMO.\n- La informacion se guarda solo en este dispositivo.\n- Si borra el cache, perdera los datos.\n- La demo es valida por 30 dias.\n\nDesea continuar?')) {
                localStorage.setItem('nexus_demo_mode', 'true');
                localStorage.setItem('nexus_demo_start', new Date().toISOString());
                const demoUser = { uid: 'demo-local', displayName: 'Usuario Demo', email: 'demo@local', photoURL: null, isDemo: true };
                localStorage.setItem('nexus_user', JSON.stringify(demoUser));
                window.location.hash = '#/dashboard';
                window.location.reload();
            }
        };

        const featureItems = [
            { icon: 'fa-list-check', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300', title: 'Tareas con contexto', copy: 'Responsables, fechas, prioridades, adjuntos, subtareas y estados visibles en una sola linea de trabajo.' },
            { icon: 'fa-boxes-stacked', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300', title: 'Activos vinculados', copy: 'Relaciona equipos, espacios o recursos con sus tareas de mantenimiento y documentos.' },
            { icon: 'fa-chart-line', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300', title: 'Metricas utiles', copy: 'Tableros de avance, vencimientos y costos para tomar decisiones sin perseguir planillas.' },
            { icon: 'fa-share-nodes', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300', title: 'Colaboracion controlada', copy: 'Comparte proyectos con permisos claros para equipos, clientes o administradores.' }
        ];

        const workflowItems = [
            ['01', 'Crear proyecto', 'Carga areas, responsables y tareas iniciales.'],
            ['02', 'Coordinar avance', 'Cada usuario actualiza estados, adjuntos y observaciones.'],
            ['03', 'Medir y reportar', 'Exporta PDF, Excel o revisa metricas en vivo.']
        ];

        container.innerHTML = `
            <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0f172a] dark:text-white font-sans selection:bg-brand-500 selection:text-white">
                <nav class="fixed inset-x-0 top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
                    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                        <button onclick="window.location.hash = '#/'" class="flex items-center gap-3 text-left">
                            <img src="assets/nexus_logo_v3.png" class="h-9 w-9 rounded-lg shadow-sm" alt="Nexus Flow" onerror="this.src='assets/logo.jpg'">
                            <span class="text-xl font-bold tracking-tight text-slate-950 dark:text-white">Nexus Flow</span>
                        </button>

                        <div class="flex items-center gap-2 sm:gap-3">
                            <a href="#/help" class="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white sm:inline-flex">Ayuda</a>
                            <button onclick="window.startDemo()" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                Demo local
                            </button>
                            <a href="${ctaLink}" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700">
                                ${user ? 'Entrar' : 'Iniciar sesion'}
                            </a>
                        </div>
                    </div>
                </nav>

                <header class="relative isolate overflow-hidden border-b border-slate-200 bg-slate-950 pt-16 text-white dark:border-slate-800">
                    <div class="absolute inset-0 opacity-95">
                        <div class="absolute inset-0 bg-[linear-gradient(110deg,rgba(15,23,42,0.94),rgba(15,23,42,0.74)_44%,rgba(30,64,175,0.72))]"></div>
                        <div class="absolute inset-y-12 right-[-120px] hidden w-[760px] rotate-[-7deg] rounded-lg border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/40 lg:block">
                            <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
                                <div>
                                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">Gabsa</p>
                                    <p class="text-lg font-bold">Mantenimiento general</p>
                                </div>
                                <div class="flex gap-2 text-xs">
                                    <span class="rounded bg-emerald-500/15 px-2 py-1 text-emerald-200">En fecha</span>
                                    <span class="rounded bg-amber-500/15 px-2 py-1 text-amber-200">3 proximas</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-[160px_1fr] gap-0">
                                <aside class="border-r border-white/10 p-4 text-sm text-slate-300">
                                    <div class="mb-3 rounded bg-white/10 px-3 py-2 text-white">Administracion</div>
                                    <div class="mb-3 rounded bg-blue-500/20 px-3 py-2 text-blue-100">Mantenimiento</div>
                                    <div class="rounded px-3 py-2">Infraestructura</div>
                                </aside>
                                <main class="space-y-3 p-4">
                                    ${[
                                        ['Limpieza edificio administracion', 'En proceso', '13/05/2026', 'bg-blue-500/20 text-blue-100'],
                                        ['Reparacion bomba N 2', 'Alta', '21/05/2026', 'bg-rose-500/20 text-rose-100'],
                                        ['Service 250H tractor CFC 404', 'Pendiente', '09/07/2026', 'bg-amber-500/20 text-amber-100'],
                                        ['Control de tableros electricos', 'Realizado', '12/05/2026', 'bg-emerald-500/20 text-emerald-100']
                                    ].map(row => `
                                        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3">
                                            <span class="truncate text-sm font-semibold text-white">${row[0]}</span>
                                            <span class="rounded px-2 py-1 text-xs font-bold ${row[3]}">${row[1]}</span>
                                            <span class="text-xs text-slate-300">${row[2]}</span>
                                        </div>
                                    `).join('')}
                                </main>
                            </div>
                        </div>
                    </div>

                    <div class="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8 lg:py-24">
                        <div class="max-w-3xl">
                            <div class="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-blue-100">
                                <i class="fas fa-shield-halved text-emerald-300"></i>
                                Gestion operativa para equipos que trabajan en campo y oficina
                            </div>

                            <h1 class="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                                Nexus Flow
                                <span class="block text-blue-200">ordena proyectos, tareas y activos sin ruido.</span>
                            </h1>

                            <p class="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
                                Un tablero simple para coordinar responsables, vencimientos, archivos, reportes y permisos compartidos desde cualquier dispositivo.
                            </p>

                            <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                                <a href="${ctaLink}" class="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-bold text-slate-950 shadow-lg shadow-black/20 transition hover:bg-blue-50">
                                    ${ctaText}
                                    <i class="fas fa-arrow-right text-brand-600"></i>
                                </a>
                                <button onclick="window.startDemo()" class="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-base font-bold text-white transition hover:bg-white/15">
                                    <i class="fas fa-laptop"></i>
                                    Probar demo
                                </button>
                            </div>
                        </div>

                        <div class="grid content-end gap-3 lg:pt-16">
                            <div class="grid grid-cols-3 gap-3">
                                <div class="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur">
                                    <p class="text-2xl font-extrabold">24/7</p>
                                    <p class="mt-1 text-xs text-slate-300">Acceso web</p>
                                </div>
                                <div class="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur">
                                    <p class="text-2xl font-extrabold">PDF</p>
                                    <p class="mt-1 text-xs text-slate-300">Reportes</p>
                                </div>
                                <div class="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur">
                                    <p class="text-2xl font-extrabold">PWA</p>
                                    <p class="mt-1 text-xs text-slate-300">Instalable</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <section class="bg-white py-14 dark:bg-[#0f172a]">
                    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div class="grid gap-8 lg:grid-cols-[360px_1fr]">
                            <div>
                                <p class="text-sm font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">Operacion diaria</p>
                                <h2 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">Diseñado para ejecutar, no para decorar.</h2>
                                <p class="mt-4 text-slate-600 dark:text-slate-300">La landing ahora refleja el producto: claridad, control y velocidad para equipos con muchas tareas abiertas.</p>
                            </div>

                            <div class="grid gap-4 sm:grid-cols-2">
                                ${featureItems.map(item => `
                                    <article class="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                                        <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${item.color}">
                                            <i class="fas ${item.icon}"></i>
                                        </div>
                                        <h3 class="text-lg font-bold text-slate-950 dark:text-white">${item.title}</h3>
                                        <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">${item.copy}</p>
                                    </article>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </section>

                <section class="border-y border-slate-200 bg-slate-100 py-14 dark:border-slate-800 dark:bg-slate-950">
                    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div class="grid gap-4 md:grid-cols-3">
                            ${workflowItems.map(item => `
                                <article class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                                    <span class="text-sm font-black text-brand-600 dark:text-brand-300">${item[0]}</span>
                                    <h3 class="mt-3 text-xl font-bold text-slate-950 dark:text-white">${item[1]}</h3>
                                    <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">${item[2]}</p>
                                </article>
                            `).join('')}
                        </div>
                    </div>
                </section>

                <section class="bg-white py-16 dark:bg-[#0f172a]">
                    <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
                        <div>
                            <h2 class="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">Listo para ordenar el proximo proyecto.</h2>
                            <p class="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">Entra con Google o usa la demo local para revisar el flujo completo antes de cargar datos reales.</p>
                        </div>
                        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                            <a href="${ctaLink}" class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 font-bold text-white transition hover:bg-brand-700">${ctaText}</a>
                            <button onclick="window.startDemo()" class="inline-flex items-center justify-center rounded-lg border border-slate-200 px-6 py-3 font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Demo local</button>
                        </div>
                    </div>
                </section>

                <footer class="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row lg:px-8">
                        <div class="flex items-center gap-3">
                            <img src="assets/nexus_logo_v3.png" class="h-8 w-8 rounded-lg" alt="Nexus Flow" onerror="this.src='assets/logo.jpg'">
                            <span class="font-bold text-slate-950 dark:text-white">Nexus Flow</span>
                        </div>
                        <p class="text-sm text-slate-500 dark:text-slate-400">&copy; 2026 Nexus Flow Systems. Todos los derechos reservados.</p>
                    </div>
                </footer>
            </div>
        `;
    }
};
