/** 库入口。UI 之外的一切都从这里导出。 */
export { generatePalette, CONFIG } from './palette';
export type { Palette, Swatch, Mode } from './palette';
export { simulate, CVD_LABELS } from './cvd';
export type { CvdType } from './cvd';
export { parseColor, toHex, rgbToLin, srgbToLinear, linearToSrgb, lstarFromY, yFromLstar } from './color';
export type { RGB, LinRGB, XYZ } from './color';
export { rgbToHct, hctToRgb, maxChromaAt } from './hct';
export type { HCT } from './hct';
