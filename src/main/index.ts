import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import fs from 'fs'
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
import { spawn } from "child_process";
import { Worker } from 'worker_threads'
import { SystemInfo } from './worker/system-info'
import crypto from 'crypto';
import os from 'os'

const PROTOCOL = 'latestElectron'

let mainWindow: BrowserWindow | null = null
let addWindow: BrowserWindow | null = null
let detailWindow: BrowserWindow | null = null
let systemInfoWorker: Worker | null = null
let lastSystemInfo: SystemInfo | null = null

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

function startSystemInfoWorker(): void {
  if (systemInfoWorker) return;
  const builtWorkerPath = join(__dirname, "worker", "system-info.js");
  const devWorkerPath = join(process.cwd(), "src", "main", "worker", "system-info.ts");
  const workerPath = app.isPackaged
    ? builtWorkerPath
    : (fs.existsSync(builtWorkerPath) ? builtWorkerPath : devWorkerPath);
  if (!fs.existsSync(workerPath)) {
    console.error('System info worker not found:', workerPath)
    return
  }

  const worker = new Worker(workerPath)
  systemInfoWorker = worker

  worker.on('message', (info) => {
    console.log('System info from worker:', info);
    lastSystemInfo = info as SystemInfo;
  })

  worker.on('error', (error) => {
    console.error('System info worker error:', error);
  })

  worker.on('exit', (code) => {
    console.log('System info worker exited with code:', code);
    systemInfoWorker = null;
  })
}

function getSystemInfoFromWorker(): Promise<SystemInfo> {
  if (!systemInfoWorker) {
    startSystemInfoWorker();
  }

  const worker = systemInfoWorker;
  if (!worker) {
    return Promise.reject(new Error('System info worker is not available'))
  }

  return new Promise((resolve, reject) => {
    const onMessage = (info: SystemInfo) => {
      cleanup()
      resolve(info)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onExit = (code: number) => {
      cleanup()
      if (code !== 0) {
        reject(new Error(`System info worker exited with code: ${code}`))
      } else if (lastSystemInfo) {
        resolve(lastSystemInfo)
      }
    }

    const cleanup = () => {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
    }

    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    worker.postMessage('get')
  })
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
  ipcMain.handle('get-system-info', () => {
    return getSystemInfoFromWorker()
  })
}

function runfzfBinary(): void {
  const fzfBinaryName = process.platform === 'win32' ? 'fzf.exe' : 'fzf'
  const packagedPath = join(process.resourcesPath, 'binaries', fzfBinaryName)
  const devRoot = resolve(app.getAppPath(), '..', '..')
  const devPath = join(devRoot, 'binaries', fzfBinaryName)
  const fzfPath = app.isPackaged
    ? packagedPath
    : (fs.existsSync(devPath) ? devPath : join(process.cwd(), 'binaries', fzfBinaryName))

  if (!fs.existsSync(fzfPath)) {
    console.error('fzf binary not found:', fzfPath)
    return
  }

  const sampleItems = ['alpha', 'beta', 'gamma', 'delta']
  const fzfArgs = ['--filter', 'beta']

  console.log('Running fzf binary with args:', fzfArgs.join(' '))

  const child = spawn(fzfPath, fzfArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

  child.stdout.on('data', (data) => {
    console.log('fzf stdout:', data.toString())
  })

  child.stderr.on('data', (data) => {
    console.error('fzf stderr:', data.toString())
  })

  child.on('error', (error) => {
    console.error('Error running fzf:', error)
  })

  child.on('close', (code) => {
    console.log('fzf exited with code:', code)
  })

  child.stdin.write(sampleItems.join('\n'))
  child.stdin.end()
}

function checkVM(): void {
  const vmBinaryName = process.platform === 'win32' ? 'vm-check.exe' : 'vm-check'
  const packagedSourcePath = join(app.getAppPath(), 'binaries', 'vm-detect', vmBinaryName)
  const devRoot = join(app.getAppPath());
  const devSourcePath = join(devRoot, 'binaries', 'vm-detect', vmBinaryName)

  const sourcePath = app.isPackaged
    ? packagedSourcePath
    : (fs.existsSync(devSourcePath) ? devSourcePath : join(process.cwd(), 'binaries', 'vm-detect', vmBinaryName))

  if (!fs.existsSync(sourcePath)) {
    console.error('vm-check binary not found:', sourcePath)
    const logDir = join(app.getPath('userData'), 'logs')
    const logPath = join(logDir, 'vm-check.log')
    try {
      fs.mkdirSync(logDir, { recursive: true })
      const line = [
        new Date().toISOString(),
        'error=vm-check-binary-not-found',
        `path=${sourcePath}`,
      ].join(' ') + os.EOL
      fs.appendFileSync(logPath, line)
    } catch (error) {
      console.error('Failed to write vm-check log:', error)
    }
    return
  }

  let execPath = sourcePath
  if (app.isPackaged) {
    const extractDir = join(app.getPath('userData'), 'bin')
    fs.mkdirSync(extractDir, { recursive: true })
    execPath = join(extractDir, vmBinaryName)
    try {
      if (!fs.existsSync(execPath)) {
        fs.copyFileSync(sourcePath, execPath)
      }
      if (process.platform !== 'win32') {
        fs.chmodSync(execPath, 0o755)
      }
    } catch (error) {
      console.error('Failed to extract vm-check:', error)
      return
    }
  }

  const challenge = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`
  console.log('Running vm-check binary from path:', execPath)
  const child = spawn(execPath, [challenge], { stdio: ['ignore', 'pipe', 'pipe'] })

  let stdout = ''
  child.stdout.on('data', (data) => {
    stdout += data.toString()
  })

  child.stderr.on('data', (data) => {
    console.error('vm-check stderr:', data.toString())
  })

  child.on('error', (error) => {
    console.error('Error running vm-check:', error)
  })

  child.on('close', (code) => {
    const output = stdout.trim()
    const parts = output.split(':')
    const response = parts[0] ?? ''
    const isVm = parts[1] === '1'

    console.log('vm-check stdout:', parts)

    const expected = crypto
    .createHash("sha256")
    .update(challenge + "INTERNAL_SECRET")
    .digest("hex");

    console.log('expected response:', expected, 'actual response:', response);
    console.log('vm-check exited with code:', code);
    console.log('vm-check response:', response);

    const logDir = join(app.getPath('userData'), 'logs')
    const logPath = join(logDir, 'vm-check.log')
    try {
      fs.mkdirSync(logDir, { recursive: true })
      const line = [
        new Date().toISOString(),
        `code=${code}`,
        `isVm=${isVm ? '1' : '0'}`,
        `response=${parts}`,
      ].join(' ') + os.EOL
      fs.appendFileSync(logPath, line);
      console.log('vm-check log written to:', logPath)
    } catch (error) {
      console.error('Failed to write vm-check log:', error)
    }

    dialog.showMessageBox({
      type: isVm ? 'warning' : 'info',
      title: 'VM Check',
      message: isVm ? 'Virtual machine detected.' : 'No virtual machine detected.',
      detail: `Response: ${response}`,
    })
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

    initDatabase();
    registerTodoIpc();
    mainWindow = createMainWindow();

    const initialDeepLink = getDeepLinkFromArgv(process.argv)
    if (initialDeepLink) {
      handleDeepLink(initialDeepLink)
    }

    checkVM()
    runfzfBinary();

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
