import type { UpdateController, UpdateSnapshot } from '@simple-copy/ui/types'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { desktop } from './native'

export function useUpdates(flushSettings: () => Promise<boolean>): UpdateController {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null)
  const [error, setError] = useState<UpdateController['error']>(null)
  const [busy, setBusy] = useState(false)
  const current = useRef<UpdateSnapshot | null>(null)
  const running = useRef(false)
  const receive = useCallback((next: UpdateSnapshot) => {
    if (!current.current || next.revision >= current.current.revision) {
      current.current = next
      setSnapshot(next)
      setError(null)
    }
  }, [])

  useEffect(() => {
    if (!desktop) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<UpdateSnapshot>('update-state', ({ payload }) => { if (!disposed) receive(payload) })
      .then(async (stop) => {
        if (disposed) { stop(); return }
        unlisten = stop
        const initial = await invoke<UpdateSnapshot>('update_snapshot')
        if (!disposed) receive(initial)
      }).catch(() => { if (!disposed && !current.current) setError('connectionFailed') })
    return () => { disposed = true; unlisten?.() }
  }, [receive])

  async function run(command: 'check_for_updates' | 'install_update') {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      if (command === 'install_update' && !await flushSettings()) return
      receive(await invoke<UpdateSnapshot>(command))
    } catch {
      setError('connectionFailed')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return { snapshot, busy, error, check: () => run('check_for_updates'), install: () => run('install_update') }
}
