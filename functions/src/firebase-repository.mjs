import { hash, NexusError } from './validation.mjs';

export class FirebaseRepository {
  constructor(database, firestore, auth, bucket) { this.database = database; this.firestore = firestore; this.auth = auth; this.bucket = bucket; }
  async saveFile(key, bytes, type) {
    await this.bucket.file(key).save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: type, cacheControl: 'private, no-store' } });
  }
  async readFile(key) { const [bytes] = await this.bucket.file(key).download(); return bytes; }
  async get(path) { return (await this.database.ref(path).get()).val(); }
  async getUser(uid) { try { return await this.auth.getUser(uid); } catch (e) { if (e.code === 'auth/user-not-found') return null; throw e; } }
  async verifyFirebase(token) { return this.auth.verifyIdToken(token, true); }
  async privateGet(collection, id) { return (await this.firestore.collection(`nexus_assistant_${collection}`).doc(id).get()).data() || null; }
  async privatePut(collection, id, data) { await this.firestore.collection(`nexus_assistant_${collection}`).doc(id).set(data); }
  async privateTransaction(collection, id, change) {
    const ref = this.firestore.collection(`nexus_assistant_${collection}`).doc(id);
    return this.firestore.runTransaction(async transaction => {
      const value = change((await transaction.get(ref)).data() || null);
      transaction.set(ref, value);
      return value;
    });
  }
  async updateRoot(changes) { await this.database.ref().update(changes); }
  async privateConsume(collection, id, predicate) {
    const ref = this.firestore.collection(`nexus_assistant_${collection}`).doc(id);
    return this.firestore.runTransaction(async transaction => {
      const data = (await transaction.get(ref)).data();
      if (!data || !predicate(data)) return null;
      transaction.delete(ref);
      return data;
    });
  }
  async privateList(collection, uid) {
    const snapshot = await this.firestore.collection(`nexus_assistant_${collection}`).where('uid', '==', uid).orderBy('createdAt', 'desc').limit(100).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  async throttle(key, limit, windowMs) {
    const now = Date.now();
    const ref = this.firestore.collection('nexus_assistant_rate_limits').doc(hash(key));
    await this.firestore.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data();
      const count = current && current.resetAt > now ? current.count : 0;
      if (count >= limit) throw new NexusError(429, 'rate_limited', 'Demasiados pedidos. Esperá un minuto.');
      transaction.set(ref, { count: count + 1, resetAt: current && current.resetAt > now ? current.resetAt : now + windowMs });
    });
  }
  async taskTransaction(projectId, taskId, update) {
    return this.transaction(`project_data/${projectId}/tasks/${taskId}`, update);
  }
  async tasksTransaction(projectId, update) {
    return this.transaction(`project_data/${projectId}/tasks`, update);
  }
  async transaction(path, update) {
    const ref = this.database.ref(path);
    let listener;
    try {
      // A cold transaction starts with null even for an existing task. Keep the
      // initial value subscribed until completion so absence checks use data.
      await new Promise((resolve, reject) => {
        listener = snapshot => resolve(snapshot);
        ref.on('value', listener, reject);
      });
      let rejected;
      const result = await ref.transaction(current => {
        rejected = undefined;
        try {
          const value = update(current);
          if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 15 * 1024 * 1024) throw new NexusError(413, 'task_data_too_large', 'Los datos superan el tamaño de una escritura. Usá enlaces HTTPS para los adjuntos grandes. No se guardó ningún cambio.');
          return value;
        } catch (error) { rejected = error; return; }
      }, undefined, false);
      if (rejected) throw rejected;
      if (!result.committed) throw new Error('No se pudo guardar la tarea.');
      return result.snapshot.val();
    } finally {
      if (listener) ref.off('value', listener);
    }
  }
}
