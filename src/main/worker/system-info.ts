import os from 'os'
import { parentPort } from 'worker_threads'

export type SystemInfo = {
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
}

function getSystemInfo(): SystemInfo {
  const cpus = os.cpus()
  const firstCpu = cpus[0]

  return {
    platform: os.platform(),
    release: os.release(),
    version: typeof os.version === 'function' ? os.version() : '',
    arch: os.arch(),
    cpuCount: cpus.length,
    cpuModel: firstCpu?.model ?? 'unknown',
    cpuSpeedMHz: firstCpu?.speed ?? 0,
    totalMemBytes: os.totalmem(),
    freeMemBytes: os.freemem(),
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
  }
}

if (parentPort) {
  const payload = getSystemInfo()
  parentPort.postMessage(payload)

  parentPort.on('message', (message) => {
    if (message === 'get') {
      parentPort?.postMessage(getSystemInfo())
    }
  })
}
