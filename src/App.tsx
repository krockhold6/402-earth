import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { Box } from "@coinbase/cds-web/layout"
import { AppNavbar } from "@/components/AppNavbar"
import Home from "./pages/Home"
import Demo from "./pages/Demo"
import HowItWorks from "./pages/HowItWorks"
import LegalDocumentPage from "./pages/LegalDocumentPage"
import ApiDocs from "./pages/ApiDocs"
import Buy from "./pages/Buy"
import Pay from "./pages/Pay"
import Success from "./pages/Success"
import BuyerCapabilityOutcomePage from "./pages/BuyerCapabilityOutcomePage"
import BuyerCapabilityResultPage from "./pages/BuyerCapabilityResultPage"
import CapabilityJobDetailPage from "./pages/CapabilityJobDetailPage"
import CapabilityManagePage from "./pages/CapabilityManagePage"
import CapabilityOperationsPage from "./pages/CapabilityOperationsPage"

/** `/pay/:slug` is a permanent alias; canonical buyer entry is `/unlock/:slug`. */
function RedirectLegacyPayRouteToUnlock() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  if (!slug) return <Navigate to="/" replace />
  const q = searchParams.toString()
  return (
    <Navigate
      to={`/unlock/${encodeURIComponent(slug)}${q ? `?${q}` : ""}`}
      replace
    />
  )
}

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
        minHeight={0}
        style={{
          flex: "1 1 0%",
          minHeight: 0,
          overflow: "hidden",
        }}
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
        <Route path="/buy" element={<Buy />} />
        <Route path="/api" element={<ApiDocs />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/demo" element={<Demo />} />
        <Route
          path="/terms"
          element={<LegalDocumentPage variant="terms" />}
        />
        <Route
          path="/privacy"
          element={<LegalDocumentPage variant="privacy" />}
        />
        <Route
          path="/unlock/:slug/capability/:jobId"
          element={<BuyerCapabilityResultPage />}
        />
        <Route
          path="/unlock/:slug/outcome/:attemptId"
          element={<BuyerCapabilityOutcomePage />}
        />
        <Route path="/unlock/:slug" element={<Pay />} />
        <Route path="/pay/:slug" element={<RedirectLegacyPayRouteToUnlock />} />
        <Route path="/success/:slug" element={<Success />} />
        <Route
          path="/manage/capability/:slug/jobs/:jobId"
          element={<CapabilityJobDetailPage />}
        />
        <Route
          path="/manage/capabilities"
          element={<CapabilityOperationsPage />}
        />
        <Route
          path="/manage/capability/:slug"
          element={<CapabilityManagePage />}
        />
      </Route>
    </Routes>
  )
}

export default App
