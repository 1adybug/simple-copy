import { t } from '@simple-copy/i18n'
import { invoke } from '@tauri-apps/api/core'
import { Image } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type ObserveThumbnail = (element: HTMLElement, onVisible: (visible: boolean) => void) => () => void

// One observer per history list, rather than one observer or eager IPC call per image.
export function useThumbnailVisibility(root: RefObject<HTMLElement | null>): ObserveThumbnail {
  const observer = useRef<IntersectionObserver | null>(null)
  const listeners = useRef(new Map<Element, (visible: boolean) => void>())

  useEffect(() => () => {
    observer.current?.disconnect()
    observer.current = null
    listeners.current.clear()
  }, [])

  return useCallback((element, onVisible) => {
    observer.current ??= new IntersectionObserver((entries) => {
      for (const entry of entries) listeners.current.get(entry.target)?.(entry.isIntersecting)
    }, { root: root.current, rootMargin: '160px 0px' })
    listeners.current.set(element, onVisible)
    observer.current.observe(element)
    return () => {
      observer.current?.unobserve(element)
      listeners.current.delete(element)
    }
  }, [root])
}

export function ClipImage({ id, observe }: { id: number; observe: ObserveThumbnail }) {
  const frame = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (frame.current) return observe(frame.current, setVisible)
  }, [observe])

  return <span ref={frame} className="clip-image-frame">
    {visible ? <Thumbnail key={id} id={id} /> : <Placeholder message={t('imagePreview')} />}
  </span>
}

function Placeholder({ message }: { message: string }) {
  return <span className="image-placeholder"><Image size={22} aria-hidden="true" />{message}</span>
}

function Thumbnail({ id }: { id: number }) {
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void invoke<ArrayBuffer>('clipboard_thumbnail', { id }).then((bytes) => {
      if (disposed) return
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
      setSource(objectUrl)
    }).catch(() => { if (!disposed) setFailed(true) })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])

  return failed ? <Placeholder message={t('imageUnavailable')} />
    : source ? <img className="clip-image" src={source} alt={t('imageAlt')} draggable={false} decoding="async" onError={() => setFailed(true)} />
      : <Placeholder message={t('imageLoading')} />
}
