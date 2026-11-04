import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is best-effort */ });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster position="top-center" toastOptions={{
      style: { background: '#0f2818', color: '#f0ead6', border: '0.5px solid rgba(45,90,61,0.8)', fontFamily: "'Inter',sans-serif", fontSize: 14 },
    }} />
    <App />
  </StrictMode>,
)
