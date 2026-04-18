/// <reference types="vite/client" />

/** WebMCP (draft): https://webmachinelearning.github.io/webmcp/ */
interface ModelContextToolRegister {
  name: string
  title?: string
  description: string
  inputSchema: object
  execute: (input: object, client: unknown) => Promise<unknown>
  annotations?: { readOnlyHint?: boolean }
}

interface ModelContext {
  registerTool: (
    tool: ModelContextToolRegister,
    options?: { signal?: AbortSignal },
  ) => void
}

interface Navigator {
  modelContext?: ModelContext
}
