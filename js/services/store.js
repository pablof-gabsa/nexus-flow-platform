const Store = {
    sharedAccess: null,
    // Projects CRUD
    // State
    // State
    // State
    currentContext: {
        ownerId: null,
        role: 'owner',
        availableWorkspaces: [] // Array of { ownerId, name (opt) }
    },

    // Resolve current permissions before offering delegated spaces.
    initContext: async (user) => {
        Store.currentContext = {
            ownerId: user.uid,
            role: 'owner',
            availableWorkspaces: [{ ownerId: user.uid, type: 'personal' }]
        };
        if (!user.email || !user.emailVerified || user.isAnonymous) return;
        const spaces = await Store.getAssistantWorkspaces();
        Store.currentContext.availableWorkspaces = spaces.map(space => ({
            ownerId: space.id, name: space.name, type: space.role === 'owner' ? 'personal' : 'admin'
        }));
    },

    switchContext: (targetOwnerId) => {
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Verify target is available
        const target = Store.currentContext.availableWorkspaces.find(w => w.ownerId === targetOwnerId);

        if (!target) {
            console.warn("Attempted to switch to unauthorized workspace");
            return;
        }

        Store.currentContext = {
            ownerId: target.ownerId,
            role: target.ownerId === user.uid ? 'owner' : 'admin',
            availableWorkspaces: Store.currentContext.availableWorkspaces
        };

        // Refresh UI components
        if (Store.currentContext.role === 'admin') {
            // Fetch company name for this new context
            Store.getCompanyName().then(name => {
                const navEl = document.getElementById('nav-company-name');
                if (navEl) navEl.textContent = name;
            });
        } else {
            // Reset to my name/default
            Store.getCompanyName().then(name => {
                const navEl = document.getElementById('nav-company-name');
                if (navEl) navEl.textContent = name;
            });
        }

        // Reload Dashboard
        DashboardComponent.render(document.getElementById('main-content'));
    },

    saveCompanyName: async (name) => {
        const uid = Store.currentContext.ownerId; // Always save to current Scope Owner
        if (!uid) return;

        await db.ref(`users/${uid}/config/companyName`).set(name);
        return name;
    },

    getCompanyName: async () => {
        const uid = Store.currentContext.ownerId;
        if (!uid) return 'Nexus Flow';

        try {
            const snap = await db.ref(`users/${uid}/config/companyName`).once('value');
            return snap.val() || 'Tu Empresa';
        } catch (e) {
            console.error(e);
            return 'Tu Empresa';
        }
    },

    getProjects: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return [];

        // Use Context Owner ID
        if (!Store.currentContext.ownerId) await Store.initContext(user);
        const ownerId = Store.currentContext.ownerId;

        const snapshot = await db.ref(`users/${ownerId}/projects`).once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    },

    // --- Admin Management (Multi-Tenant Update) ---
    addAdmin: async (email) => {
        const user = Auth.getCurrentUser();
        if (Store.currentContext.role !== 'owner') throw new Error("Solo el propietario puede agregar administradores");

        const emailKey = email.replace(/\./g, ',');

        // 1. Add to Global Map for redirection (Multi-Tenant)
        await db.ref(`admin_map/${emailKey}/${user.uid}`).set(true);

        // 2. Add to Owner's List (for UI display)
        // Using 'config/admins' as the new standard
        await db.ref(`users/${user.uid}/config/admins/${emailKey}`).set({
            email: email,
            addedAt: new Date().toISOString()
        });
    },

    getAdmins: async () => {
        const user = Auth.getCurrentUser();
        if (Store.currentContext.role !== 'owner') return [];

        // 1. Get New Structure
        const snapNew = await db.ref(`users/${user.uid}/config/admins`).once('value');
        const dataNew = snapNew.val() || {};

        // 2. Get Legacy Structure (Backward Compatibility)
        const snapOld = await db.ref(`users/${user.uid}/authorized_admins`).once('value');
        const dataOld = snapOld.val() || {};

        // Merge maps (New overwrites Old if duplicate)
        const merged = { ...dataOld, ...dataNew };

        return Object.values(merged);
    },

    removeAdmin: async (email) => {
        const user = Auth.getCurrentUser();
        if (Store.currentContext.role !== 'owner') {
            throw new Error("Solo el propietario puede revocar accesos");
        }

        const emailKey = email.replace(/\./g, ',');

        // 1. Remove from Global Map (Multi-Tenant)
        // Modern structure
        await db.ref(`admin_map/${emailKey}/${user.uid}`).remove();

        // Legacy structure cleanup: if the map has a direct 'ownerId' field matching this owner
        let legacyOwnerId = null;
        try {
            legacyOwnerId = (await db.ref(`admin_map/${emailKey}/ownerId`).once('value')).val();
        } catch (error) {
            if (!Store.isPermissionDenied(error)) throw error;
        }
        if (legacyOwnerId === user.uid) {
            await db.ref(`admin_map/${emailKey}/ownerId`).remove();
        }

        // 2. Remove from both new and legacy structures in owner's tree to be safe
        await db.ref(`users/${user.uid}/config/admins/${emailKey}`).remove();
        await db.ref(`users/${user.uid}/authorized_admins/${emailKey}`).remove();
    },

    rotateSharingToken: async (projectId) => {
        if (Store.currentContext.role !== 'owner') throw new Error("Acción restringida");
        const newToken = Utils.generateSharingToken();
        await db.ref(`project_data/${projectId}/sharingToken`).set(newToken);
        return newToken;
    },

    createProject: async (projectData) => {
        const user = Auth.getCurrentUser();
        if (!user) throw new Error("No authenticated user");

        const ownerId = Store.currentContext.ownerId;

        const newRef = db.ref(`users/${ownerId}/projects`).push();
        const project = {
            ...projectData,
            createdAt: new Date().toISOString(),
            owner: ownerId, // Project belongs to the Context Owner
            createdBy: user.email, // Audit
            status: 'active'
        };
        const projectId = newRef.key;
        const sharingToken = Utils.generateSharingToken();
        await db.ref().update({
            [`users/${ownerId}/projects/${projectId}`]: project,
            [`project_owners/${projectId}`]: { ownerUid: ownerId },
            [`project_data/${projectId}`]: {
                name: projectData.name,
                sharingToken,
                rubros: projectData.rubros || ['Area 1', 'Area 2', 'Realizados', 'Eliminado'],
                responsables: projectData.responsables || ['Administrador', 'Colaborador 1']
            }
        });

        return { id: projectId, ...project };
    },

    getProject: async (projectId) => {
        const user = Auth.getCurrentUser();
        if (!user) return null;

        const ownerId = Store.currentContext.ownerId || user.uid;
        // Try getting from OWNER's projects first
        const snapshot = await db.ref(`users/${ownerId}/projects/${projectId}`).once('value');
        const data = snapshot.val();

        if (data) {
            // Lazy Sync: Ensure name is in project_data for sharing to work
            // This fixes existing projects automatically when owner opens them
            db.ref(`project_data/${projectId}/name`).set(data.name);

            return { id: projectId, ...data };
        }

        return null;
    },

    deleteProject: async (projectId) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        // Check permissions: ONLY OWNER CAN DELETE
        if (Store.currentContext.role !== 'owner') {
            throw new Error("Solo el propietario puede eliminar proyectos");
        }

        const ownerId = Store.currentContext.ownerId;
        // Remove project metadata
        await db.ref(`users/${ownerId}/projects/${projectId}`).remove();
        // Remove project data (tasks, settings)
        await db.ref(`project_data/${projectId}`).remove();
    },

    updateProject: async (projectId, updates) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'rename', updates);
        const user = Auth.getCurrentUser();
        if (!user) return;

        const ownerId = Store.currentContext.ownerId;
        await db.ref(`users/${ownerId}/projects/${projectId}`).update(updates);

        // Sync name if updated
        if (updates.name) {
            await db.ref(`project_data/${projectId}/name`).set(updates.name);
        }
    },

    // Project Data (Tasks, Rubros, etc) - Stored separately for sharing capability
    // Structure: project_data/{projectId}/{tasks|rubros|responsables}

    initializeProjectDefaults: async (projectId, customRubros = null, customResponsables = null) => {
        const defaultRubros = ['Area 1', 'Area 2', 'Realizados', 'Eliminado'];
        const defaultResponsables = ['Administrador', 'Colaborador 1'];

        await db.ref(`project_data/${projectId}/rubros`).set(customRubros || defaultRubros);
        await db.ref(`project_data/${projectId}/responsables`).set(customResponsables || defaultResponsables);
    },

    getProjectData: async (projectId) => {
        const snapshot = await db.ref(`project_data/${projectId}`).once('value');
        const val = snapshot.val();
        if (!val) return { tasks: {}, rubros: [], responsables: [], name: 'Proyecto Compartido', sharingToken: '' };

        // Lazy initialization for existing projects
        if (!val.sharingToken && Store.currentContext.role === 'owner') {
            const token = Utils.generateSharingToken();
            await db.ref(`project_data/${projectId}/sharingToken`).set(token);
            val.sharingToken = token;
        }

        return val;
    },

    getSharedProjectData: async (projectId, token) => {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId || '') || !/^[A-Za-z0-9_-]{8,128}$/.test(token || '')) {
            const error = new Error('El enlace expiró o no es válido.');
            error.status = 404;
            throw error;
        }
        const result = await AssistantAPI.publicRequest('/v1/shared-project', {
            method: 'POST', body: JSON.stringify({ projectId, token })
        });
        const data = { ...result.data, _sharedEditable: result.readOnly === false };
        Store.sharedAccess = { projectId, token, isEditable: data._sharedEditable, data };
        return data;
    },

    getCollaboratorToken: async projectId => {
        const result = await AssistantAPI.request(`/v1/projects/${encodeURIComponent(projectId)}/collaborator-link`, { method: 'POST', body: '{}' });
        return result.token;
    },

    mutateShared: async (projectId, operation, changes, id) => {
        const access = Store.sharedAccess;
        if (!access || access.projectId !== projectId || !access.isEditable) throw new Error('Este enlace es de solo lectura');
        const task = operation.startsWith('task_');
        const field = task ? 'tasks' : 'assets';
        const existing = id ? access.data[field]?.[id] : null;
        const payload = changes ? { ...changes } : undefined;
        if (payload) {
            if (task) delete payload.confidential;
            if (!task && existing && payload.image === existing.image) delete payload.image;
            const filesField = task ? 'attachments' : 'documents';
            if (payload[filesField] && existing) {
                const used = new Set();
                payload[filesField] = payload[filesField].map(file => {
                    const index = (existing[filesField] || []).findIndex((value, index) => !used.has(index) && value.name === file.name && value.type === file.type && value.data === file.data && value.url === file.url);
                    if (index < 0) return file;
                    used.add(index);
                    return { existingIndex: index };
                });
            }
        }
        const body = { projectId, token: access.token, operation, requestId: crypto.randomUUID(), ...(id ? { id, expectedVersion: existing?._version } : {}), ...(operation === 'settings' ? { expectedVersion: access.data._settingsVersion } : {}), ...(payload ? { changes: payload } : {}) };
        const result = await AssistantAPI.publicRequest('/v1/shared-project/mutate', { method: 'POST', body: JSON.stringify(body) });
        if (!result.saved) throw new Error('No se pudo guardar el cambio.');
        if (operation === 'settings') Object.assign(access.data, changes, { _settingsVersion: result.version });
        else if (operation === 'asset_delete') delete access.data.assets?.[id];
        else if (id && existing) Object.assign(existing, changes, { _version: result.version });
        return result;
    },

    isPermissionDenied: error => ['PERMISSION_DENIED', 'permission-denied', 'database/permission-denied'].includes(error?.code),

    // Tasks
    addTask: async (projectId, taskData) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'task_create', taskData);
        const ref = db.ref(`project_data/${projectId}/tasks`).push();
        await ref.set(taskData);
        return { id: ref.key, ...taskData };
    },

    updateTask: async (projectId, taskId, updates) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'task_update', updates, taskId);
        // Recurrence Logic
        if (updates.estado === 'Realizado') {
            const taskRef = db.ref(`project_data/${projectId}/tasks/${taskId}`);
            const snapshot = await taskRef.once('value');
            const task = snapshot.val();

            if (task && task.recurrence && task.recurrence.type !== 'none') {
                // Calculate next date
                // Calculate next date
                const recurrence = task.recurrence;
                let nextDate;

                if (task.deadline) {
                    const parts = task.deadline.split('-');
                    // Use Noon to avoid DST/Timezone issues when doing date math
                    nextDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                } else {
                    nextDate = new Date();
                }

                const deadline = task.deadline ? new Date(task.deadline) : new Date();

                // --- Advanced Recurrence Logic ---
                if (recurrence.type === 'daily') {
                    nextDate.setDate(nextDate.getDate() + 1);
                }
                else if (recurrence.type === 'weekly' && recurrence.days && recurrence.days.length > 0) {
                    // Find next valid day
                    let found = false;
                    for (let i = 1; i <= 7; i++) {
                        nextDate.setDate(nextDate.getDate() + 1);
                        let jsDay = nextDate.getDay();
                        let uiDay = jsDay === 0 ? 6 : jsDay - 1; // Map 0(Sun)->6, 1(Mon)->0

                        if (recurrence.days.includes(uiDay)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) nextDate.setDate(nextDate.getDate() + 1); // Fallback
                }
                else if (recurrence.type === 'monthly') {
                    if (recurrence.monthlyType === 'relative') {
                        // Logic for "Nth Weekday of Month" (e.g. 2nd Tuesday)
                        nextDate.setMonth(nextDate.getMonth() + 1); // Move to next month
                        nextDate.setDate(1); // Start at 1st

                        const targetDay = recurrence.dayOfWeek; // 0=Mon, 6=Sun
                        const targetWeek = recurrence.week; // 1-5

                        // Find first occurrence of targetDay
                        let currentDay = nextDate.getDay(); // 0=Sun, 1=Mon...
                        let uiCurrentDay = currentDay === 0 ? 6 : currentDay - 1;

                        let offset = targetDay - uiCurrentDay;
                        if (offset < 0) offset += 7;

                        nextDate.setDate(1 + offset); // First occurrence date

                        // Add weeks
                        if (targetWeek < 5) {
                            nextDate.setDate(nextDate.getDate() + (targetWeek - 1) * 7);
                        } else {
                            // "Last" occurrence logic: Move to next month, subtract days
                            nextDate.setDate(nextDate.getDate() + (4) * 7); // Try 5th
                            if (nextDate.getMonth() !== ((new Date(deadline).getMonth() + 1) % 12)) {
                                nextDate.setDate(nextDate.getDate() - 7); // Back to 4th
                            }
                        }

                    } else {
                        // Fixed Day (e.g. 15th)
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        // Handle short months (e.g. Jan 31 -> Feb 28)
                        const desiredDay = recurrence.day || 1;
                        // Check max days in next month
                        const year = nextDate.getFullYear();
                        const month = nextDate.getMonth();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();

                        nextDate.setDate(Math.min(desiredDay, daysInMonth));
                    }
                }
                else if (recurrence.type === 'yearly') {
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                }
                else if (recurrence.type === 'periodic') {
                    const days = recurrence.interval || 1;
                    nextDate = new Date();
                    nextDate.setDate(nextDate.getDate() + days);
                }

                // Create New Task
                const newDeadline = nextDate.toISOString().split('T')[0];
                let newStartDate = '';

                // Calculate duration to shift start_date accordingly
                if (task.deadline && task.start_date) {
                    const oldDeadline = new Date(task.deadline).getTime();
                    const oldStart = new Date(task.start_date).getTime();
                    const duration = oldDeadline - oldStart;

                    if (duration >= 0) {
                        const newDeadlineTime = new Date(newDeadline).getTime();
                        // New Start = New Deadline - Old Duration
                        // Using noon to avoid timezone shifts when setting date string
                        const newStartObj = new Date(newDeadlineTime - duration);
                        // Adjust to ensure we get the correct YYYY-MM-DD
                        newStartObj.setMinutes(newStartObj.getMinutes() + newStartObj.getTimezoneOffset());
                        // Actually, simpler: just subtract milliseconds from the date object

                        // Robust Date String:
                        const d = new Date(newDeadlineTime - duration);
                        // Add timezone offset to ensure T00:00:00 doesn't shift to previous day in UTC
                        const userTimezoneOffset = d.getTimezoneOffset() * 60000;
                        const localDate = new Date(d.getTime() + userTimezoneOffset);
                        newStartDate = localDate.toISOString().split('T')[0];
                    }
                }

                const newTask = {
                    ...task,
                    estado: 'Pendiente',
                    deadline: newDeadline,
                    start_date: newStartDate || task.start_date, // Fallback to old if calc fails, or better, keep duration logic
                    real_start_date: '',
                    end_date: '',
                    hh_executed: 0,
                    subtasks: task.subtasks ? task.subtasks.map(s => ({ ...s, done: false })) : []
                };

                // Add new task
                await Store.addTask(projectId, newTask);
            }
        }

        await db.ref(`project_data/${projectId}/tasks/${taskId}`).update(updates);
    },

    deleteTask: async (projectId, taskId) => {
        await db.ref(`project_data/${projectId}/tasks/${taskId}`).remove();
    },

    selectAssistantWorkspace: async (workspaceId) => {
        const spaces = await Store.getAssistantWorkspaces();
        const selected = spaces.find(space => space.id === workspaceId);
        if (!selected) throw new Error('No tenés acceso al espacio de este enlace.');
        Store.currentContext = { ownerId: selected.id, role: selected.role, availableWorkspaces: spaces.map(space => ({ ownerId: space.id, name: space.name, type: space.role === 'owner' ? 'personal' : 'admin' })) };
    },

    getAssistantWorkspaces: async () => {
        const user = Auth.getCurrentUser();
        if (!user || user.isAnonymous || !user.emailVerified) throw new Error('Ingresá con una cuenta de Google verificada.');
        const emailKey = user.email.replace(/\./g, ',');
        const map = (await db.ref(`admin_map/${emailKey}`).once('value')).val() || {};
        const ownerIds = [...(typeof map.ownerId === 'string' ? [map.ownerId] : []), ...Object.keys(map).filter(id => map[id] === true)];
        const workspaces = [{ id: user.uid, name: 'Mi espacio personal', role: 'owner' }];
        for (const ownerId of [...new Set(ownerIds)]) {
            if (ownerId === user.uid || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) continue;
            try {
                const [config, legacy] = await Promise.all([db.ref(`users/${ownerId}/config`).once('value'), db.ref(`users/${ownerId}/authorized_admins/${emailKey}`).once('value')]);
                if (config.val()?.admins?.[emailKey] || legacy.val()) workspaces.push({ id: ownerId, name: config.val()?.companyName || 'Espacio compartido', role: 'admin' });
            } catch (error) {
                if (!Store.isPermissionDenied(error)) throw error;
            }
        }
        return workspaces;
    },

    // Config
    updateRubros: async (projectId, rubros) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'settings', { rubros });
        await db.ref(`project_data/${projectId}/rubros`).set(rubros);
    },

    updateResponsables: async (projectId, responsables) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'settings', { responsables });
        await db.ref(`project_data/${projectId}/responsables`).set(responsables);
    },

    // --- Templates System ---

    // Project Templates
    createProjectTemplate: async (templateData) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        // Templates belong to the OWNER or the user themselves in shared mode
        const ownerId = Store.currentContext.ownerId || user.uid;
        const ref = db.ref(`users/${ownerId}/project_templates`).push();
        const template = { ...templateData, id: ref.key, createdBy: user.email };
        await ref.set(template);
        return template;
    },

    getProjectTemplates: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        const ownerId = Store.currentContext.ownerId || user.uid;
        const snapshot = await db.ref(`users/${ownerId}/project_templates`).once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    },

    deleteProjectTemplate: async (id) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId || user.uid;
        await db.ref(`users/${ownerId}/project_templates/${id}`).remove();
    },

    updateProjectTemplate: async (id, updates) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId || user.uid;
        await db.ref(`users/${ownerId}/project_templates/${id}`).update(updates);
    },

    // Task Templates
    createTaskTemplate: async (templateData) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        // Task templates belong to the OWNER or the user themselves in shared mode
        const ownerId = Store.currentContext.ownerId || user.uid;
        const ref = db.ref(`users/${ownerId}/task_templates`).push();
        const template = { ...templateData, id: ref.key, createdBy: user.email };
        await ref.set(template);
        return template;
    },

    getTaskTemplates: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        const ownerId = Store.currentContext.ownerId || user.uid;
        const snapshot = await db.ref(`users/${ownerId}/task_templates`).once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    },

    deleteTaskTemplate: async (id) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId || user.uid;
        await db.ref(`users/${ownerId}/task_templates/${id}`).remove();
    },

    // Storage
    uploadFile: async (file, context = {}) => {
        const fallbackToBase64 = () => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        if (context.forceBase64) return fallbackToBase64();

        let user = Auth.getCurrentUser();

        if (!user && context.allowAnonymous && typeof auth !== 'undefined' && auth.signInAnonymously) {
            try {
                const credential = await auth.signInAnonymously();
                user = credential.user || Auth.getCurrentUser();
            } catch (error) {
                console.warn("Anonymous upload session failed", error);
            }
        }

        if (!user) {
            if (context.fallbackToBase64) return fallbackToBase64();
            throw new Error("Usuario no autenticado");
        }

        // Create a unique path: uploads/{uploaderUid}/{timestamp}_{filename}
        // Using user.uid ensures admins can write to their own folder per Storage Rules
        const uploaderId = user.uid;
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const folder = context.folder || `uploads/${uploaderId}`;
        const path = `${folder}/${uploaderId}_${timestamp}_${safeName}`;

        try {
            const ref = storage.ref(path);
            const metadata = {
                contentType: file.type || 'application/octet-stream',
                customMetadata: {
                    originalName: file.name
                }
            };

            // Upload
            const snapshot = await ref.put(file, metadata);

            // Get URL
            const url = await snapshot.ref.getDownloadURL();
            return url;
        } catch (error) {
            if (context.fallbackToBase64) {
                console.warn("Storage upload failed, using Base64 fallback", error);
                return fallbackToBase64();
            }
            throw error;
        }
    },

    deleteUploadedFile: async (url) => {
        if (Store.sharedAccess) return; // Remove only the shared reference; storage belongs to its uploader.
        if (!url || typeof storage === 'undefined' || url.startsWith('data:')) return;

        try {
            await storage.refFromURL(url).delete();
        } catch (error) {
            console.warn("Could not delete file from Storage", error);
        }
    },

    // Integrations
    getIntegrations: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return {};
        // Always usage owner context for settings, or fallback
        const ownerId = Store.currentContext.ownerId || user.uid;
        const snap = await db.ref(`users/${ownerId}/integrations`).once('value');
        return snap.val() || {};
    },

    saveIntegration: async (name, settings) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId || user.uid;
        await db.ref(`users/${ownerId}/integrations/${name}`).update(settings);
    },

    // --- Assets Management ---

    getAssets: async (projectId) => {
        const snapshot = await db.ref(`project_data/${projectId}/assets`).once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    },

    getAsset: async (projectId, assetId) => {
        const snapshot = await db.ref(`project_data/${projectId}/assets/${assetId}`).once('value');
        const data = snapshot.val();
        if (!data) return null;
        return { id: assetId, ...data };
    },

    addAsset: async (projectId, assetData) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'asset_create', assetData);
        const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;

        const ref = db.ref(`project_data/${projectId}/assets`).push();
        const asset = {
            ...assetData,
            createdAt: new Date().toISOString(),
            createdBy: user ? user.email : 'Colaborador'
        };
        await ref.set(asset);
        return { id: ref.key, ...asset };
    },

    updateAsset: async (projectId, assetId, updates) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'asset_update', updates, assetId);
        await db.ref(`project_data/${projectId}/assets/${assetId}`).update(updates);
    },

    updateAssetCategories: async (projectId, categories) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'settings', { assetCategories: categories });
        await db.ref(`project_data/${projectId}/assetCategories`).set(categories);
    },

    updateAssetSubcategories: async (projectId, subcategories) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'settings', { assetSubcategories: subcategories });
        await db.ref(`project_data/${projectId}/assetSubcategories`).set(subcategories);
    },

    deleteAsset: async (projectId, assetId) => {
        if (Store.sharedAccess) return Store.mutateShared(projectId, 'asset_delete', undefined, assetId);
        await db.ref(`project_data/${projectId}/assets/${assetId}`).remove();
    }
};
