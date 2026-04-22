import { useCallback, useEffect, useState } from "react"
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@coinbase/cds-web/buttons"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"
import {
  clearStoredSellerJwt,
  fetchSellerCapabilityJobDetail,
  getStoredSellerJwt,
  postCapabilitySellerAuth,
  postCapabilitySellerChallenge,
  setStoredSellerJwt,
} from "@/lib/api"

const pagePaddingX = { base: 2, desktop: 4 } as const
const pagePaddingY = { base: 3, desktop: 5 } as const

export default function CapabilityJobDetailPage() {
  const { t } = useTranslation()
  const { slug: slugParam, jobId: jobIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const slug = slugParam?.trim() ?? ""
  const jobId = jobIdParam?.trim() ?? ""
  const receiver = searchParams.get("receiver")?.trim() ?? ""
  const recv = receiver

  const [token, setToken] = useState<string | null>(() =>
    recv ? getStoredSellerJwt(recv) : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(
    async (authToken: string) => {
      if (!slug || !jobId) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetchSellerCapabilityJobDetail(authToken, slug, jobId)
        if (!res.ok) {
          setError(res.error ?? t("capabilityJobDetail.loadFailed"))
          if (res.code === "UNAUTHORIZED") {
            clearStoredSellerJwt(recv)
            setToken(null)
            setDetail(null)
          }
          return
        }
        setDetail(res as unknown as Record<string, unknown>)
      } finally {
        setBusy(false)
      }
    },
    [slug, jobId, recv, t],
  )

  useEffect(() => {
    if (!token || !slug || !jobId) {
      setDetail(null)
      return
    }
    void load(token)
  }, [token, slug, jobId, load])

  async function handleWalletSignIn() {
    if (!recv) {
      setError(t("capabilityJobDetail.noReceiver"))
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
      setError(t("capabilityJobDetail.noWallet"))
      return
    }
    setError(null)
    const ch = await postCapabilitySellerChallenge(recv)
    const chData = ch.data
    if (!chData?.ok || !chData.challenge_id || !chData.message) {
      setError(t("capabilityJobDetail.challengeFailed"))
      return
    }
    let sig: string
    try {
      sig = (await eth.request({
        method: "personal_sign",
        params: [chData.message, recv],
      })) as string
    } catch {
      setError(t("capabilityJobDetail.signRejected"))
      return
    }
    const auth = await postCapabilitySellerAuth({
      wallet: recv,
      challengeId: chData.challenge_id,
      signature: sig as `0x${string}`,
    })
    const authData = auth.data
    if (!authData?.ok || !authData.token) {
      setError(t("capabilityJobDetail.authFailed"))
      return
    }
    setStoredSellerJwt(recv, authData.token)
    setToken(authData.token)
  }

  const job = detail?.job as Record<string, unknown> | undefined
  const cap = detail?.capability_summary as Record<string, unknown> | undefined
  const audit = (detail?.audit_sample ?? []) as Record<string, unknown>[]

  const backHref =
    slug && recv
      ? `/manage/capability/${encodeURIComponent(slug)}?receiver=${encodeURIComponent(recv)}#execution-history`
      : "/"

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
        maxWidth="40rem"
        paddingX={pagePaddingX}
        paddingY={pagePaddingY}
      >
        <VStack gap={3} alignItems="stretch" width="100%">
          <RouterLink to={backHref} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
            <TextCaption color="fgMuted" as="span">
              ← {t("capabilityJobDetail.back")}
            </TextCaption>
          </RouterLink>
          <TextTitle3 color="fg" as="h1" style={{ margin: 0 }}>
            {t("capabilityJobDetail.pageTitle")}
          </TextTitle3>

          {!slug || !jobId || !recv ? (
            <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
              {t("capabilityJobDetail.missingParams")}
            </TextBody>
          ) : !token ? (
            <VStack gap={2} alignItems="stretch">
              <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                {t("capabilityJobDetail.signInHint")}
              </TextBody>
              <Button
                variant="primary"
                type="button"
                onClick={() => void handleWalletSignIn()}
                style={{ borderRadius: "100px", alignSelf: "flex-start" }}
              >
                {t("capabilityJobDetail.signIn")}
              </Button>
            </VStack>
          ) : (
            <>
              {error ? (
                <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
                  {error}
                </TextBody>
              ) : null}
              {busy && !job ? (
                <TextCaption color="fgMuted">{t("capabilityJobDetail.loading")}</TextCaption>
              ) : null}
              {job ? (
                <VStack gap={2} alignItems="stretch">
                  <HStack gap={2} flexWrap="wrap" alignItems="center">
                    <TextCaption color="fgMuted">{t("capabilityJobDetail.jobId")}</TextCaption>
                    <Button
                      variant="secondary"
                      type="button"
                      compact
                      onClick={() => void navigator.clipboard.writeText(String(job.id ?? ""))}
                      style={{ borderRadius: "100px" }}
                    >
                      {t("capabilityJobDetail.copyId")}
                    </Button>
                  </HStack>
                  <TextBody
                    color="fg"
                    as="pre"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {String(job.id ?? "")}
                  </TextBody>
                  <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                    {t("capabilityJobDetail.status")}: {String(job.status ?? "—")} ·{" "}
                    {t("capabilityJobDetail.outcome")}: {String(job.final_outcome ?? "—")}
                  </TextBody>
                  <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                    {t("capabilityJobDetail.attempts")}: {String(job.attempt_count ?? "—")} /{" "}
                    {String(job.max_attempts ?? "—")}
                  </TextBody>
                  {job.last_error_summary ? (
                    <TextBody color="fg" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                      {String(job.last_error_summary)}
                    </TextBody>
                  ) : null}
                  {job.retrieval_hint ? (
                    <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                      {String(job.retrieval_hint)}
                    </TextCaption>
                  ) : null}
                  {cap ? (
                    <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                      {String(cap.slug)} · {String(cap.delivery_mode ?? "")} ·{" "}
                      {String(cap.capability_lifecycle ?? "")}
                    </TextCaption>
                  ) : null}
                  {audit.length > 0 ? (
                    <Box style={{ marginTop: 8 }}>
                      <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 6px" }}>
                        {t("capabilityJobDetail.auditSample")}
                      </TextCaption>
                      <Box as="ul" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                        {audit.map((a) => (
                          <Box as="li" key={String(a.id)} style={{ marginBottom: 4 }}>
                            {String(a.created_at ?? "").slice(0, 19)} — {String(a.event_type ?? "")}
                            {a.status_summary ? ` — ${String(a.status_summary)}` : ""}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ) : null}
                </VStack>
              ) : null}
            </>
          )}
        </VStack>
      </Box>
    </Box>
  )
}
