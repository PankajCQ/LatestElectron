import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createTodo,
  initDatabase,
  listTodos,
  removeTodo,
  updateTodoCompleted,
  getTodo,
} from '../database/database';
import {autoUpdater} from 'electron-updater';

const PROTOCOL = 'latestElectron'

let mainWindow: BrowserWindow | null = null
let addWindow: BrowserWindow | null = null
let detailWindow: BrowserWindow | null = null

function loadWindow(window: BrowserWindow, route?: string): void {
  const hash = route ? `#${route}` : '';
  console.log('Loading window with route:', route, hash);
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash}`)
    return
  }

  if (route) {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'))
}

function getDeepLinkFromArgv(argv: string[]): string | null {
  const prefix = `${PROTOCOL}://`
  return argv.find((arg) => arg.startsWith(prefix)) ?? null
}

function getRouteFromDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const path = parsed.pathname.replace(/^\/+/, '')
    const parts = [host, path].filter(Boolean)
    if (parts.length === 0) return null
    return `/${parts.join('/')}`
  } catch {
    return null
  }
}

function handleDeepLink(url: string): void {
  const route = getRouteFromDeepLink(url)
  console.log('Handling deep link:', url, route);
  if (route) {
    if (detailWindow && !detailWindow.isDestroyed()) {
      loadWindow(detailWindow, route)
      detailWindow.focus()
      return
    }

    detailWindow = createDetailWindow({ route })
    return
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
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

function createDetailWindow(options: {
  todo?: { id: number; text: string; description: string; completed: boolean }
  route?: string
}): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 360,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true
    },
  })

  window.on('closed', () => {
    detailWindow = null
  })

  window.webContents.on('did-finish-load', () => {
    if (options.todo) {
      window.webContents.send('todos:show-detail', options.todo)
    }
    window.show()
  })
  console.log('Loading detail window with options:', options);

  loadWindow(window, options.route)
  return window
}

function registerTodoIpc(): void {
  ipcMain.handle('todos:list', () => listTodos())

  ipcMain.handle('todos:create', (_event, text: string, description: string) =>
    createTodo(text, description),
  )

  ipcMain.handle('todos:create-from-window', (_event, text: string, description: string) => {
    const todo = createTodo(text, description)
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

  ipcMain.handle(
    'todos:open-detail-window',
    (_event, todo: { id: number; text: string; description: string; completed: boolean }) => {
      if (detailWindow && !detailWindow.isDestroyed()) {
        detailWindow.webContents.send('todos:show-detail', todo)
        detailWindow.focus()
        return
      }

      detailWindow = createDetailWindow({ todo })
    },
  )

  ipcMain.on('todos:add-window-close', () => {
    if (addWindow && !addWindow.isDestroyed()) {
      addWindow.close()
    }
  })

  ipcMain.on('todos:detail-window-close', () => {
    if (detailWindow && !detailWindow.isDestroyed()) {
      detailWindow.close()
    }
  })
  ipcMain.handle('todos:get', (_event, id: number) => {
    return getTodo(id)
  })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = getDeepLinkFromArgv(commandLine)
    if (deepLink) {
      handleDeepLink(deepLink)
      return
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    autoUpdater.checkForUpdatesAndNotify()
    electronApp.setAppUserModelId('com.electron')

    if (process.defaultApp && process.platform === 'win32') {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initDatabase()
    registerTodoIpc()
    mainWindow = createMainWindow()

    const initialDeepLink = getDeepLinkFromArgv(process.argv)
    if (initialDeepLink) {
      handleDeepLink(initialDeepLink)
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
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
