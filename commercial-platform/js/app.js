const App = {
    // Current State
    state: {
        currentUser: null,
        currentProject: null,
        currentRoute: null
    },

    // Initialization
    init: async () => {
        console.log("Nexus App Initializing...");

        // Failsafe: Force app display if Auth hangs
        setTimeout(() => {
            const loading = document.getElementById('loading-screen');
            const app = document.getElementById('app');
            if (loading && loading.style.display !== 'none') {
                console.warn("Auth timeout - Forcing app display");
                loading.style.display = 'none';
                app?.classList.remove('hidden', 'opacity-0');
                if (!App.state.currentUser) App.handleRoute();
            }
        }, 1500);

        // Hash Change Listener
        window.addEventListener('hashchange', App.handleRoute);

        // Initialize Auth safely
        try {
            if (typeof Auth !== 'undefined' && typeof auth !== 'undefined') {
                Auth.init(App.onAuthStateChanged);
            } else {
                console.warn("Auth/Firebase not loaded - Running in Offline/Demo Mode");
                App.state.currentUser = null;
                App.handleRoute(); // Render directly

                // Hide loader immediately if no auth
                const loading = document.getElementById('loading-screen');
                if (loading) loading.style.display = 'none';
                document.getElementById('app')?.classList.remove('hidden', 'opacity-0');
            }
        } catch (e) {
            console.error("Auth Init Error:", e);
            App.handleRoute();
        }
    },

    // Auth State Handler
    onAuthStateChanged: async (user) => {
        App.state.currentUser = user;
        console.log("Auth State Changed:", user ? user.uid : 'Guest');

        // Handle initial route
        await App.handleRoute();

        // Remove loading screen
        const loading = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        if (loading) {
            loading.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                loading.style.display = 'none';
                app.classList.remove('hidden', 'opacity-0');
            }, 500);
        }
    },

    // Router Logic
    handleRoute: async () => {
        const hash = window.location.hash || '#/';
        console.log("Routing to:", hash);

        // Parse Route
        let route = hash.split('?')[0]; // Remove query params
        const params = new URLSearchParams(hash.split('?')[1]); // Get query params

        // Check if route is public
        const publicRoutes = ['#/', '#/login', '#/help'];
        const isPublic = publicRoutes.includes(route) || route.startsWith('#/share/');

        // redirect to login if not public and not logged in
        if (!App.state.currentUser && !isPublic) {
            console.log("Unauthorized access, redirecting to login");
            window.location.hash = '#/login';
            return;
        }

        // Redirect to dashboard if logged in and trying to access login
        if (App.state.currentUser && route === '#/login') {
            window.location.hash = '#/dashboard';
            return;
        }

        // Components
        const main = document.getElementById('main-content');
        main.innerHTML = ''; // Clear previous view
        window.scrollTo(0, 0);

        try {
            if (route === '#/') {
                if (typeof LandingComponent !== 'undefined') await LandingComponent.render(main);
                else main.innerHTML = '<p class="p-10 text-center">Landing Component Not Loaded</p>';
            }
            else if (route === '#/login') {
                if (typeof LoginComponent !== 'undefined') await LoginComponent.render(main);
                else main.innerHTML = '<p class="p-10 text-center">Login Component Not Loaded</p>';
            }
            else if (route === '#/dashboard') {
                if (typeof DashboardComponent !== 'undefined') await DashboardComponent.render(main);
                else main.innerHTML = '<p class="p-10 text-center">Dashboard Component Not Loaded</p>';
            }
            else if (route.startsWith('#/project/')) {
                const projectId = route.replace('#/project/', '');
                if (typeof ProjectComponent !== 'undefined') await ProjectComponent.render(main, projectId);
                else main.innerHTML = '<p class="p-10 text-center">Project Component Not Loaded</p>';
            }
            else if (route.startsWith('#/share/')) {
                const projectId = route.replace('#/share/', '');
                if (typeof SharedComponent !== 'undefined') await SharedComponent.render(main, projectId, params);
                else main.innerHTML = '<p class="p-10 text-center">Shared Component Not Loaded</p>';
            }
            else if (route === '#/help') {
                if (typeof HelpComponent !== 'undefined') await HelpComponent.render(main);
                else main.innerHTML = '<p class="p-10 text-center">Help Component Not Loaded</p>';
            }
            else {
                main.innerHTML = `
                    <div class="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                        <h1 class="text-6xl font-bold text-gray-200 dark:text-gray-700">404</h1>
                        <p class="text-xl text-gray-500 mt-4">Página no encontrada</p>
                        <a href="#/dashboard" class="mt-8 btn-primary">Volver al Inicio</a>
                    </div>
                `;
            }
        } catch (error) {
            console.error("Routing Error:", error);
            main.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div class="bg-red-50 text-red-600 p-4 rounded-lg max-w-md">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <h3 class="font-bold">Error de Navegación</h3>
                        <p class="text-sm mt-1">${error.message}</p>
                        <p class="text-xs mt-2 text-red-400 font-mono">${error.stack ? error.stack.split('\n')[0] : ''}</p>
                        <button onclick="window.location.reload()" class="btn-secondary mt-4 w-full">Recargar Página</button>
                    </div>
                </div>
            `;
            UI.showToast("Error al cargar la página", "error");
        }
    },

    navigateTo: (route) => {
        window.location.hash = route;
    }
};

// Start the App when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
