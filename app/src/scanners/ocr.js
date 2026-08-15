import { createWorker } from 'tesseract.js';

let workerPromise = null;

function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('rus+eng', 1, {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
      },
    });
  }
  return workerPromise;
}

/**
 * Распознаёт текст с canvas (упаковка продукта).
 * Модели Tesseract.js подгружаются с CDN при первом запуске.
 */
export async function recognizeText(canvas, onProgress) {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}
