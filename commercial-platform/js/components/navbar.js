const NavbarComponent = {
    render: () => {
        const user = Auth.getCurrentUser();
        if (!user) return '';

        return `
            <nav class="sticky top-0 z-40 w-full glass-panel border-b border-white/20 dark:border-slate-700/50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex items-center justify-between h-16">
                        <div class="flex items-center gap-3">
                            <div class="flex items-center gap-3 cursor-pointer" onclick="App.navigateTo('#/dashboard')">
                                <div class="flex-shrink-0">
                                    <img class="h-8 w-8 rounded-lg shadow-sm" src="assets/logo.jpg" alt="Logo">
                                </div>
                                <div class="hidden md:block">
                                    <span class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-brand-400 dark:from-brand-400 dark:to-brand-200">
                                        Nexus Flow
                                    </span>
                                </div>
                            </div>
                            
                            <!-- Custom Company Name -->
                            <div class="hidden md:flex items-center pl-3 border-l border-gray-200 dark:border-gray-700 ml-1 group">
                                <span id="nav-company-name" class="text-sm font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                      onclick="NavbarComponent.editCompanyName()">
                                    Cargando...
                                </span>
                                <i id="nav-company-edit-icon" class="fas fa-pen text-[10px] text-gray-300 ml-2 opacity-0 hover:opacity-100 transition-opacity hidden"></i>
                            </div>
                        </div>

                        <!-- Right Actions -->
                        <div class="flex items-center gap-4">
                            <!-- Theme Toggle -->
                            <button id="theme-toggle" class="p-2 rounded-lg text-gray-500 delay-100 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700/50 transition-colors" onclick="NavbarComponent.toggleTheme()">
                                <i class="fas fa-moon hidden dark:block"></i>
                                <i class="fas fa-sun block dark:hidden text-yellow-500"></i>
                            </button>

                            <button onclick="window.location.hash = '#/help'" class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700/50 transition-colors" title="Ayuda">
                                <i class="fas fa-question-circle"></i>
                            </button>

                            ${!window.location.hash.includes('project') ? `
                            <button onclick="DashboardComponent.showIntegrations()" class="p-2 rounded-lg text-brand-500 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-slate-700/50 transition-colors" title="Integraciones">
                                <i class="fas fa-plug"></i>
                            </button>
                            ` : ''}

                            <!-- User Profile -->
                            <div class="flex items-center gap-3 border-l pl-4 border-gray-200 dark:border-gray-700">
                                <div class="hidden sm:flex flex-col items-end">
                                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-200 leading-tight">
                                        ${user.displayName || 'Usuario'}
                                    </span>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">
                                        ${user.email || 'Invitado'}
                                    </span>
                                </div>
                                <div class="relative group">
                                    <img class="h-9 w-9 rounded-full ring-2 ring-white dark:ring-gray-700 cursor-pointer object-cover" 
                                         src="${user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}&background=2563EB&color=fff`}" 
                                         alt="Profile">
                                    
                                    <!-- Dropdown -->
                                    <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right scale-95 group-hover:scale-100 border border-gray-100 dark:border-slate-700 z-50">
                                        <a href="#/dashboard" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">Dashboard</a>
                                        <button onclick="Auth.signOut()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Cerrar Sesión</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        `;
    },

    toggleTheme: () => {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    },

    editCompanyName: async () => {
        if (Store.currentContext.role !== 'owner') {
            UI.showToast("Solo el propietario puede cambiar el nombre de la empresa", "warning");
            return;
        }

        const current = document.getElementById('nav-company-name').textContent.trim();
        const name = prompt("Nombre de la Empresa:", current);

        if (name && name !== current) {
            await Store.saveCompanyName(name);
            document.getElementById('nav-company-name').textContent = name;
            UI.showToast("Nombre de empresa actualizado", "success");
        }
    }
};

// Initialize theme on load
if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

// Global Watcher for Company Name (Fixes "Cargando..." on refresh)
setInterval(async () => {
    const el = document.getElementById('nav-company-name');
    if (!el) return;

    // specific check for loading state or mismatch
    if (el.textContent.trim() === 'Cargando...') {
        if (Store.currentContext && Store.currentContext.ownerId) {
            const name = await Store.getCompanyName();
            if (el.textContent.trim() === 'Cargando...') { // Double check
                el.textContent = name;

                // Apply owner permissions
                if (Store.currentContext.role === 'owner') {
                    document.getElementById('nav-company-edit-icon')?.classList.remove('hidden');
                    el.parentElement.classList.add('group-hover:opacity-100');
                } else {
                    el.classList.remove('cursor-pointer', 'hover:text-brand-600');
                    el.setAttribute('onclick', '');
                }
            }
        }
    }
}, 1000);
