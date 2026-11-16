const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const checklist = { innerHTML: '' };
let printed = [];
const context = {
    UI: { hideTextTooltip: () => {} },
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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/utils.js'), 'utf8') +
    '\nObject.assign(Utils, globalThis.Utils);', context);
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

    const subarea = "Obras › Agua & 'Riego'";
    const nestedArea = subarea + ' › Pozos';
    project.rubros = [nestedArea, 'Servicios', 'Obras', subarea, 'Eliminado'];
    project.filters.priority = 'Todos';
    project.openRubros = new Set(['Obras', subarea, nestedArea]);
    project.data = [task('Inspección', null, 'Alta', nestedArea), task('Reparación', null, 'Alta', subarea)];
    project.renderChecklist();
    assert.deepEqual(Array.from(project.orderedRubros()), ['Servicios', 'Obras', subarea, nestedArea, 'Eliminado']);
    assert.match(checklist.innerHTML, /data-rubro="Obras"[\s\S]*data-rubro="Obras › Agua &amp; &#39;Riego&#39;"[\s\S]*\[Reparación\][\s\S]*\[Inspección\]/);
    assert.match(project.rubroOptions(project.rubros, subarea), /value="Obras › Agua &amp; &#39;Riego&#39;" selected/);
    printed = [];
    await project.generatePDF([subarea, nestedArea]);
    assert.deepEqual(printed, ['Reparación', 'Inspección']);
    project.openRubros.clear();
    project.renderChecklist();
    const closedParent = checklist.innerHTML.slice(checklist.innerHTML.indexOf('data-rubro="Obras"'));
    assert.match(closedParent, /class="hidden[^\"]*">\s*<\/div>\s*<div data-subareas="Obras"/,
        'subareas remain outside the collapsed parent task container');
    const escapedSubarea = vm.runInContext('Utils.escapeHTML', context)(subarea);
    assert.ok(closedParent.includes(`data-rubro="${escapedSubarea}"`));
    console.log('PDF and checklist order verified for all sort modes and directions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
