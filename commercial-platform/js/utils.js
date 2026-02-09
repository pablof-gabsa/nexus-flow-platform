const Utils = {
    // Format currency
    formatMoney: (amount) => {
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS', 
            minimumFractionDigits: 2 
        }).format(amount).replace('ARS', '$').trim();
    },

    // Format date for display
    formatDate: (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString + 'T00:00:00'); // Fix Timezone issue
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
    
    // Format date for input[type=date]
    formatDateForInput: (dateObj) => {
        if (!dateObj) return '';
        return dateObj.toISOString().split('T')[0];
    },

    // Calculate relative time (e.g. "Hace 2 días")
    timeAgo: (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'hace un momento';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `hace ${minutes} m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `hace ${hours} h`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `hace ${days} d`;
        
        return Utils.formatDate(dateString);
    },

    // Generate random ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Debounce function
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Sleep helper
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
