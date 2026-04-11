import { Outlet, Route, Routes } from "react-router-dom"
import { AppNavbar } from "@/components/AppNavbar"
import Home from "./pages/Home"
import Pay from "./pages/Pay"
import Success from "./pages/Success"

function AppLayout() {
  return (
    <>
      <AppNavbar />
      <Outlet />
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/pay/:slug" element={<Pay />} />
        <Route path="/success/:slug" element={<Success />} />
      </Route>
    </Routes>
  )
}

export default App
