const Auth = {
    user: null,

    init: (callback) => {
        auth.onAuthStateChanged((user) => {
            Auth.user = user;
            callback(user);
        });
    },

    signInWithGoogle: async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
            UI.showToast("Inicio de sesión exitoso", "success");
        } catch (error) {
            console.error("Login Error:", error);
            UI.showToast("Error al iniciar sesión: " + error.message, "error");
            throw error;
        }
    },

    signInAnonymously: async () => {
        try {
            await auth.signInAnonymously();
            UI.showToast("Ingresado como invitado", "info");
        } catch (error) {
            console.error("Anon Login Error:", error);
            UI.showToast("Error: " + error.message, "error");
            throw error;
        }
    },

    signOut: async () => {
        try {
            await auth.signOut();
            UI.showToast("Sesión cerrada", "info");
            window.location.hash = '#/';
        } catch (error) {
            console.error("Logout Error:", error);
        }
    },

    getCurrentUser: () => {
        if (typeof auth === 'undefined') return null;
        return auth.currentUser;
    }
};

// Prevent crashes if firebase is missing
if (typeof auth === 'undefined') {
    console.warn("Firebase Auth not loaded. Stubbing Auth service.");
    window.auth = {
        currentUser: null,
        onAuthStateChanged: (cb) => cb(null),
        signInWithPopup: () => Promise.reject("Modo Offline"),
        signInAnonymously: () => Promise.reject("Modo Offline"),
        signOut: () => Promise.resolve()
    };
}
