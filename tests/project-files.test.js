const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(options = {}) {
    const requests = [], urls = [], events = {};
    const context = { console, Uint8Array, crypto: globalThis.crypto, Map, Set, Blob, FileReader: class {
        readAsDataURL(file) { this.result = `data:${file.type};base64,aGVsbG8=`; this.onload(); }
    }, URL: { createObjectURL: () => { const url = `blob:test-${urls.length}`; urls.push(url); return url; }, revokeObjectURL() {} },
    document: { addEventListener: (name, handler) => events[name] = handler },
    AssistantAPI: { base: () => 'https://nexus.example', publicRequest: async (route, options) => { requests.push({ route, ...options }); return { url: 'https://nexus.example/v1/project-files/project/' + 'a'.repeat(32) }; } },
    Auth: { getCurrentUser: () => ({ uid: 'owner', getIdToken: async () => 'session' }) },
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: true, blob: async () => new Blob(['hello'], { type: 'image/png' }) }; }, ...options };
    context.window = context;
    vm.createContext(context);
    for (const file of ['js/utils.js', 'js/services/store.js', 'js/services/project-files.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + (file.endsWith('store.js') ? '\nglobalThis.Store = Store;' : ''), context);
    }
    return { context, requests, urls, events };
}

test('rendering private images requests no file and keeps stored references free of credentials', () => {
    const { context, requests } = setup();
    const reference = 'https://nexus.example/v1/project-files/project/' + 'a'.repeat(32);
    const markup = context.ProjectFiles.imageAttributes(reference);
    assert(markup.includes('data-nexus-file="' + reference + '"'));
    assert(!markup.includes('src="https://nexus.example'));
    assert.equal(requests.length, 0);
    assert.equal(context.ProjectFiles.parse('https://other.example/v1/project-files/project/' + 'a'.repeat(32)), null);
});

test('private downloads reuse a displayed file only within the same access context', async () => {
    const { context, requests, urls } = setup();
    const reference = 'https://nexus.example/v1/project-files/project/' + 'a'.repeat(32);
    const first = await context.ProjectFiles.resolve(reference);
    assert.equal((await context.ProjectFiles.resolve(reference)).url, first.url);
    assert.equal(requests.length, 1);
    context.Store.sharedAccess = { projectId: 'project', token: 'visitor-token-123' };
    assert.notEqual((await context.ProjectFiles.resolve(reference)).url, first.url);
    assert.equal(requests.length, 2);
    assert.equal(JSON.parse(requests[1].body).token, 'visitor-token-123');
    assert(!requests[1].headers.Authorization);
    assert.equal(urls.length, 2);
    await assert.rejects(context.ProjectFiles.resolve('https://nexus.example/v1/project-files/foreign/' + 'a'.repeat(32)), /otro proyecto/);
    assert.equal(requests.length, 2);
});

test('new uploads send bytes to the private endpoint and return only a reference', async () => {
    const { context, requests } = setup({ db: { ref() { throw new Error('File upload must not write to the database'); } }, storage: { ref() { throw new Error('File upload must not expose a public URL'); } } });
    context.Store.sharedAccess = { projectId: 'project', token: 'collaborator-token-123' };
    const result = await context.Store.uploadFile({ name: 'foto.png', type: 'image/png', size: 5 }, { projectId: 'project', forceBase64: true, fallbackToBase64: true });
    assert(result.startsWith('https://nexus.example/v1/project-files/project/'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].route, '/v1/project-files/upload');
    const body = JSON.parse(requests[0].body);
    assert.equal(body.data, 'aGVsbG8='); assert.equal(body.token, 'collaborator-token-123');
    await assert.rejects(context.Store.uploadFile({ size: 11 * 1024 * 1024 }, { projectId: 'project' }), /10 MB/);
    assert.equal(requests.length, 1);
});
