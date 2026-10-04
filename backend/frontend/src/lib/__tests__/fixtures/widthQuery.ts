/** Whether a width-only media query ("(min-width: 768px) and (max-width: 1279.98px)") matches a viewport `width` px wide. */
export function matchesAt(query: string, width: number): boolean {
  return query.split(' and ').every(part => {
    const m = /^\((min|max)-width: ([\d.]+)px\)$/.exec(part.trim())
    if (!m) throw new Error(`not a width query: ${part}`)
    return m[1] === 'min' ? width >= Number(m[2]) : width <= Number(m[2])
  })
}
