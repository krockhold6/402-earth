export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }

export type LegalSection = {
  title: string
  blocks: LegalBlock[]
}

export type LegalPageEn = {
  /** ISO-style dates for display, already formatted for the document */
  effectiveDate: string
  lastUpdated: string
  preface: string[]
  sections: LegalSection[]
}
