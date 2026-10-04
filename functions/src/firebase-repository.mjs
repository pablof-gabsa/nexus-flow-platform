import { hash, NexusError } from './validation.mjs';

export class FirebaseRepository {
  constructor(database, firestore, auth) { this.database = database; this.firestore = firestore; this.auth = auth; }
  async get(path) { return (await this.database.ref(path).get()).val(); }
  async getUser(uid) { try { return await this.auth.getUser(uid); } catch (e) { if (e.code === 'auth/user-not-found') return null; throw e; } }
  async verifyFirebase(token) { return this.auth.verifyIdToken(token, true); }
  async privateGet(collection, id) { return (await this.firestore.collection(`nexus_assistant_${collection}`).doc(id).get()).data() || null; }
  async privatePut(collection, id, data) { await this.firestore.collection(`nexus_assistant_${collection}`).doc(id).set(data); }
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
    let rejected;
    const result = await this.database.ref(`project_data/${projectId}/tasks/${taskId}`).transaction(current => {
      try { return update(current); } catch (error) { rejected = error; return; }
    }, undefined, false);
    if (rejected) throw rejected;
    if (!result.committed) throw new Error('No se pudo guardar la tarea.');
    return result.snapshot.val();
  }
}
