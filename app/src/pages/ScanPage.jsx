import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { decodeFromCanvas } from '../scanners/zxing.js';
import { parseGtinFromDataMatrix } from '../scanners/dataMatrix.js';
import { recognizeText } from '../scanners/ocr.js';
import { parseProductText } from '../scanners/parseText.js';
import { haptic } from '../telegram.js';

const MODES = [
  { key: 'cz', label: 'Честный знак' },
  { key: 'barcode', label: 'Штрихкод' },
  { key: 'ocr', label: 'Текст' },
];

export default function ScanPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('cz');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ocrActive, setOcrActive] = useState(false);
  const [ocrProgress, setOcrProgress] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const ocrActiveRef = useRef(false);
  const ocrTimerRef = useRef(null);
  const combinedRef = useRef('');

  const stopCamera = () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setError('');
    setStatus(mode === 'ocr' ? 'Камера готова. Нажми «Сфотографировать и распознать»' : 'Наведи камеру на упаковку…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (mode !== 'ocr') {
        scanningRef.current = true;
        requestAnimationFrame(scanLoop);
      }
    } catch (e) {
      setError('Нет доступа к камере: ' + (e.message || 'проверь разрешения'));
    }
  };

  const scanLoop = () => {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
      const res = decodeFromCanvas(canvas);
      if (res) {
        scanningRef.current = false;
        haptic('heavy');
        handleResult(res);
        return;
      }
    }
    requestAnimationFrame(scanLoop);
  };

  const handleResult = async (res) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (res.format === 'DATA_MATRIX') {
        const gtin = parseGtinFromDataMatrix(res.text);
        if (!gtin) {
          setError('Код «Честного знака» найден, но не удалось извлечь GTIN. Попробуй ещё раз.');
          busyRef.current = false;
          return;
        }
        setStatus('✅ Честный знак! Ищем данные о товаре…');
        let productInfo = {};
        try {
          const hs = await api(`/honest-sign/${gtin}`);
          if (hs.product) productInfo = hs.product;
        } catch {
          /* продолжаем */
        }
        if (!productInfo.name) {
          productInfo = await autoFillFromOCR(productInfo);
        }
        navigate('/form', { state: { source: 'honest_sign', gtin, raw: res.text, ...productInfo } });
      } else {
        const code = res.text.replace(/\D/g, '');
        setStatus('✅ Штрихкод! Ищем данные о товаре…');
        let productInfo = {};
        try {
          const data = await api(`/lookup/${code}`);
          if (data.product) productInfo = data.product;
        } catch {
          /* продолжаем */
        }
        if (!productInfo.name) {
          productInfo = await autoFillFromOCR(productInfo);
        }
        navigate('/form', { state: { source: 'barcode', barcode: code, ...productInfo } });
      }
    } catch (e) {
      setError('Ошибка при поиске данных: ' + e.message);
    }
    busyRef.current = false;
  };

  // Если в открытых базах товар не найден — автоматически распознаём текст с упаковки (OCR)
  const autoFillFromOCR = async (productInfo) => {
    try {
      setStatus('🧠 В базе не нашли — распознаю текст с упаковки…');
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) return productInfo;
      const text = await recognizeText(canvas);
      if (text && text.trim()) {
        return { ...productInfo, ...parseProductText(text) };
      }
    } catch {
      /* не удалось распознать — оставляем данные как есть */
    }
    return productInfo;
  };

  const doOcr = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setStatus('🧠 Распознаю текст… это займёт несколько секунд');
    haptic('medium');
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
      const text = await recognizeText(canvas);
      if (!text.trim()) {
        setError('Не удалось распознать текст. Поднеси камеру ближе и повтори.');
        setStatus('');
        return;
      }
      const parsed = parseProductText(text);
      navigate('/form', { state: { source: 'ocr', rawText: text, ...parsed } });
    } catch (e) {
      setError('Ошибка распознавания: ' + e.message);
      setStatus('');
    }
    busyRef.current = false;
  };

  /* ---------- непрерывное считывание текста с упаковки ---------- */

  // Объединяем тексты с разных кадров, убирая дубли
  const mergeText = (oldText, newText) => {
    const seen = [];
    for (const line of String(oldText + '\n' + newText).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const duplicate = seen.some((s) => s.includes(t) || t.includes(s));
      if (!duplicate) seen.push(t);
    }
    return seen.join('\n');
  };

  const fieldsProgress = (parsed) => [
    { key: 'name', label: 'Название', ok: !!parsed.name },
    { key: 'brand', label: 'Марка', ok: !!parsed.brand },
    { key: 'volume', label: 'Объём', ok: !!parsed.volume },
    { key: 'kbju', label: 'КБЖУ', ok: parsed.kcal != null },
    { key: 'composition', label: 'Состав', ok: !!parsed.composition },
    { key: 'expiry', label: 'Срок', ok: !!parsed.expiry_date },
  ];

  const runOcrFrame = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
      setStatus('🧠 Считываю текст… води камерой по пачке');
      const text = await recognizeText(canvas);
      if (text && text.trim()) {
        combinedRef.current = mergeText(combinedRef.current, text);
        setOcrProgress(fieldsProgress(parseProductText(combinedRef.current)));
      }
    } catch {
      /* пробуем следующий кадр */
    }
    busyRef.current = false;
  };

  const startContinuousOcr = () => {
    if (ocrActiveRef.current) return;
    ocrActiveRef.current = true;
    setOcrActive(true);
    combinedRef.current = '';
    setOcrProgress([]);
    setError('');
    const loop = async () => {
      if (!ocrActiveRef.current) return;
      await runOcrFrame();
      if (ocrActiveRef.current) {
        ocrTimerRef.current = setTimeout(loop, 2500);
      }
    };
    loop();
  };

  const stopOcr = () => {
    ocrActiveRef.current = false;
    setOcrActive(false);
    if (ocrTimerRef.current) {
      clearTimeout(ocrTimerRef.current);
      ocrTimerRef.current = null;
    }
    setStatus('');
  };

  const doneOcr = () => {
    stopOcr();
    const parsed = parseProductText(combinedRef.current);
    navigate('/form', { state: { source: 'ocr', rawText: combinedRef.current, ...parsed } });
  };

  // Точное распознавание этикетки нейросетью (Google Gemini) — один кадр
  const doAiOcr = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setStatus('✨ Распознаю этикетку нейросетью…');
    haptic('medium');
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      let productInfo = {};
      let usedAi = false;
      try {
        const r = await api('/ocr/analyze', { method: 'POST', body: { image: base64 } });
        if (r.ok && r.data) {
          productInfo = r.data;
          usedAi = true;
        }
      } catch {
        /* фолбэк ниже */
      }
      if (!usedAi || !productInfo.name) {
        setStatus('🧠 Нейросеть недоступна — использую обычный OCR…');
        const text = await recognizeText(canvas);
        const parsed = parseProductText(text);
        productInfo = { ...parsed, ...productInfo };
      }
      navigate('/form', { state: { source: 'ocr', ...productInfo } });
    } catch (e) {
      setError('Ошибка распознавания: ' + e.message);
    }
    busyRef.current = false;
  };

  // перезапуск камеры при смене режима
  useEffect(() => {
    scanningRef.current = false;
    ocrActiveRef.current = false;
    setOcrActive(false);
    if (ocrTimerRef.current) {
      clearTimeout(ocrTimerRef.current);
      ocrTimerRef.current = null;
    }
    setError('');
    setStatus('');
    const t = setTimeout(() => startCamera(), 100);
    return () => {
      clearTimeout(t);
      scanningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // остановка камеры и OCR при уходе со страницы
  useEffect(() => () => {
    ocrActiveRef.current = false;
    if (ocrTimerRef.current) clearTimeout(ocrTimerRef.current);
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // подсказка про OCR, если долго не находим код
  useEffect(() => {
    if (mode === 'ocr') return;
    const t = setTimeout(() => {
      if (scanningRef.current) {
        setStatus('Не находите код? Переключитесь на «Текст» — распознаем дату и состав с упаковки.');
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [mode]);

  return (
    <>
      <div className="topbar">
        <Link className="back-btn" to="/">←</Link>
        <h1>Сканирование</h1>
      </div>

      <div className="tabs">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`tab ${mode === m.key ? 'active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="scanner-wrap">
        <video ref={videoRef} playsInline muted />
        <div className="scanner-frame" />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="scanner-status">{status}</div>
      {error && <div className="error-text">{error}</div>}

      {mode === 'ocr' ? (
        <>
          {!ocrActive ? (
            <>
              <button className="btn block" onClick={startContinuousOcr}>▶ Начать считывание</button>
              <button className="btn secondary block" style={{ marginTop: 10 }} onClick={doAiOcr}>
                ✨ Точное распознавание (AI)
              </button>
            </>
          ) : (
            <>
              <div className="ocr-progress">
                {ocrProgress.length === 0 ? (
                  <span className="ocr-chip">⏳ Ждём текст…</span>
                ) : (
                  ocrProgress.map((p) => (
                    <span key={p.key} className={`ocr-chip ${p.ok ? 'ok' : ''}`}>
                      {p.ok ? '✅' : '⭕'} {p.label}
                    </span>
                  ))
                )}
              </div>
              <div className="action-row" style={{ marginTop: 10 }}>
                <button className="btn secondary" onClick={stopOcr}>⏹ Пауза</button>
                <button className="btn" onClick={doneOcr}>✅ Готово</button>
              </div>
            </>
          )}
          <div className="scanner-status">
            Води камерой по пачке — текст считывается автоматически
          </div>
        </>
      ) : (
        <div className="scanner-status">
          {mode === 'cz'
            ? 'Наведи камеру на квадратный код «Честного знака» на упаковке'
            : 'Наведи камеру на штрихкод на упаковке'}
        </div>
      )}

      <div className="action-row" style={{ marginTop: 12 }}>
        <Link className="btn secondary" to="/form">✏️ Вручную</Link>
        <Link className="btn secondary" to="/">📋 Список</Link>
      </div>
    </>
  );
}

