import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MenuRoute } from './MenuRoute'
import { PlayRoute } from './play/PlayRoute'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MenuRoute />} />
        <Route path="/play/:levelId" element={<PlayRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
