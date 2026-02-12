const Store = {
    // Projects CRUD
    // State
    // State
    // State
    currentContext: {
        ownerId: null,
        role: 'owner',
        availableWorkspaces: [] // Array of { ownerId, name (opt) }
    },

    // Init Logic to Detect Role
    initContext: async (user) => {
        Store.currentContext = {
            ownerId: user.uid,
            role: 'owner',
            availableWorkspaces: [{ ownerId: user.uid, type: 'personal' }] // Always have my own
        };

        // Check if I am an admin for others (Multi-Tenant)
        const emailKey = user.email.replace(/\./g, ',');
        try {
            const adminMapRef = await db.ref(`admin_map/${emailKey}`).once('value');
            const mapData = adminMapRef.val();

            if (mapData) {
                // mapData is now like { "ownerUid1": true, "ownerUid2": true }
                // OR legacy { ownerId: "..." } -> Support migration on fly if possible, or just overwrite

                // Handle Legacy vs New Schema
                let ownerIds = [];
                if (typeof mapData === 'object' && mapData.ownerId) {
                    // Legacy single mode
                    ownerIds.push(mapData.ownerId);
                } else {
                    // Multi mode
                    ownerIds = Object.keys(mapData);
                }

                // Add these to available workspaces
                const workspacePromises = ownerIds.map(async oid => {
                    let name = 'Empresa ' + oid.slice(0, 4);
                    try {
                        const snap = await db.ref(`users/${oid}/config/companyName`).once('value');
                        name = snap.val() || name;
                    } catch (e) { console.warn('Error fetching name for ' + oid); }

                    return {
                        ownerId: oid,
                        type: 'admin',
                        name: name
                    };
                });

                const workspaces = await Promise.all(workspacePromises);
                Store.currentContext.availableWorkspaces.push(...workspaces);

                console.log(`Loaded ${workspaces.length} admin workspaces with names.`);
            }
        } catch (e) {
            console.error("Error loading admin map", e);
        }
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
        if (Store.currentContext.role !== 'owner') return;

        const emailKey = email.replace(/\./g, ',');

        await db.ref(`admin_map/${emailKey}/${user.uid}`).remove();
        // Remove from both to be safe
        await db.ref(`users/${user.uid}/config/admins/${emailKey}`).remove();
        await db.ref(`users/${user.uid}/authorized_admins/${emailKey}`).remove();
    },

    removeAdmin: async (email) => {
        const user = Auth.getCurrentUser();
        const emailKey = email.replace(/\./g, ',');

        await db.ref(`admin_map/${emailKey}/${user.uid}`).remove();
        await db.ref(`users/${user.uid}/config/admins/${emailKey}`).remove();
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
        await newRef.set(project);

        const projectId = newRef.key;
        await Store.initializeProjectDefaults(projectId, projectData.rubros, projectData.responsables);
        await db.ref(`project_data/${projectId}/name`).set(projectData.name);

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
        return snapshot.val() || { tasks: {}, rubros: [], responsables: [], name: 'Proyecto Compartido' };
    },

    // Tasks
    addTask: async (projectId, taskData) => {
        const ref = db.ref(`project_data/${projectId}/tasks`).push();
        await ref.set(taskData);
        return { id: ref.key, ...taskData };
    },

    updateTask: async (projectId, taskId, updates) => {
        // Recurrence Logic
        if (updates.estado === 'Realizado') {
            const taskRef = db.ref(`project_data/${projectId}/tasks/${taskId}`);
            const snapshot = await taskRef.once('value');
            const task = snapshot.val();

            if (task && task.recurrence && task.recurrence.type !== 'none') {
                // Calculate next date
                const recurrence = task.recurrence;
                let nextDate = new Date();
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
                const newTask = {
                    ...task,
                    estado: 'Pendiente',
                    deadline: nextDate.toISOString().split('T')[0],
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

    // Config
    updateRubros: async (projectId, rubros) => {
        await db.ref(`project_data/${projectId}/rubros`).set(rubros);
    },

    updateResponsables: async (projectId, responsables) => {
        await db.ref(`project_data/${projectId}/responsables`).set(responsables);
    },

    // --- Templates System ---

    // Project Templates
    createProjectTemplate: async (templateData) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        // Templates belong to the OWNER
        const ownerId = Store.currentContext.ownerId;
        const ref = db.ref(`users/${ownerId}/project_templates`).push();
        const template = { ...templateData, id: ref.key, createdBy: user.email };
        await ref.set(template);
        return template;
    },

    getProjectTemplates: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        const ownerId = Store.currentContext.ownerId;
        const snapshot = await db.ref(`users/${ownerId}/project_templates`).once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    },

    deleteProjectTemplate: async (id) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId;
        await db.ref(`users/${ownerId}/project_templates/${id}`).remove();
    },

    updateProjectTemplate: async (id, updates) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId;
        await db.ref(`users/${ownerId}/project_templates/${id}`).update(updates);
    },

    // Task Templates
    createTaskTemplate: async (templateData) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        // Task templates belong to the OWNER
        const ownerId = Store.currentContext.ownerId;
        const ref = db.ref(`users/${ownerId}/task_templates`).push();
        const template = { ...templateData, id: ref.key, createdBy: user.email };
        await ref.set(template);
        return template;
    },

    getTaskTemplates: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        const ownerId = Store.currentContext.ownerId;
        const snapshot = await db.ref(`users/${ownerId}/task_templates`).once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    },

    deleteTaskTemplate: async (id) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId;
        await db.ref(`users/${ownerId}/task_templates/${id}`).remove();
    },

    // Storage
    uploadFile: async (file, context = {}) => {
        const user = Auth.getCurrentUser();
        if (!user) throw new Error("Usuario no autenticado");

        // Create a unique path: uploads/{ownerId}/{timestamp}_{filename}
        const ownerId = Store.currentContext.ownerId;
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const path = `uploads/${ownerId}/${timestamp}_${safeName}`;

        const ref = storage.ref(path);

        // Upload
        const snapshot = await ref.put(file);

        // Get URL
        const url = await snapshot.ref.getDownloadURL();
        return url;
    },

    // Integrations
    getIntegrations: async () => {
        const user = Auth.getCurrentUser();
        if (!user) return {};
        // Always usage owner context for settings
        const ownerId = Store.currentContext.ownerId;
        const snap = await db.ref(`users/${ownerId}/integrations`).once('value');
        return snap.val() || {};
    },

    saveIntegration: async (name, settings) => {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const ownerId = Store.currentContext.ownerId;
        await db.ref(`users/${ownerId}/integrations/${name}`).update(settings);
    }
};
