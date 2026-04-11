/**
 * Layout constants for the block-based timeline axis.
 *
 * One slot = one logical step. Unlike the seconds-based prototype, there
 * is NO time unit: the ruler shows step indices (#0 #1 #2 ...). Blocks
 * always occupy exactly one slot (`span` has been removed — see
 * docs/01-concept.md).
 */

/** Horizontal pixels per slot. */
export const SLOT_PX = 96;
/** Margin between a block and the slot boundary on each side. */
export const BLOCK_MARGIN = 6;
/** Rendered width of a single block. */
export const BLOCK_W = SLOT_PX - BLOCK_MARGIN * 2;

/** Track row height (used for both regular tracks and the error handler). */
export const TRACK_H = 72;
/** Left header column width. */
export const HEADER_W = 168;
/** Top ruler height. */
export const RULER_H = 32;
/** Height of the error handler separator row. */
export const ERROR_DIVIDER_H = 22;
/** Minimum number of slots to render even if the scenario is empty. */
export const MIN_SLOTS = 12;

export const slotToPx = (slot: number): number => slot * SLOT_PX;
export const pxToSlot = (px: number): number =>
  Math.max(0, Math.round(px / SLOT_PX));
