/** Shared vertical size for compact CDS fields (TextInput `height`, Select control body). */
export const CDS_COMPACT_FIELD_HEIGHT_PX = "60px" as const

export const cdsAppComponentConfig = {
  TextInput: { height: CDS_COMPACT_FIELD_HEIGHT_PX },
} as const

export const cdsCompactSelectFieldStyles = {
  controlInputNode: { minHeight: CDS_COMPACT_FIELD_HEIGHT_PX },
} as const
