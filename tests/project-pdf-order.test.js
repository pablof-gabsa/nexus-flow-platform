const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const checklist = { innerHTML: '' };
let printed = [];
const context = {
    document: {
        getElementById: id => id === 'checklist-container' ? checklist : {
            innerText: 'Proyecto', textContent: 'Empresa'
        }
    },
    Utils: { imageToBase64: async () => null, isDateOverdue: () => false },
    window: { jspdf: { jsPDF: function () {
        return new Proxy({
            internal: { getNumberOfPages: () => 1 },
            splitTextToSize: text => [text],
            text: text => { if (Array.isArray(text)) printed.push(text[0]); }
        }, { get: (target, key) => target[key] || (() => {}) });
    } } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/components/project.js'), 'utf8') +
    '\nglobalThis.project = ProjectComponent;', context);
const project = context.project;
const task = (name, deadline, priority, rubro = 'Obras') => ({
    requerimiento: name, deadline, prioridad: priority, rubro, estado: 'Pendiente'
});
project.data = [
    task('Zeta', '2026-10-03', 'Baja'),
    task('Beta', null, 'Alta'),
    task('Alfa', '2026-10-01', 'Crítico'),
    task('Delta', null, 'Alta'),
    task('Otra tarea', '2026-10-02', 'Media', 'Servicios')
];
project.rubros = ['Servicios', 'Obras'];
project.renderTaskItem = item => `[${item.requerimiento}]`;
const original = JSON.stringify(project.data);

(async () => {
    const orders = {
        deadline: ['Alfa', 'Zeta', 'Beta', 'Delta'],
        priority: ['Alfa', 'Beta', 'Delta', 'Zeta'],
        name: ['Alfa', 'Beta', 'Delta', 'Zeta'],
        manual: ['Zeta', 'Beta', 'Alfa', 'Delta']
    };
    for (const [sort, ascending] of Object.entries(orders)) {
        for (const direction of ['asc', 'desc']) {
            project.sortBy = sort;
            project.sortOrder = direction;
            const descending = sort === 'priority' ? ['Zeta', 'Beta', 'Delta', 'Alfa'] :
                sort === 'manual' ? ascending : [...ascending].reverse();
            const expected = ['Otra tarea', ...(direction === 'asc' ? ascending : descending)];
            project.renderChecklist();
            const visible = Array.from(checklist.innerHTML.matchAll(/\[([^\]]+)\]/g), match => match[1]);
            assert.deepEqual(visible, expected, `${sort}/${direction}: checklist`);
            printed = [];
            await project.generatePDF('all');
            assert.deepEqual(printed, expected, `${sort}/${direction}: PDF`);
        }
    }
    project.filters.priority = 'Alta';
    project.sortBy = 'name';
    project.sortOrder = 'desc';
    printed = [];
    await project.generatePDF(['Obras']);
    assert.deepEqual(printed, ['Delta', 'Beta'], 'PDF keeps filters and selected rubros');
    assert.equal(JSON.stringify(project.data), original, 'sorting must not mutate stored tasks');
    console.log('PDF and checklist order verified for all sort modes and directions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
