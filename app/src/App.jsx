import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { getTg } from './telegram.js';
import ProductList from './pages/ProductList.jsx';
import ProductForm from './pages/ProductForm.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Recipes from './pages/Recipes.jsx';

// Страница сканирования тяжёлая (ZXing + Tesseract) — грузим только при открытии
const ScanPage = lazy(() => import('./pages/ScanPage.jsx'));

export default function App() {
  useEffect(() => {
    const applyTheme = () => {
      document.body.classList.toggle('tg-dark', getTg()?.colorScheme === 'dark');
    };
    applyTheme();
    window.addEventListener('load', applyTheme);
    return () => window.removeEventListener('load', applyTheme);
  }, []);

  return (
    <div className="app">
      <Suspense fallback={<div className="loading">Загрузка сканера…</div>}>
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/form" element={<ProductForm />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="*" element={<ProductList />} />
        </Routes>
      </Suspense>
    </div>
  );
}

