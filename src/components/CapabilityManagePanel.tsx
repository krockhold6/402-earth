import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react"
import { Link as RouterLink } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { createWalletClient, custom } from "viem"
import { base } from "viem/chains"
import { Button } from "@coinbase/cds-web/buttons"
import { Checkbox, TextInput } from "@coinbase/cds-web/controls"
import { Select } from "@coinbase/cds-web/alpha/select"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextLabel1, TextTitle3 } from "@coinbase/cds-web/typography"
import {
  clearStoredSellerJwt,
  fetchSellerCapabilityDetail,
  fetchSellerCapabilityDiagnostics,
  fetchSellerCapabilityJobs,
  fetchSellerCapabilityNotificationDeliveries,
  fetchSellerCapabilityWindowAnalytics,
  getStoredSellerJwt,
  patchSellerCapability,
  postCapabilitySellerAuth,
  postCapabilitySellerChallenge,
  postSellerAllowlistEntry,
  postSellerCapabilityNotificationRetry,
  postSellerCapabilityNotificationTest,
  setStoredSellerJwt,
  type AnalyticsWindowId,
  type ApiResource,
  type CapabilityLifecycle,
  type SellerCapabilityDetailResponse,
  type SellerCapabilityDiagnosticsResponse,
  type SellerCapabilityResource,
  type SellerCapabilityWindowAnalyticsResponse,
  type SellerNotificationDeliveriesResponse,
  type SellerNotificationDeliveryRow,
} from "@/lib/api"

type CapabilityManagePanelProps = {
  slug: string
  receiverAddress: string
  onResourceUpdated: (resource: ApiResource) => void
  /** When false, skip the top panel title (dedicated page provides its own heading). */
  showOuterTitle?: boolean
}

const LIFECYCLE_OPTIONS: { id: CapabilityLifecycle; labelKey: string }[] = [
  { id: "active", labelKey: "home.capabilityManageLifecycleActive" },
  { id: "disabled", labelKey: "home.capabilityManageLifecycleDisabled" },
  { id: "archived", labelKey: "home.capabilityManageLifecycleArchived" },
]

