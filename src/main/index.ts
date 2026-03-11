import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createTodo,
  initDatabase,
  listTodos,
  removeTodo,
  updateTodoCompleted,
} from '../database/database';
import {autoUpdater} from 'electron-updater';

let mainWindow: BrowserWindow | null = null
let addWindow: BrowserWindow | null = null

function loadWindow(window: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'))
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true
    },
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadWindow(window)
  return window
}

function createAddWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 260,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: !!mainWindow,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  window.on('closed', () => {
    addWindow = null
  })

  window.webContents.on('did-finish-load', () => {
    window.webContents.send('todos:show-add-page')
    window.show()
  })

  loadWindow(window)
  return window
}

function registerTodoIpc(): void {
  ipcMain.handle('todos:list', () => listTodos())

  ipcMain.handle('todos:create', (_event, text: string) => createTodo(text))

  ipcMain.handle('todos:create-from-window', (_event, text: string) => {
    const todo = createTodo(text)
    mainWindow?.webContents.send('todos:created', todo)
    return todo
  })

  ipcMain.handle('todos:toggle', (_event, id: number, completed: boolean) =>
    updateTodoCompleted(id, completed),
  )

  ipcMain.handle('todos:delete', (_event, id: number) => {
    removeTodo(id)
    return { ok: true }
  })

  ipcMain.handle('todos:open-add-window', () => {
    if (addWindow && !addWindow.isDestroyed()) {
      addWindow.focus()
      return
    }

    addWindow = createAddWindow()
  })

  ipcMain.on('todos:add-window-close', () => {
    if (addWindow && !addWindow.isDestroyed()) {
      addWindow.close()
    }
  })
}

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerTodoIpc()
  mainWindow = createMainWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

autoUpdater.on('update-available', () => {
  console.log('Update available');
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});
