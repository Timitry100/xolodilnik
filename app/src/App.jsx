import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { tg } from './telegram.js';
import ProductList from './pages/ProductList.jsx';
import ProductForm from './pages/ProductForm.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Recipes from './pages/Recipes.jsx';

// Страница сканирования тяжёлая (ZXing + Tesseract) — грузим только при открытии
const ScanPage = lazy(() => import('./pages/ScanPage.jsx'));

export default function App() {
  useEffect(() => {
    document.body.classList.toggle('tg-dark', tg?.colorScheme === 'dark');
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

