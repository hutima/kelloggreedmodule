/**
 * Layout engine — turns the syntax model into pure diagram geometry, the third
 * separated concern. It never reads surface token order for structure, so free
 * word order and discontinuous constituents lay out by their relationships.
 */
export * from './types';
export * from './constants';
export { measureText } from './measure';
export { layoutDocument, type LayoutOptions } from './engine';
export {
  layoutForMode,
  DIAGRAM_MODES,
  DEFAULT_MODE,
  type DiagramMode,
  type DiagramModeInfo,
} from './modes';
