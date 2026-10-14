/* WHERE A PROJECT IS KEPT ON THIS DEVICE.

   IndexedDB first: it holds many megabytes, so a design with pictures in
   it is saved whole. localStorage only when IndexedDB is unavailable (some
   private windows), and then a project that does not fit FAILS LOUDLY:
   the save rejects, the page shows it and offers an export, and nothing
   is quietly thrown away. The earlier page dropped the pictures to make a
   save fit, and told no one. */
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
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbPromise = null; }; res(r.result); };
    r.onerror = () => rej(r.error || new Error('indexeddb open failed'));
    r.onblocked = () => rej(new Error('indexeddb blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
function run(mode, fn) {
  return openDb().then((db) => new Promise((res, rej) => {
    let req;
    try { const t = db.transaction(STORE, mode); req = fn(t.objectStore(STORE)); t.onerror = () => rej(t.error || new Error('transaction failed')); t.onabort = () => rej(t.error || new Error('transaction aborted')); t.oncomplete = () => res(req && req.result); }
    catch (e) { rej(e); }
  }));
}

const savedTime = (project) => {
  const time = typeof project?.savedAt === 'string' ? Date.parse(project.savedAt) : NaN;
  return Number.isFinite(time) ? time : -Infinity;
};

/** The project last saved here, or null. An IndexedDB write can fail while
    its older draft stays readable, so compare both current stores. A
    dated fallback wins a tie: it may be a later edit in the same millisecond.
    Without usable dates, keep the earlier IndexedDB-first behaviour. */
export async function loadProject({ validate = () => {} } = {}) {
  let current = null, unreadable = false;
  const candidate = (p) => {
    if (p === null || p === undefined) return null;
    try {
      if (!p.design || validate(p) === false) throw new Error('Invalid saved project');
      return p;
    } catch (_) { unreadable = true; return null; }
  };
  // Validate before comparing dates: a damaged newer record must not hide
  // an intact older copy. Reading never rewrites or removes either copy.
  try { current = candidate(await run('readonly', (s) => s.get(KEY))); } catch (_) { unreadable = true; }
  try {
    const s = localStorage.getItem(LS_KEY), p = s === null ? null : candidate(JSON.parse(s));
    if (p && (!current || (savedTime(p) !== -Infinity && savedTime(p) >= savedTime(current)))) current = p;
  } catch (_) { unreadable = true; }
  if (current) return current;
  try {
    const s = localStorage.getItem(LEGACY_KEY);
    if (s !== null) {
      const d = JSON.parse(s);
      if (d && d.a && d.b) { const p = candidate({ version: 1, design: d, order: null }); if (p) return p; }
      else unreadable = true;
    }
  } catch (_) { unreadable = true; }
  if (unreadable) throw new Error('The saved project could not be read');
  return null;
}

/** Saves the project; resolves with where it went, rejects when it could
    not be kept anywhere. */
export async function saveProject(project) {
  try {
    await run('readwrite', (s) => s.put(project, KEY));
    /* After recovery, an older fallback must not win a timestamp tie.
       Leave a newer fallback alone; cleanup failure cannot undo this save. */
    try {
      const s = localStorage.getItem(LS_KEY), p = s && JSON.parse(s);
      if (p && (!p.design || savedTime(project) >= savedTime(p))) localStorage.removeItem(LS_KEY);
    } catch (_) {}
    return 'indexeddb';
  }
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
