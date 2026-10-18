/** One step of a breadcrumb trail. The last item is the current page: always a span, never a
 *  link, even if it carries an href. `onclick` lets a page intercept the click (e.g. to confirm
 *  discarding unsaved changes) instead of navigating straight through the href. */
export type BreadcrumbItem = { label: string; href?: string; onclick?: (e: MouseEvent) => void }
