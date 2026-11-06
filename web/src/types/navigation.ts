export type AppView = 'aliases' | 'messages' | 'blocked' | 'account'

export interface AppRoute {
  view: AppView
  aliasId: string | null
}
