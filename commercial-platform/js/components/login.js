const LoginComponent = {
    render: async (container) => {
        container.innerHTML = `
            <div class="min-h-screen w-full flex flex-col items-center justify-center p-4 relative bg-gray-900">
                <!-- Branding -->
                <div class="mb-8 text-center relative z-10">
                    <img src="assets/logo.jpg" class="h-20 w-20 mx-auto rounded-2xl shadow-2xl mb-4 bg-white p-1 object-contain" alt="Logo">
                    <h1 class="text-4xl font-extrabold text-white tracking-tight mb-2">
                        Nexus <span class="text-brand-400">Flow</span>
                    </h1>
                    <p class="text-gray-300 text-lg">Gestión de proyectos inteligente y colaborativa</p>
                </div>

                <!-- Login Card -->
                <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl p-8 relative z-10 shadow-2xl border border-gray-700">
                    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-purple-500"></div>
                    
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Bienvenido</h2>
                    
                    <div class="space-y-4">
                        <button onclick="LoginComponent.handleLogin('google')" class="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 font-semibold py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow-md transform hover:-translate-y-0.5 group">
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6" alt="Google">
                            <span>Continuar con Google</span>
                        </button>

                        <div class="relative my-6">
                            <div class="absolute inset-0 flex items-center">
                                <div class="w-full border-t border-gray-300 dark:border-slate-600"></div>
                            </div>
                            <div class="relative flex justify-center text-sm">
                                <span class="px-2 bg-white dark:bg-slate-800 text-gray-500">O ingresa como invitado</span>
                            </div>
                        </div>

                        <button onclick="LoginComponent.handleLogin('anon')" class="w-full flex items-center justify-center gap-3 bg-gray-900 dark:bg-brand-600 text-white hover:bg-gray-800 dark:hover:bg-brand-700 font-semibold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                            <i class="fas fa-user-secret"></i>
                            <span>Ingreso Rápido (Demo)</span>
                        </button>
                    </div>

                    <p class="mt-8 text-center text-xs text-gray-400">
                        Al ingresar, aceptas nuestros <a href="#" class="underline hover:text-brand-500">Términos de Servicio</a>.
                    </p>
                </div>
                
                <div class="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    &copy; 2026 Nexus Flow Systems
                </div>
            </div>
        `;
    },

    handleLogin: async (method) => {
        try {
            if (method === 'google') await Auth.signInWithGoogle();
            else await Auth.signInAnonymously();
            // Router handles redirect via onAuthStateChanged
        } catch (e) {
            // Error managed in Auth service
        }
    }
};
