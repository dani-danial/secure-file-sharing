import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import SharePage from './pages/SharePage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:shareToken" element={<SharePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
