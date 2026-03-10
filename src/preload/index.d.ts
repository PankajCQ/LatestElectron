import { ElectronAPI } from '@electron-toolkit/preload'

type Todo = {
  id: number
  text: string
  completed: boolean
}

type TodoAPI = {
  list: () => Promise<Todo[]>
  create: (text: string) => Promise<Todo>
  createFromWindow: (text: string) => Promise<Todo>
  openAddWindow: () => Promise<void>
  closeAddWindow: () => void
  onCreated: (listener: (todo: Todo) => void) => () => void
  onShowAddPage: (listener: () => void) => () => void
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
