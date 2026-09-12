/* One place that knows a change of setting means: recompute, then redraw. */

import { S } from './state.js';
import { layout } from './layout.js';
import { render } from './render.js';

export function relayout(){ S.layout = layout(); render(); }
