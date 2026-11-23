import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import './styles.css'
import App from './App'
import { useAppStore } from './store'

void useAppStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
