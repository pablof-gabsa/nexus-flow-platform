const UI = {
    textTooltip: null,
    textTooltipTarget: null,
    textTooltipTimer: null,
    textTooltipEvents: null,

    showTextTooltip: (target) => {
        UI.hideTextTooltip(true);
        if (target.scrollWidth <= target.clientWidth) return;

        const tooltip = document.createElement('div');
        tooltip.id = 'task-text-tooltip';
        tooltip.className = 'task-text-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = target.textContent;
        document.body.appendChild(tooltip);
        target.setAttribute('aria-describedby', tooltip.id);
        UI.textTooltip = tooltip;
        UI.textTooltipTarget = target;

        const anchor = target.getBoundingClientRect();
        const bounds = tooltip.getBoundingClientRect();
        const left = Math.max(16, Math.min(anchor.left, window.innerWidth - bounds.width - 16));
        const below = anchor.bottom + 8;
        const top = below + bounds.height <= window.innerHeight - 16 ? below :
            Math.max(16, anchor.top - bounds.height - 8);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;

        // Allow the pointer to move into the preview to read or scroll it.
        tooltip.onmouseenter = () => clearTimeout(UI.textTooltipTimer);
        tooltip.onmouseleave = () => UI.hideTextTooltip();
        UI.textTooltipEvents = new AbortController();
        const options = { signal: UI.textTooltipEvents.signal };
        window.addEventListener('resize', () => UI.hideTextTooltip(true), options);
        window.addEventListener('hashchange', () => UI.hideTextTooltip(true), options);
        document.addEventListener('scroll', event => {
            if (!tooltip.contains(event.target)) UI.hideTextTooltip(true);
        }, { ...options, capture: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') UI.hideTextTooltip(true);
        }, options);
    },

    hideTextTooltip: (immediate = false) => {
        clearTimeout(UI.textTooltipTimer);
        const close = () => {
            UI.textTooltipTarget?.removeAttribute('aria-describedby');
            UI.textTooltip?.remove();
            UI.textTooltipEvents?.abort();
            UI.textTooltip = null;
            UI.textTooltipTarget = null;
            UI.textTooltipEvents = null;
        };
        if (immediate) close();
        else UI.textTooltipTimer = setTimeout(close, 180);
    },

    // Toast Notification
    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');

        // Styles based on type
        const styles = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            info: 'bg-blue-600 text-white',
            warning: 'bg-yellow-500 text-white'
        };

        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>'
        };

        const bgClass = styles[type] || styles.info;
        const icon = icons[type] || icons.info;

        toast.className = `${bgClass} shadow-lg rounded-lg px-4 py-3 mb-3 flex items-center gap-3 transform transition-all duration-300 translate-x-10 opacity-0 min-w-[250px]`;
        toast.innerHTML = `
            <span class="text-lg">${icon}</span>
            <span class="font-medium text-sm flex-1">${message}</span>
            <button class="text-white opacity-70 hover:opacity-100" onclick="this.parentElement.remove()">&times;</button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-10', 'opacity-0');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    // Confirm Modal
    confirm: async (message, title = "Confirmar acción") => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in';
            overlay.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-slide-up border dark:border-slate-700">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${title}</h3>
                    <p class="text-gray-600 dark:text-gray-300 mb-6 text-sm">${message}</p>
                    <div class="flex justify-end gap-3">
                        <button id="modal-cancel" class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700 transition font-medium text-sm">Cancelar</button>
                        <button id="modal-confirm" class="px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition font-medium text-sm shadow-md shadow-brand-500/30">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const close = (result) => {
                overlay.classList.add('opacity-0');
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            overlay.querySelector('#modal-cancel').onclick = () => close(false);
            overlay.querySelector('#modal-confirm').onclick = () => close(true);
            overlay.onclick = (e) => {
                if (e.target === overlay) close(false);
            };
        });
    }
};
