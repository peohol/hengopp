import { z } from 'zod'

export const objectGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentGroupId: z.string().nullable(),
  childObjectIds: z.array(z.string()),
  childGroupIds: z.array(z.string()),
})

export type ObjectGroup = z.infer<typeof objectGroupSchema>
