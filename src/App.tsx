import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MenuRoute } from './MenuRoute'
import { PlayRoute } from './play/PlayRoute'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MenuRoute />} />
        <Route path="/play/:levelId" element={<PlayRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
