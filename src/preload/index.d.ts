import { ElectronAPI } from '@electron-toolkit/preload'

type Todo = {
  id: number
  text: string
  description: string
  completed: boolean
}

type TodoAPI = {
  list: () => Promise<Todo[]>
  create: (text: string, description: string) => Promise<Todo>
  createFromWindow: (text: string, description: string) => Promise<Todo>
  openAddWindow: () => Promise<void>
  openDetailWindow: (todo: Todo) => Promise<void>
  closeAddWindow: () => void
  closeDetailWindow: () => void
  onCreated: (listener: (todo: Todo) => void) => () => void
  onShowAddPage: (listener: () => void) => () => void
  onShowDetail: (listener: (todo: Todo) => void) => () => void
  onDeepLink: (listener: (url: string) => void) => () => void
  toggle: (id: number, completed: boolean) => Promise<Todo>
  remove: (id: number) => Promise<{ ok: true }>
  getTodo: (id: number) => Promise<Todo | null>
  getSystemInfo: () => Promise<{
    platform: string
    release: string
    version: string
    arch: string
    cpuCount: number
    cpuModel: string
    cpuSpeedMHz: number
    totalMemBytes: number
    freeMemBytes: number
    hostname: string
    uptimeSeconds: number
  }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    todoAPI: TodoAPI
  }
}
