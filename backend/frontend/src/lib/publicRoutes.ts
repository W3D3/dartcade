// Pages a signed-out visitor may open: sign-in, sign-up and their mails' landing pages, the legal texts.

const PUBLIC = /^#\/(login|register|verify|forgot|reset|terms|privacy|imprint)(?:[/?]|$)/

export const isPublicRoute = (hash: string): boolean => PUBLIC.test(hash)
