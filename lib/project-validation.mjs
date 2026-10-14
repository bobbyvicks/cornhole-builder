/* Import is a trust boundary: validate the whole document before migrate,
   rendering, or saving touches the current customer project. Missing legacy
   defaults are allowed; values explicitly supplied must be safe to render. */
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH = 10 * 1024 * 1024;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
}
function number(value, label, min, max, required = false) {
  if (value === undefined && !required) return;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(label + ' must be a number between ' + min + ' and ' + max);
}
function string(value, label, max, required = false, empty = true) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length)) throw new Error(label + ' must be ' + (empty ? '' : 'non-empty ') + 'text of at most ' + max + ' characters');
}
function boolean(value, label) {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(label + ' must be true or false');
}
function color(value, label, required = false) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(label + ' colour must use six hexadecimal digits, such as #1f3a93');
}
function choice(value, label, choices, required = false) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || !Object.hasOwn(choices, value)) throw new Error(label + ' is not supported');
}
function image(value, label, required = false) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > MAX_IMAGE_URL_LENGTH) throw new Error(label + ' must be an embedded image smaller than 10 MB');
  const comma = value.indexOf(','), header = value.slice(0, comma), data = value.slice(comma + 1);
  if (!/^data:image\/(png|jpe?g|webp|gif|bmp|avif|x-icon|vnd\.microsoft\.icon)(;charset=[a-z0-9._-]+)?;base64$/i.test(header) || !data.length) {
    throw new Error(label + ' must be an embedded PNG, JPEG, WebP, GIF, BMP or AVIF image');
  }
  try { atob(data); }
  catch (_) { throw new Error(label + ' contains invalid embedded image data'); }
}

function element(el, label, clips) {
  object(el, label);
  choice(el.type, label + ' type', { text: true, image: true, clip: true }, true);
  string(el.id, label + ' ID', 128);
  // Wider than the controls and checkout limits to retain old projects with
  // off-board layers. Reject values large enough to break canvas geometry.
  number(el.x, label + ' horizontal position', -100, 124, true);
  number(el.y, label + ' vertical position', -100, 148, true);
  number(el.rotation, label + ' rotation', -3600, 3600);
  if (el.type === 'text') {
    string(el.text, label + ' text', 1000, true);
    string(el.font, label + ' font', 100, true, false);
    number(el.size, label + ' text size', 0.01, 100, true);
    color(el.color, label + ' text', true);
    color(el.outline, label + ' outline');
    number(el.outlineWidth, label + ' outline width', 0, 10);
    number(el.arc, label + ' arc', -360, 360);
    number(el.spacing, label + ' letter spacing', -2, 10);
    boolean(el.shadow, label + ' shadow');
    boolean(el.autoFit, label + ' automatic fitting');
    if (el.fitReference !== undefined) {
      object(el.fitReference, label + ' fitting reference');
      string(el.fitReference.text, label + ' reference text', 1000, true);
      string(el.fitReference.font, label + ' reference font', 100, false, false);
      number(el.fitReference.size, label + ' reference size', 0.01, 100, true);
      number(el.fitReference.spacing, label + ' reference spacing', -2, 10);
    }
  } else {
    number(el.width, label + ' width', 0.01, 100, el.type === 'image');
    number(el.opacity, label + ' opacity', 0, 1);
    boolean(el.flipH, label + ' flip');
    if (el.type === 'clip') {
      choice(el.name, label + ' clip art', clips, true);
      color(el.color, label + ' clip art');
      color(el.outline, label + ' outline');
      number(el.outlineWidth, label + ' outline width', 0, 10);
    } else {
      image(el.src, label + ' image', true);
      image(el.orig, label + ' print master');
      boolean(el.circleCrop, label + ' circle crop');
      boolean(el.knockout, label + ' background removal');
      if (el.px !== undefined && (!Array.isArray(el.px) || el.px.length !== 2 || !el.px.every((n) => Number.isInteger(n) && n > 0 && n <= 100000))) throw new Error(label + ' image dimensions must be two positive pixel counts');
    }
  }
}

function board(value, label, options) {
  object(value, label);
  if (value.base !== undefined) {
    object(value.base, label + ' base');
    choice(value.base.kind, label + ' base style', { paint: true, wood: true, gradient: true });
    choice(value.base.stain, label + ' wood stain', options.stains);
    color(value.base.color, label + ' base');
    color(value.base.color2, label + ' second base');
    number(value.base.angle, label + ' gradient angle', -3600, 3600);
  }
  if (value.pattern !== undefined) {
    object(value.pattern, label + ' pattern');
    choice(value.pattern.kind, label + ' pattern', options.patterns);
    color(value.pattern.color, label + ' pattern');
    // Thin borders use a single path. Repeating patterns retain the larger
    // minimum so their drawing work is bounded independently of the renderer.
    number(value.pattern.size, label + ' pattern size', value.pattern.kind === 'border' ? 0.1 : 0.5, 100);
  }
  if (value.elements === undefined) return;
  if (!Array.isArray(value.elements)) throw new Error(label + ' elements must be a list');
  if (value.elements.length > 100) throw new Error(label + ' contains too many items (maximum 100)');
  const ids = new Set();
  value.elements.forEach((el, index) => {
    element(el, label + ' item ' + (index + 1), options.clips);
    if (el.id) {
      if (ids.has(el.id)) throw new Error(label + ' contains a duplicate item ID');
      ids.add(el.id);
    }
  });
}

export function validateProject(project, options) {
  object(project, 'Project');
  object(project.design, 'Project design');
  boolean(project.design.same, 'Matching boards');
  board(project.design.a, 'Board A', options);
  board(project.design.b, 'Board B', options);
  if (project.order !== undefined && project.order !== null) {
    object(project.order, 'Order choices');
    // applyOrder sanitizes optional legacy values. Check its enum lookups
    // here so inherited object keys cannot become product/finish choices.
    for (const [key, choices] of Object.entries(options.orderChoices || {})) choice(project.order[key], 'Order ' + key, choices);
    if (project.order.quantity !== undefined) {
      const q = project.order.quantity;
      if (!['string', 'number'].includes(typeof q) || !Number.isInteger(Number(q)) || Number(q) < 1 || Number(q) > options.maxQuantity) throw new Error('Order quantity is not supported');
    }
  }
}
