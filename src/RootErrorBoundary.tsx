import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = { children: ReactNode }

type State = { error: Error | null; errorInfo: ErrorInfo | null }

/**
 * Avoid a silent blank screen (dark body from index.css, empty #root) when a
 * render throws in production.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message
      return (
        <div
          style={{
            boxSizing: "border-box",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            maxWidth: 560,
            margin: "0 auto",
            color: "#e8e8e8",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginTop: 0 }}>
            This page couldn’t load
          </h1>
          <p style={{ color: "#a8a8a8", lineHeight: 1.5 }}>
            If you just deployed, try a{" "}
            <strong>hard refresh</strong> (Cmd+Shift+R or Ctrl+Shift+R) so the
            browser loads the latest scripts. Stale cache often causes a blank
            page after a new build.
          </p>
          <pre
            style={{
              fontSize: 12,
              overflow: "auto",
              background: "rgba(0,0,0,0.35)",
              padding: 12,
              borderRadius: 8,
              color: "#f0f0f0",
            }}
          >
            {msg}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid #666",
              background: "#2a2a2a",
              color: "#fff",
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
