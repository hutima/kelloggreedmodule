/**
 * Layout engine — turns the syntax model into pure diagram geometry, the third
 * separated concern. It never reads surface token order for structure, so free
 * word order and discontinuous constituents lay out by their relationships.
 */
export * from './types';
export * from './constants';
export { tokenTone, nodeTone, toneByNode } from './tone';
export { measureText } from './measure';
export { layoutDocument, mirrorLayout, type LayoutOptions } from './engine';
export type { TreeOrientation } from './modes/tree-layout';
export {
  layoutForMode,
  DIAGRAM_MODES,
  DEFAULT_MODE,
  EDITABLE_MODES,
  DEFAULT_EDIT_MODE,
  isEditableMode,
  type DiagramMode,
  type DiagramModeInfo,
} from './modes';
