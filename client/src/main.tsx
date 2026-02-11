import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bricolage-grotesque/200.css'
import '@fontsource/bricolage-grotesque/300.css'
import '@fontsource/bricolage-grotesque/400.css'
import '@fontsource/bricolage-grotesque/500.css'
import '@fontsource/bricolage-grotesque/700.css'
import '@fontsource/bricolage-grotesque/800.css'
import '@fontsource/jetbrains-mono/200.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/jetbrains-mono/800.css'
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import './styles/variables.css'
import './styles/global.css'
import './styles/glass.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
