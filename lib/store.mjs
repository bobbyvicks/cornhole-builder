/* WHERE A PROJECT IS KEPT ON THIS DEVICE.

   IndexedDB first: it holds many megabytes, so a design with pictures in
   it is saved whole. localStorage only when IndexedDB is unavailable (some
   private windows), and then a project that does not fit FAILS LOUDLY:
   the save rejects, the page shows it and offers an export, and nothing
   is quietly thrown away. The earlier page dropped the pictures to make a
   save fit, and told no one.

   A project may end up in both places - IndexedDB until the browser closed
   the connection behind the page's back, localStorage after - so a load
   reads both and takes the newer one by its savedAt. */
const DB = 'cornhole', STORE = 'project', KEY = 'current';
const LS_KEY = 'cornhole.project.v2';
const LEGACY_KEY = 'cornhole.design.v1';

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexeddb')); return; }
    let r;
    try { r = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      /* Safari closes idle connections of background tabs, and Chrome
         closes them when site data is cleared: the next call opens anew. */
      db.onclose = () => { dbPromise = null; };
      res(db);
    };
    r.onerror = () => rej(r.error || new Error('indexeddb open failed'));
    r.onblocked = () => rej(new Error('indexeddb blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
function once(mode, fn) {
  return openDb().then((db) => new Promise((res, rej) => {
    let req;
    try { const t = db.transaction(STORE, mode); req = fn(t.objectStore(STORE)); t.onerror = () => rej(t.error || new Error('transaction failed')); t.onabort = () => rej(t.error || new Error('transaction aborted')); t.oncomplete = () => res(req && req.result); }
    catch (e) { rej(e); }
  }));
}
/* A connection the browser closed without saying so throws
   InvalidStateError on its next transaction: open again, once. */
async function run(mode, fn) {
  try { return await once(mode, fn); }
  catch (e) {
    if (e && e.name === 'InvalidStateError') { dbPromise = null; return once(mode, fn); }
    throw e;
  }
}

const newer = (a, b) => ((b.savedAt || '') > (a.savedAt || '') ? b : a);

/** The project last saved here, or null. Reads the current store in both
    places and takes the newer, then the earliest format, so nobody's draft
    is lost to an upgrade. */
export async function loadProject() {
  let idb = null, ls = null;
  try { const p = await run('readonly', (s) => s.get(KEY)); if (p && p.design) idb = p; } catch (_) {}
  try { const s = localStorage.getItem(LS_KEY); if (s) { const p = JSON.parse(s); if (p && p.design) ls = p; } } catch (_) {}
  if (idb && ls) return newer(idb, ls);
  if (idb || ls) return idb || ls;
  try { const s = localStorage.getItem(LEGACY_KEY); if (s) { const d = JSON.parse(s); if (d && d.a && d.b) return { version: 1, design: d, order: null }; } } catch (_) {}
  return null;
}

/** Saves the project; resolves with where it went, rejects when it could
    not be kept anywhere. */
export async function saveProject(project) {
  try { await run('readwrite', (s) => s.put(project, KEY)); return 'indexeddb'; }
  catch (e1) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(project)); return 'localstorage'; }
    catch (e2) { const err = new Error('The browser refused to store the project'); err.cause = e2; err.first = e1; throw err; }
  }
}

/** Forgets the saved project, in every place it may be. */
export async function forgetProject() {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch (_) {}
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LEGACY_KEY); } catch (_) {}
}
