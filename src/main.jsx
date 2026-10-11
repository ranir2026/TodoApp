import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A tab or home-screen app left open keeps running the build it first loaded, which can
// silently miss fixes (including sync). When the app returns to the foreground, check whether
// a newer build has been deployed and reload into it.
const currentBundle = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')
if (currentBundle) {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
      if (response.ok && !(await response.text()).includes(currentBundle)) window.location.reload()
    } catch {
      // Offline: try again next time
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
