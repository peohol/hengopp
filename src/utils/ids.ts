let counter = 0

/** Short, collision-safe ids. Deterministic-ish prefix keeps debugging sane. */
export function createId(prefix = 'id'): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

export const newObjectId = () => createId('obj')
export const newGroupId = () => createId('grp')
export const newMeasurementId = () => createId('msr')
export const newProjectId = () => createId('prj')
