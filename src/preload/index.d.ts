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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    todoAPI: TodoAPI
  }
}
