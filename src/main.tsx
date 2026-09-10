import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Observatory from './astra/Observatory.tsx'

createRoot(document.getElementById('root')!).render(<StrictMode><Observatory /></StrictMode>)
