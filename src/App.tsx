import { Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Pay from "./pages/Pay"
import Success from "./pages/Success"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pay/:slug" element={<Pay />} />
      <Route path="/success/:slug" element={<Success />} />
    </Routes>
  )
}

export default App
