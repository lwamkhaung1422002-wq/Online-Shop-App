import { describe, expect, it } from 'vitest'
import {
  MAX_OPTION_LEVELS,
  normalizeOptionTree,
  optionPathFromValueIds,
  optionPathMatchesValueIds,
  optionValuesForLevel,
} from './catalog.js'

const fiveLevelTree = {
  levels: [
    { id: 'level-1', label: 'Size' },
    { id: 'level-2', label: 'Color' },
    { id: 'level-3', label: 'Material' },
    { id: 'level-4', label: 'Storage' },
    { id: 'level-5', label: 'Grade' },
    { id: 'level-6', label: 'Ignored' },
  ],
  values: [
    { id: 'size-1', label: 'Size 1', level: 0, parentId: null },
    { id: 'red', label: 'Red', level: 1, parentId: 'size-1' },
    { id: 'cotton', label: 'Cotton', level: 2, parentId: 'red' },
    { id: 'box', label: 'Box', level: 3, parentId: 'cotton' },
    { id: 'premium', label: 'Premium', level: 4, parentId: 'box' },
    { id: 'ignored', label: 'Ignored', level: 5, parentId: 'premium' },
  ],
}

describe('catalog option trees', () => {
  it('supports exactly five nested option levels', () => {
    const tree = normalizeOptionTree(fiveLevelTree)

    expect(tree.levels).toHaveLength(MAX_OPTION_LEVELS)
    expect(tree.values.map((value) => value.id)).toEqual([
      'size-1',
      'red',
      'cotton',
      'box',
      'premium',
    ])
  })

  it('builds and matches explicit five-level variant paths only', () => {
    const tree = normalizeOptionTree(fiveLevelTree)
    const valueIds = ['size-1', 'red', 'cotton', 'box', 'premium']
    const path = optionPathFromValueIds(tree, valueIds)

    expect(path.map((entry) => entry.value)).toEqual(['Size 1', 'Red', 'Cotton', 'Box', 'Premium'])
    expect(optionPathMatchesValueIds(path, valueIds)).toBe(true)
    expect(optionPathFromValueIds(tree, ['size-1', 'cotton'])).toEqual([])
  })

  it('filters child options by the selected parent value', () => {
    const tree = normalizeOptionTree({
      levels: [
        { id: 'level-1', label: 'Size' },
        { id: 'level-2', label: 'Color' },
      ],
      values: [
        { id: 'size-1', label: 'Size 1', level: 0, parentId: null },
        { id: 'size-2', label: 'Size 2', level: 0, parentId: null },
        { id: 'red', label: 'Red', level: 1, parentId: 'size-1' },
        { id: 'blue', label: 'Blue', level: 1, parentId: 'size-2' },
      ],
    })

    expect(optionValuesForLevel(tree, 1, 'size-1').map((value) => value.label)).toEqual(['Red'])
    expect(optionValuesForLevel(tree, 1, 'size-2').map((value) => value.label)).toEqual(['Blue'])
  })
})
