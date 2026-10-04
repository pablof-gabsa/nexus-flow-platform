import { productionApp } from './index.mjs';
productionApp().listen(8787, '127.0.0.1', () => console.log('Nexus API/MCP: http://127.0.0.1:8787 (requiere credenciales Firebase o emuladores).'));
