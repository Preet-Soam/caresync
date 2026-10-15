import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './public-pages.css'
import './patient-health.css'
import './home-partners.css'
import './workspace-overview.css'
import './doctor-workspace.css'
import './admin-workspace.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>,
)
