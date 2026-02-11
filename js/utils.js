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
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    // Load image as Base64
    imageToBase64: async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    // Time & Resource Helpers
    isWeekday: (date) => {
        const day = date.getDay();
        return day !== 0 && day !== 6; // 0 = Sun, 6 = Sat
    },

    calculateBusinessHours: (start, end) => {
        const s = new Date(start);
        const e = new Date(end);
        if (s > e) return 0;

        // Same Day
        if (s.toDateString() === e.toDateString()) {
            const diffMs = e - s;
            const diffHrs = diffMs / (1000 * 60 * 60);
            return Math.min(diffHrs, 8); // Cap at 8 hours per day
        }

        // Multiple Days
        let totalHours = 0;
        let current = new Date(s);
        current.setHours(0, 0, 0, 0); // Reset to start of day for iteration

        const endDay = new Date(e);
        endDay.setHours(0, 0, 0, 0);

        while (current <= endDay) {
            if (Utils.isWeekday(current)) {
                totalHours += 8;
            }
            current.setDate(current.getDate() + 1);
        }

        // Adjustment: Since we counted full 8h days, we might want to be more precise
        // But the requirement specifically asked for "8 hours Mon-Fri".
        // A full day count is the most robust simple heuristic.
        // Refinement: If it's the start day, maybe we don't count full 8?
        // Let's stick to the simpler requested logic: "Calculated automatically ... using same criteria of 8h workday"
        // Interpreted as: (Business Days * 8).

        return totalHours;
    }
};
