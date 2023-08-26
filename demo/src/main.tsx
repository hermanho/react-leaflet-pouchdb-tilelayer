import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// eslint-disable-next-line no-unexpected-multiline, @typescript-eslint/no-explicit-any
(window as any).React3 = React;
