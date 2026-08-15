import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

let reader = null;

function getReader() {
  if (!reader) {
    reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX, // «Честный знак»
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
  }
  return reader;
}

/**
 * Пытается распознать код на canvas.
 * Возвращает { text, format } или null.
 */
export function decodeFromCanvas(canvas) {
  try {
    const { width, height } = canvas;
    if (!width || !height) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, width, height);
    const lum = new Uint8ClampedArray(width * height);
    const data = img.data;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    const source = new RGBLuminanceSource(lum, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = getReader().decode(bitmap);
    if (result && result.getText()) {
      return { text: result.getText(), format: String(result.getBarcodeFormat()) };
    }
  } catch {
    /* кадр не распознан — продолжаем сканирование */
  }
  return null;
}
