import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster position="top-center" toastOptions={{
      style: { background: '#0f2818', color: '#f0ead6', border: '0.5px solid rgba(45,90,61,0.8)', fontFamily: "'Inter',sans-serif", fontSize: 14 },
    }} />
    <App />
  </StrictMode>,
)
