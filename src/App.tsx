import { Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Pay from "./pages/Pay"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pay/:slug" element={<Pay />} />
    </Routes>
  )
}

export default App
