import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

contextBridge.exposeInMainWorld('todoAPI', {
  list() {
    return ipcRenderer.invoke('todos:list')
  },
  create(text: string) {
    return ipcRenderer.invoke('todos:create', text)
  },
  createFromWindow(text: string) {
    return ipcRenderer.invoke('todos:create-from-window', text)
  },
  openAddWindow() {
    return ipcRenderer.invoke('todos:open-add-window')
  },
  closeAddWindow() {
    ipcRenderer.send('todos:add-window-close')
  },
  onCreated(listener: (todo: { id: number; text: string; completed: boolean }) => void) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, todo: { id: number; text: string; completed: boolean }) => {
      listener(todo)
    }
    ipcRenderer.on('todos:created', wrappedListener)
    return () => ipcRenderer.off('todos:created', wrappedListener)
  },
  onShowAddPage(listener: () => void) {
    const wrappedListener = () => {
      listener()
    }
    ipcRenderer.on('todos:show-add-page', wrappedListener)
    return () => ipcRenderer.off('todos:show-add-page', wrappedListener)
  },
  toggle(id: number, completed: boolean) {
    return ipcRenderer.invoke('todos:toggle', id, completed)
  },
  remove(id: number) {
    return ipcRenderer.invoke('todos:delete', id)
  },
})