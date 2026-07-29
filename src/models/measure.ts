import { z } from 'zod'

/**
 * A free measuring line drawn with the measure tool. Both endpoints are stored
 * in model millimetres; everything the user sees (length, vector components) is
 * derived from them, so zoom never changes a measurement.
 */
export const measureLineSchema = z.object({
  id: z.string().min(1),
  x1Mm: z.number().finite(),
  y1Mm: z.number().finite(),
  x2Mm: z.number().finite(),
  y2Mm: z.number().finite(),
  /** Pinned lines keep their labels visible without hovering. */
  pinned: z.boolean().default(false),
  startAttachment: z
    .object({ objectId: z.string().min(1), xRatio: z.number().finite(), yRatio: z.number().finite() })
    .optional(),
  endAttachment: z
    .object({ objectId: z.string().min(1), xRatio: z.number().finite(), yRatio: z.number().finite() })
    .optional(),
})

export type MeasureLine = z.infer<typeof measureLineSchema>
export type MeasureAttachment = NonNullable<MeasureLine['startAttachment']>
