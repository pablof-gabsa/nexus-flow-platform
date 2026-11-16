const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(context, file, name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + `\nglobalThis.subject = ${name};`, context);
    return context.subject;
}

test('area transaction retains cache and rejects a real concurrent change', async () => {
    let stored = ['Infraestructura'];
    let cached = null;
    const listeners = new Set();
    const ref = {
        on: (event, callback) => listeners.add(callback),
        off: (event, callback) => listeners.delete(callback),
        once: async () => { cached = listeners.size ? stored : null; },
        transaction: async callback => {
            const result = callback(cached);
            if (result === undefined) return { committed: false };
            stored = result;
            return { committed: true };
        }
    };
    const context = vm.createContext({ db: { ref: () => ref } });
    const store = load(context, 'js/services/store.js', 'Store');
    const initial = [...stored];
    const updated = [...stored, 'Infraestructura > Red Pluvial'];
    await store.updateRubros('project', updated, initial);
    assert.deepEqual(stored, updated);
    assert.equal(listeners.size, 0);
    await assert.rejects(store.updateRubros('project', ['Otra'], initial), /cambiaron/);
    assert.deepEqual(stored, updated);
    assert.equal(listeners.size, 0);
});

test('tasks can be created and moved to both parent areas and subareas', async () => {
    const writes = [];
    const fields = {};
    const elements = {};
    const context = vm.createContext({
        console,
        document: { getElementById: id => elements[id] ||= { value: '', classList: { add() {} } } },
        FormData: class { get(key) { return fields[key] || ''; } },
        UI: { showToast(message, type) { assert.notEqual(type, 'error', message); } },
        Store: {
            addTask: async (id, data) => writes.push(data),
            updateTask: async (projectId, id, data) => writes.push(data)
        }
    });
    const utils = load(context, 'js/utils.js', 'Utils');
    const project = load(context, 'js/components/project.js', 'ProjectComponent');
    project.isEditable = true;
    project.projectId = 'project';
    project.refreshUI = () => {};
    project.rubros = ['Infraestructura', 'Infraestructura > Red Pluvial'];
    for (const area of project.rubros) {
        fields.rubro = area;
        fields.requerimiento = 'Tarea de prueba';
        await project.handleTaskSubmit({ preventDefault() {}, target: {} });
        assert.equal(writes.at(-1).rubro, area);
        context.document.getElementById('move-rubro-select').value = area;
        project.movingTaskId = 'task';
        await project.confirmMoveTask();
        assert.equal(writes.at(-1).rubro, area);
        assert.ok(project.rubroOptions(project.rubros, area).includes(`value="${utils.escapeHTML(area)}" selected`));
    }
});
