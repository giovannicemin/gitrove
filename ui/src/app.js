/* One place that knows a change of setting means: recompute, then redraw. */

import { S } from './state.js';
import { layout } from './layout.js';
import { render } from './render.js';
import { transition } from './animate.js';

/** a setting changed: recompute, redraw, and spring from the old picture to the new */
export function relayout(){
  transition(() => { S.layout = layout(); render(); });
}
