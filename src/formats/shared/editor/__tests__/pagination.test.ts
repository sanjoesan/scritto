import { computePageBreakIndices, computePageCount } from '../pagination'

describe('computePageBreakIndices', () => {
  it('returns no breaks when everything fits on one page', () => {
    expect(computePageBreakIndices([100, 100, 100], 1000)).toEqual([])
  })

  it('breaks before the block that would overflow the page', () => {
    // page height 300: [100, 100, 100] fits exactly, the 4th block (150) overflows
    expect(computePageBreakIndices([100, 100, 100, 150], 300)).toEqual([3])
  })

  it('resets the running total after each break', () => {
    expect(computePageBreakIndices([200, 200, 200, 200], 300)).toEqual([1, 2, 3])
  })

  it('never breaks before the very first block', () => {
    expect(computePageBreakIndices([5000], 300)).toEqual([])
  })

  it('lets an oversized single block overflow its own page rather than splitting it, then starts fresh', () => {
    // block 1 (5000) alone already overflows page height 300, so it gets its own
    // (overflowing) page; the trailing block starts a clean page after it rather
    // than being appended onto the already-overflowing one.
    expect(computePageBreakIndices([100, 5000, 100], 300)).toEqual([1, 2])
  })

  it('handles an empty block list', () => {
    expect(computePageBreakIndices([], 300)).toEqual([])
  })

  it('treats an exact fit as not overflowing', () => {
    expect(computePageBreakIndices([150, 150], 300)).toEqual([])
  })

  it('returns no breaks for a non-positive page height', () => {
    expect(computePageBreakIndices([100, 100], 0)).toEqual([])
    expect(computePageBreakIndices([100, 100], -10)).toEqual([])
  })
})

describe('computePageCount', () => {
  it('is one more than the number of breaks', () => {
    expect(computePageCount([100, 100, 100], 1000)).toBe(1)
    expect(computePageCount([200, 200, 200, 200], 300)).toBe(4)
  })

  it('is always at least 1, even for an empty document', () => {
    expect(computePageCount([], 300)).toBe(1)
  })
})
