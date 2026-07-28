import type { SceneObject } from '@/models/object'
import type { ObjectGroup } from '@/models/group'
import { createEmptyProject, type HengoppProject } from '@/models/project'
import { DEFAULT_OBJECT_GRID } from '@/models/grid'

let seq = 0

export function makeObject(partial: Partial<SceneObject> & { id?: string }): SceneObject {
  seq += 1
  const id = partial.id ?? `obj${seq}`
  return {
    id,
    name: partial.name ?? id,
    shape: partial.shape ?? 'rectangle',
    xMm: partial.xMm ?? 0,
    yMm: partial.yMm ?? 0,
    widthMm: partial.widthMm ?? 100,
    heightMm: partial.heightMm ?? 100,
    fillColor: partial.fillColor ?? '#c9d7e6',
    borderColor: partial.borderColor ?? '#8fa6bd',
    anchor: partial.anchor ?? { u: 0.5, v: 0.5 },
    internalGrid: partial.internalGrid ?? { ...DEFAULT_OBJECT_GRID },
    parentGroupId: partial.parentGroupId ?? null,
    zIndex: partial.zIndex ?? 0,
  }
}

export function makeGroup(partial: Partial<ObjectGroup> & { id: string }): ObjectGroup {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    parentGroupId: partial.parentGroupId ?? null,
    childObjectIds: partial.childObjectIds ?? [],
    childGroupIds: partial.childGroupIds ?? [],
  }
}

export function makeProject(
  objects: SceneObject[] = [],
  groups: ObjectGroup[] = [],
  overrides: Partial<HengoppProject> = {},
): HengoppProject {
  const base = createEmptyProject('test-project')
  return {
    ...base,
    isDraftSetup: false,
    surface: { widthMm: 1000, heightMm: 800, color: '#f2f0ec' },
    ...overrides,
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    groups: Object.fromEntries(groups.map((g) => [g.id, g])),
  }
}
