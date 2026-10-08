import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));

// Used only by the explicit loading trial. Production writes do not call this.
export async function separateInlineFiles(source, {save, read, urlFor}) {
  const data = structuredClone(source), files = [];
  const replace = async (value, location) => {
    if (typeof value !== 'string' || !value.startsWith('data:')) return value;
    const match = /^data:([^;]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
    if (!match) throw new Error('Unsupported inline attachment; original retained');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2]) throw new Error('Invalid inline attachment; original retained');
    const hash = digest(bytes), key = `${location.kind}/${location.id}/${location.field}/${location.index}-${hash}`;
    await save(key, bytes, match[1]);
    const saved = await read(key);
    if (digest(saved) !== hash || saved.length !== bytes.length) throw new Error('Stored attachment verification failed; original retained');
    const file = {...location, key, hash, size: bytes.length, type: match[1]};
    files.push(file);
    return urlFor(file);
  };
  for (const [id, task] of Object.entries(data.tasks || {})) {
    const sharedVisible = !task.confidential && task.rubro !== 'Eliminado';
    for (const [index, file] of (task.attachments || []).entries()) {
      file.data = await replace(file.data, {kind:'tasks', id, field:'attachments', index, sharedVisible});
    }
  }
  for (const [id, asset] of Object.entries(data.assets || {})) {
    const sharedVisible = !asset.confidential;
    if (asset.image) asset.image = await replace(asset.image, {kind:'assets', id, field:'image', index:0, sharedVisible});
    for (const [index, file] of (asset.documents || []).entries()) {
      file.data = await replace(file.data, {kind:'assets', id, field:'documents', index, sharedVisible});
    }
  }
  return {data, files};
}
