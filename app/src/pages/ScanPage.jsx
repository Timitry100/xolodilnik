import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { decodeFromCanvas } from '../scanners/zxing.js';
import { parseGtinFromDataMatrix } from '../scanners/dataMatrix.js';
import { enrichFromBarcode } from '../scanners/openFoodFacts.js';
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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const streamRef = useRef(null);
  const busyRef = useRef(false);

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
        setStatus('✅ Честный знак! Ищем данные о товаре (ЦРПТ / открытые данные)…');
        let productInfo = {};
        try {
          const hs = await api(`/honest-sign/${gtin}`);
          if (hs.product) productInfo = hs.product;
          if (hs.crptConfigured === false) {
            setStatus('✅ Код найден! Данные подтянуты из открытых источников.');
          }
        } catch {
          /* оставляем пустую форму — пользователь заполнит вручную */
        }
        navigate('/form', { state: { source: 'honest_sign', gtin, raw: res.text, ...productInfo } });
      } else {
        const code = res.text.replace(/\D/g, '');
        setStatus('✅ Штрихкод! Ищем данные о товаре…');
        const off = await enrichFromBarcode(code);
        navigate('/form', { state: { source: 'barcode', barcode: code, ...off } });
      }
    } catch (e) {
      setError('Ошибка при поиске данных: ' + e.message);
    }
    busyRef.current = false;
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

  // перезапуск камеры при смене режима
  useEffect(() => {
    scanningRef.current = false;
    setError('');
    setStatus('');
    const t = setTimeout(() => startCamera(), 100);
    return () => {
      clearTimeout(t);
      scanningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // остановка камеры при уходе со страницы
  useEffect(() => () => {
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
        <button className="btn block" onClick={doOcr}>📸 Сфотографировать и распознать</button>
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

