const LandingComponent = {
    render: async (container) => {
        let user = null;
        try {
            if (typeof Auth !== 'undefined') user = Auth.getCurrentUser();
        } catch (e) { console.warn("Auth check failed", e); }

        const ctaLink = user ? '#/dashboard' : '#/login';
        const ctaText = user ? 'Ir a mi Espacio' : 'Comenzar con Google';

        // Demo Logic Wrapper
        window.startDemo = () => {
            if (confirm("⚠️ AVISO DE DEMO ⚠️\n\nEstá entrando en modo DEMO.\n- Su información se guardará SOLO en este dispositivo (LocalStorage).\n- Si borra el caché o cierra sesión, perderá los datos.\n- La demo es válida por 30 días.\n\n¿Desea continuar?")) {
                localStorage.setItem('nexus_demo_mode', 'true');
                localStorage.setItem('nexus_demo_start', new Date().toISOString());
                // Mock user for demo
                const demoUser = { uid: 'demo-local', displayName: 'Usuario Demo', email: 'demo@local', photoURL: null, isDemo: true };
                localStorage.setItem('nexus_user', JSON.stringify(demoUser));
                window.location.hash = '#/dashboard';
                window.location.reload();
            }
        };

        container.innerHTML = `
            <div class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans selection:bg-brand-500 selection:text-white">
                
                <!-- Navbar -->
                <nav class="fixed w-full z-50 transition-all duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="flex justify-between items-center h-20">
                            <!-- Logo -->
                            <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.hash = '#/'">
                                <img src="assets/logo.jpg" class="h-10 w-10 rounded-xl shadow-lg hover:rotate-3 transition-transform" alt="Nexus Flow" onerror="this.style.display='none'">
                                <span class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-brand-400 dark:from-brand-400 dark:to-brand-200">
                                    Nexus Flow
                                </span>
                            </div>

                            <!-- Actions -->
                            <div class="flex items-center gap-4">
                                <a href="#/help" class="text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors hidden sm:block">
                                    Ayuda
                                </a>
                                <button onclick="window.startDemo()" class="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 transition-colors">
                                    <i class="fas fa-laptop-code mr-2"></i>Demo Local (30 días)
                                </button>
                                <a href="#/login" class="text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors hidden sm:block">
                                    Iniciar Sesión
                                </a>
                            </div>
                        </div>
                    </div>
                </nav>

                <!-- Hero Section -->
                <header class="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                    <!-- Background blobs -->
                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
                        <div class="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
                        <div class="absolute top-20 right-10 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
                        <div class="absolute -bottom-8 left-20 w-72 h-72 bg-brand-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
                    </div>

                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        
                        <!-- Promo Banner -->
                        <div class="mb-8 animate-fade-in-up">
                            <div class="inline-block p-1 rounded-full bg-gradient-to-r from-brand-500 to-purple-600">
                                <div class="bg-white dark:bg-slate-900 rounded-full px-4 py-1.5 sm:px-6 sm:py-2 flex items-center gap-2 sm:gap-3">
                                    <span class="bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">Oferta Lanzamiento</span>
                                    <span class="text-gray-700 dark:text-gray-200 text-xs sm:text-sm font-medium">
                                        Regístrate gratis con Google hasta el <span class="font-bold text-brand-600 dark:text-brand-400">2 de Marzo</span> y obtén acceso de por vida 🚀
                                    </span>
                                </div>
                            </div>
                        </div>

                        <h1 class="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white mb-8 leading-tight tracking-tight">
                            Gestión de Proyectos <br>
                            <span class="bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-purple-600 dark:from-brand-400 dark:to-purple-400">
                                Simplemente Superior
                            </span>
                        </h1>
                        
                        <p class="mt-4 max-w-2xl mx-auto text-xl text-gray-500 dark:text-gray-400 mb-10">
                            Centraliza tareas, colabora con tu equipo y visualiza el progreso real de tus obras y proyectos comerciales en una sola plataforma intuitiva.
                        </p>

                        <div class="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in-up delay-300">
                            <a href="${ctaLink}" class="btn-primary text-lg px-8 py-4 shadow-xl shadow-brand-500/20 hover:shadow-2xl hover:shadow-brand-500/40 hover:-translate-y-1 transition-all">
                                ${ctaText}
                                <i class="fas fa-arrow-right ml-2"></i>
                            </a>
                             <button onclick="window.startDemo()" class="px-8 py-4 rounded-xl bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/80 font-semibold shadow-sm hover:shadow-md transition-all">
                                Probar Demo 1 Mes
                            </button>
                        </div>
                    </div>
                </header>

                <!-- Features Section -->
                <section id="features" class="py-24 bg-white dark:bg-slate-900 relative">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="text-center max-w-3xl mx-auto mb-16">
                            <h2 class="text-brand-600 dark:text-brand-400 font-semibold tracking-wide uppercase text-sm mb-3">Características</h2>
                            <p class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                                Todo lo que necesitas para escalar
                            </p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <!-- Feature 1 -->
                            <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-tasks"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Gestión Inteligente</h3>
                                <p class="text-gray-500 dark:text-gray-400">Checklists anidados, fechas inteligentes y prioridades.</p>
                            </div>

                            <!-- Feature 2 -->
                            <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-chart-pie"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Métricas Reales</h3>
                                <p class="text-gray-500 dark:text-gray-400">Gráficos de progreso automático para tomar decisiones.</p>
                            </div>

                            <!-- Feature 3 -->
                            <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-users"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Colaboración Total</h3>
                                <p class="text-gray-500 dark:text-gray-400">Asigna responsables y comparte proyectos con clientes.</p>
                            </div>
                            
                            <!-- Feature 4 -->
                             <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-file-pdf"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Reportes PDF</h3>
                                <p class="text-gray-500 dark:text-gray-400">Exporta informes profesionales de tus proyectos al instante.</p>
                            </div>

                            <!-- Feature 5 - Offline -->
                             <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-wifi"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Modo Demo Local</h3>
                                <p class="text-gray-500 dark:text-gray-400">Prueba la plataforma sin internet y guarda datos en tu dispositivo.</p>
                            </div>

                             <!-- Feature 6 -->
                             <div class="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                                <div class="w-12 h-12 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xl mb-6">
                                    <i class="fas fa-history"></i>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">Historial Completo</h3>
                                <p class="text-gray-500 dark:text-gray-400">Registro detallado de cambios para auditoría y control.</p>
                            </div>
                        </div>
                    </div>
                </section>



                <!-- Footer -->
                <footer class="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
                    <div class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div class="flex items-center gap-2">
                             <img src="assets/logo.jpg" class="h-8 w-8 rounded-lg opacity-80" alt="Logo Footer" onerror="this.style.display='none'">
                             <span class="font-semibold text-gray-900 dark:text-white">Nexus Flow</span>
                        </div>
                        <p class="text-center text-gray-400 text-sm">
                            &copy; 2026 Nexus Flow Systems. Todos los derechos reservados.
                        </p>
                        <!-- Social links removed as requested -->
                        <div></div>
                    </div>
                </footer>
            </div>
        `;
    }
};
