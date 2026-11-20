const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const checklist = { innerHTML: '' };
let printed = [];
let drawn = [];
let page;
const context = {
    UI: { hideTextTooltip: () => {} },
    document: {
        getElementById: id => id === 'checklist-container' ? checklist : {
            innerText: 'Proyecto', textContent: 'Empresa'
        }
    },
    Utils: { imageToBase64: async () => null, isDateOverdue: () => false },
    window: { jspdf: { jsPDF: function () {
        drawn = [];
        page = 1;
        let font;
        let size;
        return new Proxy({
            internal: { getNumberOfPages: () => page },
            addPage: () => { page++; },
            setFont: (_, style) => { font = style; },
            setFontSize: value => { size = value; },
            splitTextToSize: text => text.split("\n"),
            text: (text, x, y) => {
                if (font === "bold" && size === 10 && x === 24) printed.push(text);
                drawn.push({ text, page, y });
            }
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
    function visibleContent() {
        const hidden = [];
        let visible = '';
        for (const token of checklist.innerHTML.match(/<[^>]+>|[^<]+/g)) {
            if (token.startsWith('<div ')) hidden.push((token.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/).includes('hidden'));
            if (!hidden.includes(true)) visible += token;
            if (token === '</div>') hidden.pop();
        }
        return visible;
    }
    const escapedSubarea = vm.runInContext('Utils.escapeHTML', context)(subarea);
    const escapedNested = vm.runInContext('Utils.escapeHTML', context)(nestedArea);
    assert.ok(!visibleContent().includes(`data-rubro="${escapedSubarea}"`));
    project.toggleRubro('Obras');
    assert.ok(visibleContent().includes(`data-rubro="${escapedSubarea}"`));
    assert.ok(!visibleContent().includes(`data-rubro="${escapedNested}"`));
    project.toggleRubro(subarea);
    assert.ok(visibleContent().includes(`data-rubro="${escapedNested}"`));
    assert.ok(!visibleContent().includes(`[${project.data[0].requerimiento}]`));
    assert.ok(visibleContent().includes(`[${project.data[1].requerimiento}]`));
    project.toggleRubro(nestedArea);
    assert.ok(visibleContent().includes(`[${project.data[0].requerimiento}]`));
    project.toggleRubro('Obras');
    assert.ok(!visibleContent().includes(`data-rubro="${escapedSubarea}"`));
    assert.ok(!visibleContent().includes(`[${project.data[0].requerimiento}]`));
    project.sortBy = 'manual';
    const lines = count => Array.from({ length: count }, (_, i) => 'Detalle ' + i).join('\n');
    const nextTask = { ...task('Revisar bomba', null, 'Alta'), description: lines(12),
        subtasks: [{ text: 'Verificar presión\nRegistrar resultado', done: false }] };
    project.data = [{ ...task('Primera tarea', null, 'Alta'), description: lines(35) }, nextTask];
    await project.generatePDF(['Obras']);
    const secondPage = drawn.filter(entry => entry.page === 2).map(entry => entry.text);
    assert.ok(secondPage.includes('Revisar bomba') && secondPage.includes('PENDIENTE'));
    assert.ok(secondPage.includes('Detalle 0') && secondPage.includes('Detalle 11'));
    assert.ok(secondPage.some(line => line.startsWith('Prioridad:')));
    assert.ok(secondPage.includes('Registrar resultado'));
    assert.equal(page, 2);

    project.data = [{ ...nextTask, description: lines(140) }];
    await project.generatePDF(['Obras']);
    assert.ok(page >= 3);
    const details = drawn.filter(entry => entry.text.startsWith('Detalle '));
    assert.deepEqual(details.map(entry => entry.text), lines(140).split('\n'));
    assert.ok(details.every(entry => entry.y >= 20 && entry.y <= 280));
    assert.equal(drawn.filter(entry => entry.text === 'Continuación de la tarea').length, page - 1);
    console.log('PDF and checklist order verified for all sort modes and directions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
