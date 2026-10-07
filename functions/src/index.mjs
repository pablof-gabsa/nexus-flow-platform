import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { FirebaseRepository } from './firebase-repository.mjs';
import { createApp } from './app.mjs';

export function productionApp() {
  const app = getApps()[0] || initializeApp({ databaseURL: 'https://nexus-flow-6dac7-default-rtdb.firebaseio.com' });
  const baseUrl = process.env.NEXUS_ASSISTANT_BASE_URL || 'https://nexus-flow-6dac7.web.app';
  const webUrl = process.env.NEXUS_WEB_URL || 'https://pablof-gabsa.github.io/nexus-flow-platform/';
  const repo = new FirebaseRepository(getDatabase(app), getFirestore(app, 'nexus-assistants'), getAuth(app));
  return createApp(repo, { baseUrl: baseUrl.replace(/\/$/, ''), webUrl });
}
let app;
export const nexusAssistants = onRequest({ region: 'us-central1', memory: '1GiB', concurrency: 1, timeoutSeconds: 60, maxInstances: 3, serviceAccount: 'nexus-assistants@nexus-flow-6dac7.iam.gserviceaccount.com', invoker: 'public' }, (req, res) => {
  app ||= productionApp();
  return app(req, res);
});
