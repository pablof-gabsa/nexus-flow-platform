const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsPath = path.join(__dirname, '..', 'js', 'utils.js');
const source = `${fs.readFileSync(utilsPath, 'utf8')}\nglobalThis.Utils = Utils;`;
const context = {};

vm.createContext(context);
vm.runInContext(source, context);

const tasks = [
    { id: 'public-task', requerimiento: 'Visible' },
    { id: 'confidential-task', requerimiento: 'Oculta', confidential: true },
    { id: 'legacy-false-task', requerimiento: 'Visible legacy', confidential: false }
];

assert.deepStrictEqual(
    context.Utils.filterSharedVisibleTasks(tasks, false).map(task => task.id),
    ['public-task', 'confidential-task', 'legacy-false-task'],
    'owner/admin views should keep confidential tasks visible'
);

assert.deepStrictEqual(
    context.Utils.filterSharedVisibleTasks(tasks, true).map(task => task.id),
    ['public-task', 'legacy-false-task'],
    'shared guest/collaborator views should hide confidential tasks'
);

assert.strictEqual(
    context.Utils.filterSharedVisibleTasks(null, true).length,
    0,
    'missing task lists should return an empty array'
);
