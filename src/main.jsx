import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PrototypeSwitcher from './components/PrototypeSwitcher.jsx';
import { initVariant } from './lib/variant.prototype';
import './styles/global.css';
import './styles/prototype-apple.css';

// PROTOTYPE: before the first render, so the first frame is already the
// variant asked for.
initVariant();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PrototypeSwitcher />
  </StrictMode>
);
