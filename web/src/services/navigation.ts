export type AppView = 'aliases' | 'messages' | 'blocked' | 'account'

export interface AppRoute {
  view: AppView
  aliasId: string | null
}

const ALIAS_MESSAGES_PATTERN = /^\/app\/aliases\/([^/]+)\/?$/

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    window.history.replaceState({}, '', to)
  } else {
    window.history.pushState({}, '', to)
  }

  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function readAppRoute(pathname: string): AppRoute {
  const aliasMatch = pathname.match(ALIAS_MESSAGES_PATTERN)
  if (aliasMatch) {
    return { view: 'messages', aliasId: decodeURIComponent(aliasMatch[1]) }
  }

  if (/^\/app\/blocked\/?$/.test(pathname)) {
    return { view: 'blocked', aliasId: null }
  }

  if (/^\/app\/account\/?$/.test(pathname)) {
    return { view: 'account', aliasId: null }
  }

  return { view: 'aliases', aliasId: null }
}
