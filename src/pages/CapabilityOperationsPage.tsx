import { useCallback, useEffect, useMemo, useState } from "react"
import { Link as RouterLink } from "react-router-dom"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextLabel1,
  TextTitle3,
} from "@coinbase/cds-web/typography"
import {
  clearStoredSellerJwt,
  fetchSellerCapabilitiesIndex,
  getStoredSellerJwt,
  postCapabilitySellerAuth,
  postCapabilitySellerChallenge,
  setStoredSellerJwt,
} from "@/lib/api"

const pagePaddingX = { base: 2, desktop: 4 } as const
const pagePaddingY = { base: 3, desktop: 5 } as const

export default function CapabilityOperationsPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const receiver = searchParams.get("receiver")?.trim() ?? ""
  const recv = receiver
  const [token, setToken] = useState<string | null>(() =>
    recv ? getStoredSellerJwt(recv) : null,
  )
  const [loadBusy, setLoadBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [indexBody, setIndexBody] = useState<Record<string, unknown> | null>(null)
  const [filterText, setFilterText] = useState("")

  const refresh = useCallback(
    async (authToken: string) => {
      setLoadBusy(true)
      setError(null)
      try {
        const res = await fetchSellerCapabilitiesIndex(authToken)
        if (!res.ok) {
          setError(res.error ?? t("capabilityOps.loadFailed"))
          if (res.code === "UNAUTHORIZED") {
            clearStoredSellerJwt(recv)
            setToken(null)
            setIndexBody(null)
          }
          return
        }
        setIndexBody(res as unknown as Record<string, unknown>)
      } finally {
        setLoadBusy(false)
      }
    },
    [recv, t],
  )

  useEffect(() => {
    if (!token) {
      setIndexBody(null)
      return
    }
    void refresh(token)
  }, [token, refresh])

  const summary = indexBody?.operations_summary as
    | Record<string, unknown>
    | undefined

  const filtered = useMemo(() => {
    const caps = (indexBody?.capabilities ?? []) as Record<string, unknown>[]
    const q = filterText.trim().toLowerCase()
    if (!q) return caps
    return caps.filter((c) => {
      const slug = String(c.slug ?? "").toLowerCase()
      const name = String(c.capability_name ?? "").toLowerCase()
      const label = String(c.label ?? "").toLowerCase()
      return slug.includes(q) || name.includes(q) || label.includes(q)
    })
  }, [indexBody?.capabilities, filterText])

  async function handleWalletSignIn() {
    if (!recv) {
      setError(t("capabilityOps.noReceiver"))
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
      setError(t("capabilityOps.noWallet"))
      return
    }
    setError(null)
    const ch = await postCapabilitySellerChallenge(recv)
    const chData = ch.data
    if (!chData?.ok || !chData.challenge_id || !chData.message) {
      setError(t("capabilityOps.challengeFailed"))
      return
    }
    let sig: string
    try {
      sig = (await eth.request({
        method: "personal_sign",
        params: [chData.message, recv],
      })) as string
    } catch {
      setError(t("capabilityOps.signRejected"))
      return
    }
    const auth = await postCapabilitySellerAuth({
      wallet: recv,
      challengeId: chData.challenge_id,
      signature: sig as `0x${string}`,
    })
    const authData = auth.data
    if (!authData?.ok || !authData.token) {
      setError(t("capabilityOps.authFailed"))
      return
    }
    setStoredSellerJwt(recv, authData.token)
    setToken(authData.token)
  }

  function handleSignOut() {
    clearStoredSellerJwt(recv)
    setToken(null)
    setIndexBody(null)
  }

  const lc = summary?.lifecycle as
    | { active?: number; disabled?: number; archived?: number }
    | undefined

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      background="bg"
      color="fg"
      style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
    >
      <Box
        width="100%"
        maxWidth="56rem"
        paddingX={pagePaddingX}
        paddingY={pagePaddingY}
      >
        <VStack gap={3} alignItems="stretch" width="100%">
          <RouterLink
            to="/"
            style={{
              textDecoration: "none",
              alignSelf: "flex-start",
            }}
          >
            <TextCaption color="fgMuted" as="span">
              ← {t("capabilityOps.backHome")}
            </TextCaption>
          </RouterLink>
          <VStack gap={1} alignItems="stretch">
            <TextTitle3 color="fg" as="h1" style={{ margin: 0 }}>
              {t("capabilityOps.pageTitle")}
            </TextTitle3>
            <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
              {t("capabilityOps.pageIntro")}
            </TextBody>
          </VStack>

          {!recv ? (
            <Box
              bordered
              borderRadius={400}
              background="bgWarningWash"
              padding={3}
            >
              <TextBody color="fg" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("capabilityOps.missingReceiver")}
              </TextBody>
            </Box>
          ) : !token ? (
            <VStack gap={2} alignItems="stretch">
              <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                {t("capabilityOps.signInHint")}
              </TextBody>
              <Button
                variant="primary"
                type="button"
                onClick={() => void handleWalletSignIn()}
                style={{ borderRadius: "100px", alignSelf: "flex-start" }}
              >
                {t("capabilityOps.signIn")}
              </Button>
            </VStack>
          ) : (
            <>
              <HStack gap={2} flexWrap="wrap" alignItems="center">
                <TextCaption color="fgMuted">{t("capabilityOps.signedIn")}</TextCaption>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  onClick={() => void refresh(token)}
                  disabled={loadBusy}
                  style={{ borderRadius: "100px" }}
                >
                  {loadBusy ? t("capabilityOps.refreshing") : t("capabilityOps.refresh")}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  onClick={handleSignOut}
                  style={{ borderRadius: "100px" }}
                >
                  {t("capabilityOps.signOut")}
                </Button>
              </HStack>
              {error ? (
                <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
                  {error}
                </TextBody>
              ) : null}

              {summary ? (
                <Box
                  bordered
                  borderRadius={400}
                  background="bgSecondary"
                  padding={3}
                  width="100%"
                >
                  <TextLabel1 color="fg" as="p" style={{ margin: "0 0 10px", fontWeight: 650 }}>
                    {t("capabilityOps.summaryTitle")}
                  </TextLabel1>
                  <VStack gap={1} alignItems="stretch">
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryTotal", {
                        n: String(summary.total_capabilities ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryLifecycle", {
                        a: String(lc?.active ?? 0),
                        d: String(lc?.disabled ?? 0),
                        r: String(lc?.archived ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryUnhealthy", {
                        n: String(summary.unhealthy_count ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryRecentFailures", {
                        n: String(summary.capabilities_with_recent_failures ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryTrust", {
                        n: String(summary.capabilities_with_trust_issues ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryPolicy", {
                        n: String(summary.capabilities_with_policy_pressure ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryPolicyBlocked", {
                        n: String(
                          summary.capabilities_blocked_by_policy_now ?? 0,
                        ),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryAutoPause", {
                        n: String(
                          summary.capabilities_with_auto_pause_events_7d ?? 0,
                        ),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryRetention", {
                        n: String(summary.capabilities_with_retention_signals ?? 0),
                      })}
                    </TextCaption>
                    <TextCaption color="fgMuted">
                      {t("capabilityOps.summaryNotif", {
                        n: String(
                          summary.capabilities_with_failed_notifications_7d ?? 0,
                        ),
                      })}
                    </TextCaption>
                  </VStack>
                  <HStack gap={2} flexWrap="wrap" style={{ marginTop: 12 }}>
                    {(
                      (summary.quick_filters as Record<string, string[]>)?.unhealthy_slugs ??
                      []
                    )
                      .slice(0, 5)
                      .map((slug) => (
                        <RouterLink
                          key={slug}
                          to={`/manage/capability/${encodeURIComponent(slug)}?receiver=${encodeURIComponent(recv)}`}
                          style={{ fontSize: 12 }}
                        >
                          {slug}
                        </RouterLink>
                      ))}
                  </HStack>
                </Box>
              ) : null}

              <TextInput
                compact
                label={t("capabilityOps.filterLabel")}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                autoComplete="off"
              />

              <Box as="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px 6px 0" }}>
                      {t("capabilityOps.colSlug")}
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      {t("capabilityOps.colLifecycle")}
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      {t("capabilityOps.colTrust")}
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      {t("capabilityOps.colHealth")}
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 0 6px 8px" }}>
                      {t("capabilityOps.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const slug = String(c.slug ?? "")
                    const href = `/manage/capability/${encodeURIComponent(slug)}?receiver=${encodeURIComponent(recv)}`
                    const jobsHref = `${href}#execution-history`
                    return (
                      <tr key={slug}>
                        <td style={{ padding: "6px 8px 6px 0", wordBreak: "break-all" }}>
                          <RouterLink to={href}>{slug}</RouterLink>
                          <TextCaption color="fgMuted" as="div" style={{ marginTop: 2 }}>
                            {String(c.capability_name ?? c.label ?? "")}
                          </TextCaption>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {String(c.capability_lifecycle ?? "—")}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {String(c.capability_origin_trust ?? "—")}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {String(c.health_tier ?? "—")}
                        </td>
                        <td style={{ padding: "6px 0 6px 8px" }}>
                          <RouterLink to={href} style={{ marginRight: 10 }}>
                            {t("capabilityOps.openDetail")}
                          </RouterLink>
                          <RouterLink to={jobsHref}>{t("capabilityOps.openJobs")}</RouterLink>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Box>
            </>
          )}
        </VStack>
      </Box>
    </Box>
  )
}
