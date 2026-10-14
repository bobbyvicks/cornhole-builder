/* History owns its copies of plain design data. Copy containers recursively
   so later edits cannot reach them, while immutable image strings stay
   shared rather than being embedded in another serialized project.
   Keep the JSON treatment of optional fields, array holes and numbers. */
const numberValue = value => typeof value === 'number' ? (Number.isFinite(value) ? (value === 0 ? 0 : value) : null) : value;
const keys = value => Object.keys(value).filter(key => value[key] !== undefined);

export function copyHistoryState(value) {
  value = numberValue(value);
  if (Array.isArray(value)) return Array.from(value, item => copyHistoryState(item ?? null));
  if (value && typeof value === 'object') {
    return Object.fromEntries(keys(value).map(key => [key, copyHistoryState(value[key])]));
  }
  return value;
}

export function sameHistoryState(a, b) {
  a = numberValue(a); b = numberValue(b);
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameHistoryState(a[i] ?? null, b[i] ?? null)) return false;
    return true;
  }
  const aKeys = keys(a), bKeys = keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key, i) => key === bKeys[i] && sameHistoryState(a[key], b[key]));
}
