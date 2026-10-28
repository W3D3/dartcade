/** No mouse cursor anywhere while a big screen page is open: the reused match components set their own (pointer, crosshair). */
export function hideCursor(): () => void {
  const style = document.createElement('style')
  style.textContent = '*, html, body { cursor: none !important; }'
  document.head.append(style)
  return () => style.remove()
}
