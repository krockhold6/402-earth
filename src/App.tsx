import { Outlet, Route, Routes } from "react-router-dom"
import { Box } from "@coinbase/cds-web/layout"
import { AppNavbar } from "@/components/AppNavbar"
import Home from "./pages/Home"
import Pay from "./pages/Pay"
import Success from "./pages/Success"

function AppLayout() {
  return (
    <Box
      display="flex"
      flexDirection="column"
      width="100%"
      style={{ flex: "1 1 0%", minHeight: 0 }}
    >
      <AppNavbar />
      <Box
        display="flex"
        flexDirection="column"
        width="100%"
        style={{ flex: "1 1 0%", minHeight: 0 }}
      >
        <Outlet />
      </Box>
    </Box>
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