export function CapabilityManagePanel({
  slug,
  receiverAddress,
  onResourceUpdated,
  showOuterTitle = true,
}: CapabilityManagePanelProps) {
  const { t } = useTranslation()
  const recv = receiverAddress.trim()
  const [token, setToken] = useState<string | null>(() =>
    recv ? getStoredSellerJwt(recv) : null,
  )
  const [detail, setDetail] = useState<SellerCapabilityDetailResponse | null>(
    null,
  )
  const [authBusy, setAuthBusy] = useState(false)
  const [loadBusy, setLoadBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [allowBusy, setAllowBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editName, setEditName] = useState("")
  const [editEndpoint, setEditEndpoint] = useState("")
  const [editLifecycle, setEditLifecycle] =
    useState<CapabilityLifecycle>("active")
  const [allowHost, setAllowHost] = useState("")
  const [notifyEmail, setNotifyEmail] = useState("")
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [notifyOnComplete, setNotifyOnComplete] = useState(true)
  const [notifyOnFail, setNotifyOnFail] = useState(true)
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState("")
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(true)
  const [notifyWebhookEnabled, setNotifyWebhookEnabled] = useState(false)
  const [editCooldown, setEditCooldown] = useState("")
  const [editMaxAsync, setEditMaxAsync] = useState("")
  const [editCap24, setEditCap24] = useState("")
  const [editCap7, setEditCap7] = useState("")
  const [editAutoPauseEnabled, setEditAutoPauseEnabled] = useState(false)
  const [editAutoThresh, setEditAutoThresh] = useState("")
  const [editAutoWin, setEditAutoWin] = useState("")
  const [editAutoDur, setEditAutoDur] = useState("")
  const [editManualPause, setEditManualPause] = useState("")
  const [clearPauseBusy, setClearPauseBusy] = useState(false)
  const [analyticsWindow, setAnalyticsWindow] =
    useState<AnalyticsWindowId>("7d")
  const [windowAnalytics, setWindowAnalytics] =
    useState<SellerCapabilityWindowAnalyticsResponse | null>(null)
  const [notifDeliveries, setNotifDeliveries] = useState<
    SellerNotificationDeliveryRow[]
  >([])
  const [notifSummary, setNotifSummary] = useState<
    NonNullable<SellerNotificationDeliveriesResponse["summary"]> | null
  >(null)
  const [notifFilterStatus, setNotifFilterStatus] = useState("")
  const [notifFilterChannel, setNotifFilterChannel] = useState("")
  const [notifTestBusy, setNotifTestBusy] = useState(false)
  const [notifRetryBusyId, setNotifRetryBusyId] = useState<string | null>(null)

  const [histJobs, setHistJobs] = useState<Record<string, unknown>[]>([])
  const [histNext, setHistNext] = useState<{
    cursor_created_at: string
    cursor_id: string
  } | null>(null)
  const [histStatus, setHistStatus] = useState("")
  const [histSince, setHistSince] = useState<"7d" | "24h" | "30d" | "all">("7d")
  const [histBusy, setHistBusy] = useState(false)
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagBusy, setDiagBusy] = useState(false)
  const [diag, setDiag] = useState<SellerCapabilityDiagnosticsResponse | null>(null)

  const reloadNotificationDeliveries = useCallback(
    async (authToken: string) => {
      const nd = await fetchSellerCapabilityNotificationDeliveries(
        authToken,
        slug,
        40,
        {
          status: notifFilterStatus.trim() || undefined,
          channel: notifFilterChannel.trim() || undefined,
        },
      )
      setNotifDeliveries(nd.deliveries ?? [])
      setNotifSummary(nd.summary ?? null)
    },
    [slug, notifFilterStatus, notifFilterChannel],
  )

  const loadHist = useCallback(
    async (
      authToken: string,
      append: boolean,
      cursor: { cursor_created_at: string; cursor_id: string } | null,
    ) => {
      setHistBusy(true)
      setError(null)
      if (!append) {
        setHistNext(null)
      }
      try {
        const res = await fetchSellerCapabilityJobs(authToken, slug, {
          limit: 20,
          status: histStatus.trim() || undefined,
          since: histSince,
          cursor_created_at: append ? cursor?.cursor_created_at : undefined,
          cursor_id: append ? cursor?.cursor_id : undefined,
        })
        if (!res.ok) {
          setError(res.error ?? t("home.capabilityHistLoadFailed"))
          return
        }
        const rows = res.jobs ?? []
        setHistJobs((prev) => (append ? [...prev, ...rows] : rows))
        setHistNext(res.next_cursor ?? null)
      } finally {
        setHistBusy(false)
      }
    },
    [slug, histStatus, histSince, t],
  )

  const loadDiagnostics = useCallback(
    async (authToken: string) => {
      setDiagBusy(true)
      setError(null)
      try {
        const res = await fetchSellerCapabilityDiagnostics(authToken, slug, "7d")
        if (!res.ok) {
          setError(res.error ?? t("home.capabilityDiagLoadFailed"))
          return
        }
        setDiag(res)
      } finally {
        setDiagBusy(false)
      }
    },
    [slug, t],
  )

  const refresh = useCallback(
    async (authToken: string) => {
      setLoadBusy(true)
      setError(null)
      try {
        const d = await fetchSellerCapabilityDetail(authToken, slug)
        if (!d.ok) {
          setError(d.error ?? t("home.capabilityManageLoadFailed"))
          if (d.code === "UNAUTHORIZED") {
            clearStoredSellerJwt(recv)
            setToken(null)
            setDetail(null)
          }
          return
        }
        setDetail(d)
        const r = d.resource
        if (r) {
          onResourceUpdated(r as ApiResource)
          setEditName(r.capabilityName ?? r.label ?? "")
          setEditEndpoint(r.endpoint ?? "")
          setEditLifecycle(r.capabilityLifecycle ?? "active")
          setAllowHost(r.capabilityOriginHost?.trim() ?? "")
          const sr = r as SellerCapabilityResource
          const n = sr.notification
          if (n) {
            setNotifyEmail(n.email ?? "")
            setNotifyEnabled(n.enabled)
            setNotifyOnComplete(n.on_complete)
            setNotifyOnFail(n.on_fail)
            setNotifyWebhookUrl(n.webhook_url?.trim() ?? "")
            setNotifyEmailEnabled(n.email_enabled !== false)
            setNotifyWebhookEnabled(n.webhook_enabled === true)
          }
          const pol = sr.policy
          if (pol) {
            setEditCooldown(
              pol.cooldown_seconds != null && pol.cooldown_seconds > 0
                ? String(pol.cooldown_seconds)
                : "",
            )
            setEditMaxAsync(
              pol.max_concurrent_async != null && pol.max_concurrent_async > 0
                ? String(pol.max_concurrent_async)
                : "",
            )
            setEditCap24(
              pol.max_executions_per_24h != null &&
                pol.max_executions_per_24h > 0
                ? String(pol.max_executions_per_24h)
                : "",
            )
            setEditCap7(
              pol.max_executions_per_7d != null && pol.max_executions_per_7d > 0
                ? String(pol.max_executions_per_7d)
                : "",
            )
            setEditAutoPauseEnabled(pol.auto_pause_enabled === true)
            setEditAutoThresh(
              pol.auto_pause_threshold != null && pol.auto_pause_threshold > 0
                ? String(pol.auto_pause_threshold)
                : "",
            )
            setEditAutoWin(
              pol.auto_pause_window_seconds != null &&
                pol.auto_pause_window_seconds > 0
                ? String(pol.auto_pause_window_seconds)
                : "",
            )
            setEditAutoDur(
              pol.auto_pause_duration_seconds != null &&
                pol.auto_pause_duration_seconds > 0
                ? String(pol.auto_pause_duration_seconds)
                : "",
            )
            setEditManualPause(
              typeof pol.manual_paused_until === "string" &&
                pol.manual_paused_until.trim() !== ""
                ? pol.manual_paused_until.trim()
                : "",
            )
          }
        }
        await reloadNotificationDeliveries(authToken)
      } finally {
        setLoadBusy(false)
      }
    },
    [slug, recv, onResourceUpdated, t, reloadNotificationDeliveries],
  )

  useEffect(() => {
    if (!token) {
      setWindowAnalytics(null)
      return
    }
    let cancelled = false
    void (async () => {
      const wa = await fetchSellerCapabilityWindowAnalytics(
        token,
        slug,
        analyticsWindow,
      )
      if (!cancelled) setWindowAnalytics(wa.ok ? wa : null)
    })()
    return () => {
      cancelled = true
    }
  }, [token, slug, analyticsWindow])

  useEffect(() => {
    if (!token) {
      setDetail(null)
      return
    }
    void refresh(token)
  }, [token, refresh])

  async function handleWalletSignIn() {
    if (!recv) {
      setError(t("home.capabilityManageNoReceiver"))
      return
    }
    const eth = (
      window as unknown as {
        ethereum?: {
          request: (a: {
            method: string
            params?: unknown[]
          }) => Promise<unknown>
        }
      }
    ).ethereum
    if (!eth) {
      setError(t("home.capabilityManageNoWallet"))
      return
    }
    setAuthBusy(true)
    setError(null)
    try {
      const client = createWalletClient({
        chain: base,
        transport: custom(eth),
      })
      const [addr] = await client.requestAddresses()
      if (!addr || addr.toLowerCase() !== recv.toLowerCase()) {
        setError(t("home.capabilityManageWalletMismatch"))
        return
      }
      const ch = await postCapabilitySellerChallenge(addr)
      if (
        !ch.data?.ok ||
        !ch.data.message ||
        !ch.data.challenge_id
      ) {
        setError(ch.data?.error ?? t("home.capabilityManageChallengeFailed"))
        return
      }
      const signature = await client.signMessage({
        account: addr,
        message: ch.data.message,
      })
      const auth = await postCapabilitySellerAuth({
        wallet: addr,
        challengeId: ch.data.challenge_id,
        signature,
      })
      if (!auth.data?.ok || !auth.data.token) {
        setError(auth.data?.error ?? t("home.capabilityManageAuthFailed"))
        return
      }
      setStoredSellerJwt(recv, auth.data.token)
      setToken(auth.data.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.capabilityManageAuthFailed"))
    } finally {
      setAuthBusy(false)
    }
  }

  function handleSignOut() {
    clearStoredSellerJwt(recv)
    setToken(null)
    setDetail(null)
  }

  async function handleSaveEdits() {
    if (!token) return
    if (editCooldown.trim() !== "") {
      const c = Number(editCooldown)
      if (!Number.isFinite(c) || c <= 0) {
        setError(t("home.capabilityPolicyCooldownInvalid"))
        return
      }
    }
    if (editMaxAsync.trim() !== "") {
      const m = Number(editMaxAsync)
      if (!Number.isFinite(m) || m <= 0) {
        setError(t("home.capabilityPolicyMaxInvalid"))
        return
      }
    }
    if (editCap24.trim() !== "") {
      const x = Number(editCap24)
      if (!Number.isFinite(x) || x <= 0) {
        setError(t("home.capabilityPolicyCapInvalid"))
        return
      }
    }
    if (editCap7.trim() !== "") {
      const x = Number(editCap7)
      if (!Number.isFinite(x) || x <= 0) {
        setError(t("home.capabilityPolicyCapInvalid"))
        return
      }
    }
    if (editAutoThresh.trim() !== "") {
      const x = Number(editAutoThresh)
      if (!Number.isFinite(x) || x < 2) {
        setError(t("home.capabilityPolicyAutoPauseInvalid"))
        return
      }
    }
    if (editAutoWin.trim() !== "") {
      const x = Number(editAutoWin)
      if (!Number.isFinite(x) || x < 60) {
        setError(t("home.capabilityPolicyAutoPauseInvalid"))
        return
      }
    }
    if (editAutoDur.trim() !== "") {
      const x = Number(editAutoDur)
      if (!Number.isFinite(x) || x < 60) {
        setError(t("home.capabilityPolicyAutoPauseInvalid"))
        return
      }
    }
    if (editManualPause.trim() !== "") {
      const u = Date.parse(editManualPause.trim())
      if (!Number.isFinite(u) || u <= Date.now()) {
        setError(t("home.capabilityPolicyManualPauseInvalid"))
        return
      }
    }
    setSaveBusy(true)
    setError(null)
    try {
      const { data } = await patchSellerCapability({
        token,
        slug,
        body: {
          capability_name: editName.trim(),
          endpoint: editEndpoint.trim(),
          capability_lifecycle: editLifecycle,
          notify_enabled: notifyEnabled,
          notify_email: notifyEmail.trim(),
          notify_webhook_url: notifyWebhookUrl.trim(),
          notify_email_enabled: notifyEmailEnabled,
          notify_webhook_enabled: notifyWebhookEnabled,
          notify_on_complete: notifyOnComplete,
          notify_on_fail: notifyOnFail,
          capability_cooldown_seconds:
            editCooldown.trim() === ""
              ? null
              : Math.floor(Number(editCooldown)),
          capability_max_concurrent_async:
            editMaxAsync.trim() === ""
              ? null
              : Math.floor(Number(editMaxAsync)),
          capability_max_executions_per_24h:
            editCap24.trim() === "" ? null : Math.floor(Number(editCap24)),
          capability_max_executions_per_7d:
            editCap7.trim() === "" ? null : Math.floor(Number(editCap7)),
          capability_auto_pause_enabled: editAutoPauseEnabled,
          capability_auto_pause_threshold:
            editAutoThresh.trim() === ""
              ? null
              : Math.floor(Number(editAutoThresh)),
          capability_auto_pause_window_seconds:
            editAutoWin.trim() === "" ? null : Math.floor(Number(editAutoWin)),
          capability_auto_pause_duration_seconds:
            editAutoDur.trim() === "" ? null : Math.floor(Number(editAutoDur)),
          capability_manual_paused_until:
            editManualPause.trim() === ""
              ? null
              : editManualPause.trim(),
        },
      })
      if (!data?.ok || !data.resource) {
        setError(data?.error ?? t("home.capabilityManageSaveFailed"))
        return
      }
      onResourceUpdated(data.resource as ApiResource)
      await refresh(token)
    } finally {
      setSaveBusy(false)
    }
  }

  async function handleClearExecutionPause() {
    if (!token) return
    setClearPauseBusy(true)
    setError(null)
    try {
      const { data } = await patchSellerCapability({
        token,
        slug,
        body: { clear_capability_execution_pause: true },
      })
      if (!data?.ok || !data.resource) {
        setError(data?.error ?? t("home.capabilityManageSaveFailed"))
        return
      }
      onResourceUpdated(data.resource as ApiResource)
      await refresh(token)
    } finally {
      setClearPauseBusy(false)
    }
  }

  async function handleAllowlistAdd() {
    if (!token || !recv) return
    const host = allowHost.trim().toLowerCase()
    if (!host) {
      setError(t("home.capabilityManageHostRequired"))
      return
    }
    setAllowBusy(true)
    setError(null)
    try {
      const { data } = await postSellerAllowlistEntry({
        token,
        receiverAddress: recv,
        host,
        note: "seller_ui",
      })
      if (!data?.ok) {
        setError(data?.error ?? t("home.capabilityManageAllowFailed"))
        return
      }
      await refresh(token)
    } finally {
      setAllowBusy(false)
    }
  }

  function policyBlockReason(
    key: string | null | undefined,
  ): string {
    switch (key) {
      case "manual_pause":
        return t("home.capabilityPolicyBlock.manual_pause")
      case "auto_pause":
        return t("home.capabilityPolicyBlock.auto_pause")
      case "cooldown":
        return t("home.capabilityPolicyBlock.cooldown")
      case "max_concurrency":
        return t("home.capabilityPolicyBlock.max_concurrency")
      case "execution_cap_24h":
        return t("home.capabilityPolicyBlock.execution_cap_24h")
      case "execution_cap_7d":
        return t("home.capabilityPolicyBlock.execution_cap_7d")
      default:
        return t("home.capabilityPolicyBlock.unknown")
    }
  }

  const resource = detail?.resource
  const jobsBy = detail?.jobs_by_status ?? {}
  const recent = detail?.recent_jobs ?? []
  const analytics = detail?.analytics
  const insights = detail?.insights ?? []
  const policySnap = detail?.policy_snapshot
  const waCur = windowAnalytics?.current
  const waPri = windowAnalytics?.prior_window
  const waTrends = windowAnalytics?.trends
  const waNotif = windowAnalytics?.notification_delivery

  const WINDOW_OPTIONS: { id: AnalyticsWindowId; labelKey: string }[] = [
    { id: "24h", labelKey: "home.capabilityWindow24h" },
    { id: "7d", labelKey: "home.capabilityWindow7d" },
    { id: "30d", labelKey: "home.capabilityWindow30d" },
  ]

  return (
    <Box
      bordered
      borderRadius={400}
      background="bgSecondary"
      padding={{ base: 4, desktop: 4 }}
      width="100%"
      minWidth={0}
    >
      <VStack gap={3} alignItems="stretch" width="100%">
        {showOuterTitle ? (
          <TextTitle3 color="fg" as="p" style={{ margin: 0 }}>
            {t("home.capabilityManageTitle")}
          </TextTitle3>
        ) : null}
        {showOuterTitle ? (
          <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
            {t("home.capabilityManageIntro")}
          </TextBody>
        ) : null}
        {showOuterTitle && recv ? (
          <RouterLink
            to={`/manage/capability/${encodeURIComponent(slug)}?receiver=${encodeURIComponent(recv)}`}
            style={{ textDecoration: "none", alignSelf: "flex-start" }}
          >
            <TextCaption color="fgMuted" as="span">
              {t("home.capabilityOpenFullManage")}
            </TextCaption>
          </RouterLink>
        ) : null}
        {token && recv ? (
          <RouterLink
            to={`/manage/capabilities?receiver=${encodeURIComponent(recv)}`}
            style={{ textDecoration: "none", alignSelf: "flex-start" }}
          >
            <TextCaption color="fgMuted" as="span">
              {t("home.capabilityAllOperations")}
            </TextCaption>
          </RouterLink>
        ) : null}

        {!token ? (
          <Button
            block
            variant="secondary"
            type="button"
            onClick={() => void handleWalletSignIn()}
            disabled={authBusy || !recv}
            style={{ borderRadius: "100px" }}
          >
            {authBusy
              ? t("home.capabilityManageSigning")
              : t("home.capabilityManageSignIn")}
          </Button>
        ) : (
          <HStack gap={2} alignItems="center" flexWrap="wrap">
            <TextCaption color="fgMuted" as="span">
              {t("home.capabilityManageSignedIn")}
            </TextCaption>
            <Button
              variant="secondary"
              type="button"
              compact
              onClick={handleSignOut}
              style={{ borderRadius: "100px" }}
            >
              {t("home.capabilityManageSignOut")}
            </Button>
          </HStack>
        )}

        {error ? (
          <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
            {error}
          </TextBody>
        ) : null}

        {token && loadBusy && !resource ? (
          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("home.capabilityManageLoading")}
          </TextCaption>
        ) : null}

        {resource ? (
          <>
            <Box
              borderRadius={400}
              background="bg"
              padding={3}
              width="100%"
              minWidth={0}
            >
              <VStack gap={2} alignItems="stretch" width="100%">
                <HStack
                  gap={3}
                  justifyContent="space-between"
                  alignItems="flex-start"
                  width="100%"
                >
                  <TextCaption color="fgMuted">
                    {t("home.capabilityManageSummaryLifecycle")}
                  </TextCaption>
                  <TextBody
                    color="fg"
                    style={{ margin: 0, textAlign: "end" }}
                  >
                    {resource.capabilityLifecycle ?? "active"}
                  </TextBody>
                </HStack>
                <HStack
                  gap={3}
                  justifyContent="space-between"
                  alignItems="flex-start"
                  width="100%"
                >
                  <TextCaption color="fgMuted">
                    {t("home.capabilityManageExecutable")}
                  </TextCaption>
                  <TextBody
                    color={resource.executionAllowed ? "fg" : "fgNegative"}
                    style={{ margin: 0, textAlign: "end" }}
                  >
                    {resource.executionAllowed
                      ? t("home.capabilityManageYes")
                      : t("home.capabilityManageNo")}
                  </TextBody>
                </HStack>
                <HStack
                  gap={3}
                  justifyContent="space-between"
                  alignItems="flex-start"
                  width="100%"
                >
                  <TextCaption color="fgMuted">
                    {t("home.capabilityTrustStatus")}
                  </TextCaption>
                  <TextBody
                    color="fg"
                    style={{ margin: 0, textAlign: "end" }}
                  >
                    {resource.capabilityOriginTrust ?? "—"}
                  </TextBody>
                </HStack>
              </VStack>
            </Box>

            {analytics ? (
              <Box
                borderRadius={400}
                background="bg"
                padding={3}
                width="100%"
                minWidth={0}
              >
                <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                  {t("home.capabilityHealthTitle")}
                </TextLabel1>
                <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
                  {t("home.capabilityHealthSubtitle")}
                </TextCaption>
                <VStack gap={1} alignItems="stretch" width="100%">
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthJobs")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.total_jobs}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthCompleted")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.completed_count}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthFailed")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.failed_count}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthRetries")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.retry_events}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthSuccessRate")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.success_rate != null
                        ? `${Math.round(analytics.success_rate * 100)}%`
                        : "—"}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthAvgMs")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.avg_duration_ms != null
                        ? `${Math.round(analytics.avg_duration_ms)} ms`
                        : "—"}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthResultAvail")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {analytics.result_availability_rate != null
                        ? `${Math.round(analytics.result_availability_rate * 100)}%`
                        : "—"}
                    </TextBody>
                  </HStack>
                </VStack>
              </Box>
            ) : null}

            {insights.length > 0 ? (
              <Box
                borderRadius={400}
                background="bg"
                padding={3}
                width="100%"
                minWidth={0}
              >
                <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                  {t("home.capabilityInsightsTitle")}
                </TextLabel1>
                <VStack gap={2} alignItems="stretch" width="100%">
                  {insights.map((ins) => (
                    <TextBody
                      key={ins.code}
                      color={
                        ins.level === "critical"
                          ? "fgNegative"
                          : ins.level === "warning"
                            ? "fgNegative"
                            : "fgMuted"
                      }
                      as="p"
                      style={{ margin: 0, lineHeight: 1.45 }}
                    >
                      {ins.message}
                    </TextBody>
                  ))}
                </VStack>
              </Box>
            ) : null}

            {policySnap ? (
              <Box
                borderRadius={400}
                background="bg"
                padding={3}
                width="100%"
                minWidth={0}
              >
                <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                  {t("home.capabilityPolicyStatusTitle")}
                </TextLabel1>
                <VStack gap={1} alignItems="stretch" width="100%">
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityPolicyConcurrent")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {policySnap.concurrent_async_jobs ?? "—"}
                      {policySnap.max_concurrent_async != null &&
                      policySnap.max_concurrent_async > 0
                        ? ` / ${policySnap.max_concurrent_async}`
                        : ""}
                    </TextBody>
                  </HStack>
                  {policySnap.cooldown_remaining_seconds != null &&
                  policySnap.cooldown_remaining_seconds > 0 ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyCooldownWait", {
                        seconds: policySnap.cooldown_remaining_seconds,
                      })}
                    </TextBody>
                  ) : null}
                  {policySnap.at_concurrency_limit ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyConcurrencyLimit")}
                    </TextBody>
                  ) : null}
                  {policySnap.max_executions_per_24h != null &&
                  policySnap.max_executions_per_24h > 0 ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyExecutionCap24", {
                        used: policySnap.executions_started_24h ?? 0,
                        cap: policySnap.max_executions_per_24h,
                        remaining: policySnap.remaining_executions_24h ?? 0,
                      })}
                    </TextBody>
                  ) : null}
                  {policySnap.max_executions_per_7d != null &&
                  policySnap.max_executions_per_7d > 0 ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyExecutionCap7", {
                        used: policySnap.executions_started_7d ?? 0,
                        cap: policySnap.max_executions_per_7d,
                        remaining: policySnap.remaining_executions_7d ?? 0,
                      })}
                    </TextBody>
                  ) : null}
                  {policySnap.remaining_executions_24h === 0 &&
                  (policySnap.max_executions_per_24h ?? 0) > 0 ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyExecutionCapBlocked24")}
                    </TextBody>
                  ) : null}
                  {policySnap.remaining_executions_7d === 0 &&
                  (policySnap.max_executions_per_7d ?? 0) > 0 ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyExecutionCapBlocked7")}
                    </TextBody>
                  ) : null}
                  {policySnap.manual_pause_active &&
                  typeof policySnap.manual_paused_until === "string" ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyManualPauseActive", {
                        until: policySnap.manual_paused_until,
                      })}
                    </TextBody>
                  ) : null}
                  {policySnap.auto_pause_active &&
                  typeof policySnap.auto_paused_until === "string" ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyAutoPauseActive", {
                        until: policySnap.auto_paused_until,
                      })}
                    </TextBody>
                  ) : null}
                  <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                    {t("home.capabilityPolicyDenials24h", {
                      n: String(policySnap.policy_denials_24h ?? 0),
                    })}
                  </TextCaption>
                  <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                    {t("home.capabilityPolicyDenials7d", {
                      n: String(policySnap.policy_denials_7d ?? 0),
                    })}
                  </TextCaption>
                  {policySnap.current_policy_block ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                      {t("home.capabilityPolicyCurrentBlock", {
                        reason: policyBlockReason(
                          typeof policySnap.current_policy_block === "string"
                            ? policySnap.current_policy_block
                            : null,
                        ),
                      })}
                    </TextBody>
                  ) : null}
                  {token ? (
                    <Button
                      variant="secondary"
                      type="button"
                      compact
                      disabled={clearPauseBusy}
                      onClick={() => void handleClearExecutionPause()}
                      style={{ borderRadius: "100px", marginTop: 6 }}
                    >
                      {clearPauseBusy
                        ? t("home.capabilityManageSaving")
                        : t("home.capabilityPolicyClearPauseButton")}
                    </Button>
                  ) : null}
                </VStack>
              </Box>
            ) : null}

            {token && windowAnalytics?.ok && waCur ? (
              <Box
                borderRadius={400}
                background="bg"
                padding={3}
                width="100%"
                minWidth={0}
              >
                <HStack
                  justifyContent="space-between"
                  alignItems="center"
                  width="100%"
                  gap={2}
                  flexWrap="wrap"
                >
                  <TextLabel1 color="fg" as="p" style={{ margin: 0, fontWeight: 650 }}>
                    {t("home.capabilityWindowTitle")}
                  </TextLabel1>
                  <Box alignSelf="flex-start" maxWidth="100%">
                    <Select
                      type="single"
                      value={analyticsWindow}
                      onChange={(next) => {
                        if (next == null) return
                        setAnalyticsWindow(next as AnalyticsWindowId)
                      }}
                      options={WINDOW_OPTIONS.map((o) => ({
                        value: o.id,
                        label: t(o.labelKey),
                      }))}
                      compact
                      bordered={false}
                      variant="foregroundMuted"
                      accessibilityLabel={t("home.capabilityWindowTitle")}
                      controlAccessibilityLabel={t("home.capabilityWindowTitle")}
                    />
                  </Box>
                </HStack>
                <TextCaption color="fgMuted" as="p" style={{ margin: "8px 0 8px", lineHeight: 1.5 }}>
                  {t("home.capabilityWindowVsPrior")}
                </TextCaption>
                <VStack gap={1} alignItems="stretch" width="100%">
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthJobs")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {waCur.total_jobs}
                      {waTrends?.executions_delta != null
                        ? ` (${waTrends.executions_delta >= 0 ? "+" : ""}${waTrends.executions_delta})`
                        : ""}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthSuccessRate")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {waCur.success_rate != null
                        ? `${Math.round(waCur.success_rate * 100)}%`
                        : "—"}
                      {waTrends?.success_rate_delta != null
                        ? ` (${waTrends.success_rate_delta >= 0 ? "+" : ""}${(waTrends.success_rate_delta * 100).toFixed(1)} pp)`
                        : ""}
                    </TextBody>
                  </HStack>
                  <HStack gap={3} justifyContent="space-between" width="100%">
                    <TextCaption color="fgMuted">{t("home.capabilityHealthAvgMs")}</TextCaption>
                    <TextBody color="fg" style={{ margin: 0 }}>
                      {waCur.avg_duration_ms != null
                        ? `${Math.round(waCur.avg_duration_ms)} ms`
                        : "—"}
                    </TextBody>
                  </HStack>
                  {waPri && (waPri.total_jobs > 0 || waCur.total_jobs > 0) ? (
                    <TextCaption color="fgMuted" as="p" style={{ margin: "6px 0 0", lineHeight: 1.45 }}>
                      {t("home.capabilityWindowPriorLabel")}:{" "}
                      {waPri.total_jobs}{" "}
                      {t("home.capabilityWindowJobsSuffix")}
                      {waPri.success_rate != null
                        ? ` · ${Math.round(waPri.success_rate * 100)}% ${t("home.capabilityWindowSuccessSuffix")}`
                        : ""}
                    </TextCaption>
                  ) : null}
                  {waNotif && waNotif.total > 0 ? (
                    <HStack gap={3} justifyContent="space-between" width="100%">
                      <TextCaption color="fgMuted">
                        {t("home.capabilityNotifyDeliveryRate")}
                      </TextCaption>
                      <TextBody color="fg" style={{ margin: 0 }}>
                        {waNotif.success_rate != null
                          ? `${Math.round(waNotif.success_rate * 100)}% (${waNotif.delivered}/${waNotif.total})`
                          : "—"}
                      </TextBody>
                    </HStack>
                  ) : null}
                </VStack>
              </Box>
            ) : null}

            <TextLabel1 color="fg" as="p" style={{ margin: 0, fontWeight: 650 }}>
              {t("home.capabilityManageEditSection")}
            </TextLabel1>
            <TextInput
              compact
              label={t("home.capabilityName")}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.endpoint")}
              value={editEndpoint}
              onChange={(e) => setEditEndpoint(e.target.value)}
              autoComplete="off"
            />
            <VStack gap={1} alignItems="stretch" width="100%">
              <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                {t("home.capabilityManageLifecycleLabel")}
              </TextLabel1>
              <Box alignSelf="flex-start" maxWidth="100%">
                <Select
                  type="single"
                  value={editLifecycle}
                  onChange={(next) => {
                    if (next == null) return
                    setEditLifecycle(next as CapabilityLifecycle)
                  }}
                  options={LIFECYCLE_OPTIONS.map((o) => ({
                    value: o.id,
                    label: t(o.labelKey),
                  }))}
                  compact
                  bordered={false}
                  variant="foregroundMuted"
                  accessibilityLabel={t("home.capabilityManageLifecycleLabel")}
                  controlAccessibilityLabel={t("home.capabilityManageLifecycleLabel")}
                />
              </Box>
            </VStack>

            <TextLabel1 color="fg" as="p" style={{ margin: "12px 0 0", fontWeight: 650 }}>
              {t("home.capabilityPolicyEditTitle")}
            </TextLabel1>
            <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
              {t("home.capabilityPolicyEditHelp")}
            </TextCaption>
            <TextInput
              compact
              label={t("home.capabilityPolicyCooldownLabel")}
              value={editCooldown}
              onChange={(e) => setEditCooldown(e.target.value)}
              placeholder={t("home.capabilityPolicyCooldownPlaceholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyMaxConcurrentLabel")}
              value={editMaxAsync}
              onChange={(e) => setEditMaxAsync(e.target.value)}
              placeholder={t("home.capabilityPolicyMaxConcurrentPlaceholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyCap24Label")}
              value={editCap24}
              onChange={(e) => setEditCap24(e.target.value)}
              placeholder={t("home.capabilityPolicyCap24Placeholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyCap7Label")}
              value={editCap7}
              onChange={(e) => setEditCap7(e.target.value)}
              placeholder={t("home.capabilityPolicyCap7Placeholder")}
              autoComplete="off"
            />

            <TextLabel1 color="fg" as="p" style={{ margin: "8px 0 0", fontWeight: 650 }}>
              {t("home.capabilityPolicyAutoPauseTitle")}
            </TextLabel1>
            <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
              {t("home.capabilityPolicyAutoPauseHelp")}
            </TextCaption>
            <Checkbox
              id="cap-auto-pause"
              value="auto-pause"
              checked={editAutoPauseEnabled}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setEditAutoPauseEnabled(e.target.checked)
              }
              accessibilityLabel={t("home.capabilityPolicyAutoPauseEnabled")}
            >
              <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                {t("home.capabilityPolicyAutoPauseEnabled")}
              </TextLabel1>
            </Checkbox>
            <TextInput
              compact
              label={t("home.capabilityPolicyAutoPauseThresholdLabel")}
              value={editAutoThresh}
              onChange={(e) => setEditAutoThresh(e.target.value)}
              placeholder={t("home.capabilityPolicyAutoPauseThresholdPlaceholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyAutoPauseWindowLabel")}
              value={editAutoWin}
              onChange={(e) => setEditAutoWin(e.target.value)}
              placeholder={t("home.capabilityPolicyAutoPauseWindowPlaceholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyAutoPauseDurationLabel")}
              value={editAutoDur}
              onChange={(e) => setEditAutoDur(e.target.value)}
              placeholder={t("home.capabilityPolicyAutoPauseDurationPlaceholder")}
              autoComplete="off"
            />
            <TextInput
              compact
              label={t("home.capabilityPolicyManualPauseLabel")}
              value={editManualPause}
              onChange={(e) => setEditManualPause(e.target.value)}
              placeholder={t("home.capabilityPolicyManualPausePlaceholder")}
              autoComplete="off"
            />

            <Button
              block
              variant="primary"
              type="button"
              onClick={() => void handleSaveEdits()}
              disabled={saveBusy}
              style={{ borderRadius: "100px" }}
            >
              {saveBusy
                ? t("home.capabilityManageSaving")
                : t("home.capabilityManageSave")}
            </Button>

            <Box
              borderRadius={400}
              background="bg"
              padding={3}
              width="100%"
              minWidth={0}
            >
              <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                {t("home.capabilityNotifyTitle")}
              </TextLabel1>
              <TextBody color="fgMuted" as="p" style={{ margin: "0 0 12px", lineHeight: 1.5 }}>
                {t("home.capabilityNotifySubtitle")}
              </TextBody>
              <VStack gap={2} alignItems="stretch" width="100%">
                <Checkbox
                  id="cap-notify-enabled"
                  value="notify-enabled"
                  checked={notifyEnabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNotifyEnabled(e.target.checked)
                  }
                  accessibilityLabel={t("home.capabilityNotifyEnabled")}
                >
                  <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                    {t("home.capabilityNotifyEnabled")}
                  </TextLabel1>
                </Checkbox>
                <Checkbox
                  id="cap-notify-email-chan"
                  value="notify-email-chan"
                  checked={notifyEmailEnabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNotifyEmailEnabled(e.target.checked)
                  }
                  accessibilityLabel={t("home.capabilityNotifyEmailChannel")}
                >
                  <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                    {t("home.capabilityNotifyEmailChannel")}
                  </TextLabel1>
                </Checkbox>
                <TextInput
                  compact
                  label={t("home.capabilityNotifyEmail")}
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <Checkbox
                  id="cap-notify-webhook-chan"
                  value="notify-webhook-chan"
                  checked={notifyWebhookEnabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNotifyWebhookEnabled(e.target.checked)
                  }
                  accessibilityLabel={t("home.capabilityNotifyWebhookChannel")}
                >
                  <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                    {t("home.capabilityNotifyWebhookChannel")}
                  </TextLabel1>
                </Checkbox>
                <TextInput
                  compact
                  label={t("home.capabilityNotifyWebhookUrl")}
                  value={notifyWebhookUrl}
                  onChange={(e) => setNotifyWebhookUrl(e.target.value)}
                  placeholder="https://example.com/hooks/402"
                  autoComplete="off"
                />
                <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                  {notifyEmailEnabled && notifyEmail.trim()
                    ? t("home.capabilityNotifyEmailReady")
                    : t("home.capabilityNotifyEmailIncomplete")}
                </TextCaption>
                <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                  {notifyWebhookEnabled && notifyWebhookUrl.trim()
                    ? t("home.capabilityNotifyWebhookReady")
                    : t("home.capabilityNotifyWebhookIncomplete")}
                </TextCaption>
                <Checkbox
                  id="cap-notify-complete"
                  value="notify-complete"
                  checked={notifyOnComplete}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNotifyOnComplete(e.target.checked)
                  }
                  accessibilityLabel={t("home.capabilityNotifyOnComplete")}
                >
                  <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                    {t("home.capabilityNotifyOnComplete")}
                  </TextLabel1>
                </Checkbox>
                <Checkbox
                  id="cap-notify-fail"
                  value="notify-fail"
                  checked={notifyOnFail}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNotifyOnFail(e.target.checked)
                  }
                  accessibilityLabel={t("home.capabilityNotifyOnFail")}
                >
                  <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
                    {t("home.capabilityNotifyOnFail")}
                  </TextLabel1>
                </Checkbox>
                {token ? (
                  <Button
                    variant="secondary"
                    type="button"
                    compact
                    disabled={notifTestBusy}
                    onClick={async () => {
                      if (!token) return
                      setNotifTestBusy(true)
                      setError(null)
                      try {
                        const r = await postSellerCapabilityNotificationTest(
                          token,
                          slug,
                        )
                        if (!r.ok && r.code === "TEST_NOT_RUNNABLE") {
                          setError(r.error ?? t("home.capabilityNotifyTestFailed"))
                          return
                        }
                        await reloadNotificationDeliveries(token)
                      } finally {
                        setNotifTestBusy(false)
                      }
                    }}
                  >
                    {notifTestBusy
                      ? t("home.capabilityNotifyTestSending")
                      : t("home.capabilityNotifyTestButton")}
                  </Button>
                ) : null}
              </VStack>
            </Box>

            {notifSummary ? (
              <Box
                bordered
                borderRadius={400}
                background={
                  notifSummary.delivery_health === "healthy"
                    ? "bgPositiveWash"
                    : "bgWarningWash"
                }
                padding={3}
                width="100%"
              >
                <TextLabel1 color="fg" as="p" style={{ margin: "0 0 6px", fontWeight: 650 }}>
                  {t("home.capabilityNotifyHealthTitle")}
                </TextLabel1>
                <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                  {t("home.capabilityNotifyHealthLine", {
                    health: notifSummary.delivery_health,
                    failed: notifSummary.failed_in_page,
                    pending: notifSummary.pending_in_page,
                  })}
                </TextCaption>
              </Box>
            ) : null}

            {token ? (
              <HStack gap={2} alignItems="flex-end" width="100%" style={{ flexWrap: "wrap" }}>
                <Box minWidth={120}>
                  <TextCaption color="fgMuted" style={{ margin: "0 0 4px" }}>
                    {t("home.capabilityNotifyFilterStatus")}
                  </TextCaption>
                  <select
                    value={notifFilterStatus}
                    onChange={(e) => setNotifFilterStatus(e.target.value)}
                    style={{ width: "100%", minHeight: 36 }}
                  >
                    <option value="">{t("home.capabilityNotifyFilterAll")}</option>
                    <option value="delivered">{t("home.capabilityNotifyFilterDelivered")}</option>
                    <option value="failed">{t("home.capabilityNotifyFilterFailed")}</option>
                    <option value="pending">{t("home.capabilityNotifyFilterPending")}</option>
                  </select>
                </Box>
                <Box minWidth={120}>
                  <TextCaption color="fgMuted" style={{ margin: "0 0 4px" }}>
                    {t("home.capabilityNotifyFilterChannel")}
                  </TextCaption>
                  <select
                    value={notifFilterChannel}
                    onChange={(e) => setNotifFilterChannel(e.target.value)}
                    style={{ width: "100%", minHeight: 36 }}
                  >
                    <option value="">{t("home.capabilityNotifyFilterAll")}</option>
                    <option value="email">email</option>
                    <option value="webhook">webhook</option>
                  </select>
                </Box>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  onClick={() => void reloadNotificationDeliveries(token)}
                >
                  {t("home.capabilityNotifyApplyFilters")}
                </Button>
              </HStack>
            ) : null}

            {notifDeliveries.length > 0 ? (
              <Box width="100%" minWidth={0}>
                <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                  {t("home.capabilityNotifyHistoryTitle")}
                </TextLabel1>
                <Box
                  as="table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "4px 8px 4px 0" }}>
                        {t("home.capabilityNotifyColChannel")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>
                        {t("home.capabilityNotifyColEvent")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>
                        {t("home.capabilityNotifyColStatus")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                        {t("home.capabilityNotifyColTime")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                        {t("home.capabilityNotifyColJob")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                        {t("home.capabilityNotifyColError")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                        {t("home.capabilityNotifyColAction")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifDeliveries.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: "4px 8px 4px 0" }}>{row.channel}</td>
                        <td style={{ padding: "4px 8px", wordBreak: "break-word" }}>
                          {row.event_type}
                        </td>
                        <td style={{ padding: "4px 8px" }}>{row.status}</td>
                        <td style={{ padding: "4px 0 4px 8px", color: "var(--fgMuted)" }}>
                          {row.completed_at?.slice(0, 19) ??
                            row.attempted_at?.slice(0, 19) ??
                            row.created_at.slice(0, 19)}
                        </td>
                        <td style={{ padding: "4px 0 4px 8px", wordBreak: "break-all", fontSize: 11 }}>
                          {row.job_id ?? "—"}
                        </td>
                        <td style={{ padding: "4px 0 4px 8px", wordBreak: "break-word", fontSize: 11 }}>
                          {row.error_message?.trim() ? row.error_message : "—"}
                        </td>
                        <td style={{ padding: "4px 0 4px 8px" }}>
                          {row.status === "failed" && token ? (
                            <Button
                              variant="secondary"
                              compact
                              type="button"
                              disabled={notifRetryBusyId === row.id}
                              onClick={async () => {
                                setNotifRetryBusyId(row.id)
                                setError(null)
                                try {
                                  const r = await postSellerCapabilityNotificationRetry(
                                    token,
                                    slug,
                                    row.id,
                                  )
                                  if (!r.ok) {
                                    setError(r.error ?? t("home.capabilityNotifyRetryFailed"))
                                    return
                                  }
                                  await reloadNotificationDeliveries(token)
                                } finally {
                                  setNotifRetryBusyId(null)
                                }
                              }}
                            >
                              {t("home.capabilityNotifyRetry")}
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
                {notifDeliveries.some((r) => r.error_message) ? (
                  <TextCaption color="fgMuted" as="p" style={{ margin: "8px 0 0", lineHeight: 1.45 }}>
                    {t("home.capabilityNotifyHistoryErrorsHint")}
                  </TextCaption>
                ) : null}
              </Box>
            ) : null}

            <TextLabel1 color="fg" as="p" style={{ margin: 0, fontWeight: 650 }}>
              {t("home.capabilityManageTrustSection")}
            </TextLabel1>
            <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
              {t("home.capabilityManageTrustHelp")}
            </TextBody>
            <HStack
              gap={2}
              alignItems="flex-end"
              width="100%"
              minWidth={0}
              style={{ flexWrap: "wrap" }}
            >
              <Box flexGrow={1} minWidth={0}>
                <TextInput
                  compact
                  label={t("home.capabilityManageAllowHost")}
                  value={allowHost}
                  onChange={(e) => setAllowHost(e.target.value)}
                  placeholder="api.example.com"
                  autoComplete="off"
                />
              </Box>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleAllowlistAdd()}
                disabled={allowBusy}
                style={{ borderRadius: "100px", flexShrink: 0 }}
              >
                {allowBusy
                  ? t("home.capabilityManageAdding")
                  : t("home.capabilityManageAddHost")}
              </Button>
            </HStack>

            <TextLabel1 color="fg" as="p" style={{ margin: 0, fontWeight: 650 }}>
              {t("home.capabilityManageJobsSection")}
            </TextLabel1>
            <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
              {Object.entries(jobsBy)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "—"}
            </TextCaption>
            {recent.length > 0 ? (
              <Box
                as="table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px 4px 0" }}>
                      {t("home.capabilityManageColJob")}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                      {t("home.capabilityManageColStatus")}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                      {t("home.capabilityManageColOutcome")}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                      {t("home.capabilityManageColRetention")}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                      {t("home.capabilityManageColUpdated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((j) => (
                    <tr key={j.id}>
                      <td
                        style={{
                          padding: "4px 8px 4px 0",
                          wordBreak: "break-all",
                          fontFamily: "monospace",
                        }}
                      >
                        {j.id.slice(0, 10)}…
                      </td>
                      <td style={{ padding: "4px 8px" }}>{j.status}</td>
                      <td style={{ padding: "4px 8px" }}>
                        {j.final_outcome ?? "—"}
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        {j.result_retention_state ?? "—"}
                      </td>
                      <td style={{ padding: "4px 0 4px 8px", color: "var(--fgMuted)" }}>
                        {j.updated_at?.slice(0, 19) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            ) : (
              <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                {t("home.capabilityManageNoJobs")}
              </TextCaption>
            )}

            <Box id="execution-history" style={{ scrollMarginTop: 72 }}>
              <TextLabel1 color="fg" as="p" style={{ margin: "12px 0 8px", fontWeight: 650 }}>
                {t("home.capabilityHistTitle")}
              </TextLabel1>
              <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
                {t("home.capabilityHistHelp")}
              </TextCaption>
              <HStack gap={2} flexWrap="wrap" style={{ marginBottom: 8 }}>
                <Box as="label" style={{ fontSize: 12, color: "var(--fgMuted)" }}>
                  {t("home.capabilityHistStatus")}
                  <select
                    value={histStatus}
                    onChange={(e) => setHistStatus(e.target.value)}
                    style={{ marginLeft: 8 }}
                  >
                    <option value="">{t("home.capabilityHistAnyStatus")}</option>
                    <option value="failed">failed</option>
                    <option value="retry_scheduled">retry_scheduled</option>
                    <option value="completed">completed</option>
                    <option value="running">running</option>
                    <option value="pending">pending</option>
                  </select>
                </Box>
                <Box as="label" style={{ fontSize: 12, color: "var(--fgMuted)" }}>
                  {t("home.capabilityHistSince")}
                  <select
                    value={histSince}
                    onChange={(e) =>
                      setHistSince(e.target.value as typeof histSince)
                    }
                    style={{ marginLeft: 8 }}
                  >
                    <option value="24h">24h</option>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="all">{t("home.capabilityHistAllTime")}</option>
                  </select>
                </Box>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  disabled={histBusy || !token}
                  onClick={() => token && void loadHist(token, false, null)}
                  style={{ borderRadius: "100px" }}
                >
                  {histBusy ? t("home.capabilityHistLoading") : t("home.capabilityHistApply")}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  disabled={histBusy || !token}
                  onClick={() => {
                    if (!token) return
                    setHistStatus("failed")
                    setHistSince("7d")
                    setHistBusy(true)
                    setError(null)
                    setHistNext(null)
                    void (async () => {
                      try {
                        const res = await fetchSellerCapabilityJobs(token, slug, {
                          limit: 20,
                          status: "failed",
                          since: "7d",
                        })
                        if (!res.ok) {
                          setError(res.error ?? t("home.capabilityHistLoadFailed"))
                          return
                        }
                        setHistJobs(res.jobs ?? [])
                        setHistNext(res.next_cursor ?? null)
                      } finally {
                        setHistBusy(false)
                      }
                    })()
                  }}
                  style={{ borderRadius: "100px" }}
                >
                  {t("home.capabilityHistPresetFailed")}
                </Button>
              </HStack>
              {histJobs.length > 0 ? (
                <Box
                  as="table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "4px 8px 4px 0" }}>
                        {t("home.capabilityHistColJob")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>
                        {t("home.capabilityManageColStatus")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>
                        {t("home.capabilityManageColRetention")}
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 0 4px 8px" }}>
                        {t("home.capabilityHistColDetail")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {histJobs.map((j) => {
                      const id = String(j.id ?? "")
                      const jobHref = `/manage/capability/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(id)}?receiver=${encodeURIComponent(recv)}`
                      return (
                        <tr key={id}>
                          <td
                            style={{
                              padding: "4px 8px 4px 0",
                              wordBreak: "break-all",
                              fontFamily: "monospace",
                            }}
                          >
                            {id.slice(0, 12)}…
                          </td>
                          <td style={{ padding: "4px 8px" }}>{String(j.status ?? "")}</td>
                          <td style={{ padding: "4px 8px" }}>
                            {String(j.result_retention_state ?? "—")}
                          </td>
                          <td style={{ padding: "4px 0 4px 8px" }}>
                            <RouterLink to={jobHref} style={{ fontSize: 12 }}>
                              {t("home.capabilityHistInspect")}
                            </RouterLink>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Box>
              ) : (
                <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("home.capabilityHistEmpty")}
                </TextCaption>
              )}
              {histNext && token ? (
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  disabled={histBusy}
                  onClick={() => token && void loadHist(token, true, histNext)}
                  style={{ borderRadius: "100px", marginTop: 8 }}
                >
                  {t("home.capabilityHistMore")}
                </Button>
              ) : null}
            </Box>

            <Box style={{ marginTop: 8 }}>
              <Button
                variant="secondary"
                type="button"
                compact
                onClick={() => {
                  setDiagOpen((o) => !o)
                  if (!diagOpen && token) void loadDiagnostics(token)
                }}
                style={{ borderRadius: "100px" }}
              >
                {diagOpen
                  ? t("home.capabilityDiagHide")
                  : t("home.capabilityDiagShow")}
              </Button>
              {diagOpen && diagBusy ? (
                <TextCaption color="fgMuted" as="p" style={{ margin: "8px 0 0" }}>
                  {t("home.capabilityDiagLoading")}
                </TextCaption>
              ) : null}
              {diagOpen && diag?.ok ? (
                <Box
                  bordered
                  borderRadius={400}
                  background="bg"
                  padding={3}
                  style={{ marginTop: 8 }}
                  width="100%"
                  minWidth={0}
                >
                  <TextLabel1 color="fg" as="p" style={{ margin: "0 0 8px", fontWeight: 650 }}>
                    {t("home.capabilityDiagTitle")}
                  </TextLabel1>
                  {diag.policy_snapshot ? (
                    <Box style={{ marginBottom: 10 }}>
                      <TextLabel1 color="fg" as="p" style={{ margin: "0 0 6px", fontWeight: 650 }}>
                        {t("home.capabilityDiagPolicyTitle")}
                      </TextLabel1>
                      <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                        {t("home.capabilityPolicyDenials24h", {
                          n: String(diag.policy_snapshot.policy_denials_24h ?? 0),
                        })}
                      </TextCaption>
                      <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                        {t("home.capabilityPolicyDenials7d", {
                          n: String(diag.policy_snapshot.policy_denials_7d ?? 0),
                        })}
                      </TextCaption>
                      {diag.policy_audit_counts_window ? (
                        <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
                          {t("home.capabilityDiagPolicyDenied", {
                            n: String(
                              diag.policy_audit_counts_window.policy_denied ?? 0,
                            ),
                          })}
                          {" · "}
                          {t("home.capabilityDiagPolicyAutoPaused", {
                            n: String(
                              diag.policy_audit_counts_window.auto_paused ?? 0,
                            ),
                          })}
                          {" · "}
                          {t("home.capabilityDiagPolicyAutoCleared", {
                            n: String(
                              diag.policy_audit_counts_window.auto_pause_cleared ??
                                0,
                            ),
                          })}
                        </TextCaption>
                      ) : null}
                    </Box>
                  ) : null}
                  {diag.failure_class_distribution &&
                  diag.failure_class_distribution.length > 0 ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: "0 0 6px", fontSize: 12 }}>
                      {diag.failure_class_distribution
                        .map((x) => `${x.failure_class ?? "∅"}: ${x.count}`)
                        .join(" · ")}
                    </TextBody>
                  ) : (
                    <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 8px" }}>
                      {t("home.capabilityDiagNoFailuresWindow")}
                    </TextCaption>
                  )}
                  {diag.most_recent_failure &&
                  typeof diag.most_recent_failure === "object" ? (
                    <TextBody color="fg" as="p" style={{ margin: 0, lineHeight: 1.5, fontSize: 13 }}>
                      {String(
                        (diag.most_recent_failure as { last_error_summary?: string })
                          .last_error_summary ?? "",
                      )}
                    </TextBody>
                  ) : null}
                  {diag.insights?.length ? (
                    <VStack gap={1} alignItems="stretch" style={{ marginTop: 8 }}>
                      {diag.insights.map((ins) => (
                        <TextBody
                          key={ins.code}
                          color={ins.level === "critical" ? "fgNegative" : "fgMuted"}
                          as="p"
                          style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}
                        >
                          {ins.message}
                        </TextBody>
                      ))}
                    </VStack>
                  ) : null}
                </Box>
              ) : null}
            </Box>
          </>
        ) : null}
      </VStack>
    </Box>
  )
}
