export const DEFAULT_FROM = '// @docs-begin'
export const DEFAULT_TO = '// @docs-end'

export function extractSlice(
  source: string,
  markerFrom: string | undefined,
  markerTo: string | undefined,
): string {
  if (!markerFrom && !markerTo) {
    if (source.includes(DEFAULT_FROM) && source.includes(DEFAULT_TO)) {
      return extractSlice(source, DEFAULT_FROM, DEFAULT_TO)
    }
    return source.trim()
  }

  if ((markerFrom && !markerTo) || (!markerFrom && markerTo)) {
    throw new Error(
      `Snippet.astro: both 'from' and 'to' must be provided, got from=${JSON.stringify(markerFrom)} to=${JSON.stringify(markerTo)}`,
    )
  }

  const fromStr = markerFrom!
  const toStr = markerTo!

  const fromCount = source.split(fromStr).length - 1
  const toCount = source.split(toStr).length - 1
  if (fromCount !== 1) {
    throw new Error(`Snippet.astro: expected exactly one '${fromStr}' marker, found ${fromCount}`)
  }
  if (toCount !== 1) {
    throw new Error(`Snippet.astro: expected exactly one '${toStr}' marker, found ${toCount}`)
  }

  const lines = source.split('\n')
  const fromLine = lines.findIndex((l) => l.includes(fromStr))
  const toLine = lines.findIndex((l, i) => i > fromLine && l.includes(toStr))

  if (toLine <= fromLine) {
    throw new Error(
      `Snippet.astro: '${toStr}' must appear after '${fromStr}' (from=${fromLine}, to=${toLine})`,
    )
  }

  const sliceLines = lines.slice(fromLine + 1, toLine)
  const nonEmpty = sliceLines.filter((l) => l.trim().length > 0)
  const minIndent = nonEmpty.length
    ? Math.min(...nonEmpty.map((l) => l.match(/^ */)![0].length))
    : 0
  const dedented = sliceLines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l))
  return dedented.join('\n').trim()
}
