/**
 * Layout constants for the block-based timeline axis.
 *
 * One slot = one logical step. Unlike the seconds-based prototype,
 * there is NO time unit: the ruler shows step indices (0, 1, 2, ...).
 */
export const SLOT_PX = 96;     // horizontal pixels per slot
export const TRACK_H = 72;      // track row height
export const HEADER_W = 168;    // left header width
export const RULER_H = 32;      // top ruler height
export const MIN_SLOTS = 16;    // minimum rendered slots

export const slotToPx = (slot: number): number => slot * SLOT_PX;
export const pxToSlot = (px: number): number => Math.max(0, Math.round(px / SLOT_PX));
