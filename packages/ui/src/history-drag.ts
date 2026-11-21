import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from 'react'
import type { HistoryMove } from './types'

const holdMs = 350
const movementTolerance = 8
const edgeSize = 32

interface Press {
  pointer: number
  button: HTMLButtonElement
  card: HTMLElement
  id: number
  pinned: boolean
  startX: number
  startY: number
  x: number
  y: number
  drag?: {
    top: number
    height: number
    scrollTop: number
    siblings: HTMLElement[]
    index: number
  }
}

export function useHistoryDrag(
  list: RefObject<HTMLDivElement | null>,
  scope: string,
  enabled: boolean,
  onMove: (move: HistoryMove) => void,
  onGrab: (id: number) => void,
  onCancel: () => void,
) {
  const move = useEffectEvent(onMove)
  const grab = useEffectEvent(onGrab)
  const announceCancellation = useEffectEvent(onCancel)
  const canStart = useEffectEvent(() => enabled)
  const cancelPress = useRef<() => void>(null)

  useLayoutEffect(() => {
    if (!list.current) return
    const element = list.current
    let press: Press | undefined
    let hold = 0
    let frame = 0
    let marker: HTMLElement | undefined
    let lastFrame = 0
    let suppressClick = false

    function clearMarker() {
      marker?.removeAttribute('data-drop')
      marker = undefined
    }

    function finish() {
      const current = press
      if (!current) return
      press = undefined
      window.clearTimeout(hold)
      window.cancelAnimationFrame(frame)
      clearMarker()
      current.card.style.removeProperty('translate')
      current.card.removeAttribute('data-dragging')
      element.removeAttribute('data-dragging')
      if (current.button.hasPointerCapture(current.pointer)) current.button.releasePointerCapture(current.pointer)
    }

    function destination(current: Press, bounds: DOMRect) {
      const { drag, x, y } = current
      if (!drag || x < bounds.left || x > bounds.right) return
      let index = 0
      let end = drag.siblings.length
      while (index < end) {
        const middle = Math.floor((index + end) / 2)
        const { top, height } = drag.siblings[middle].getBoundingClientRect()
        if (y < top + height / 2) end = middle
        else index = middle + 1
      }
      if (index === drag.index) return
      return index < drag.index
        ? { card: drag.siblings[index], position: 'before' as const }
        : { card: drag.siblings[index - 1], position: 'after' as const }
    }

    function update(now: number) {
      const current = press
      if (!current?.drag) return
      const { drag, x, y } = current
      const bounds = element.getBoundingClientRect()
      if (Math.hypot(x - current.startX, y - current.startY) >= 4) {
        if (x >= bounds.left && x <= bounds.right) {
          const edge = Math.min(edgeSize, bounds.height / 3)
          const distance = Math.min(0, y - bounds.top - edge) + Math.max(0, y - bounds.bottom + edge)
          const speed = Math.max(-1, Math.min(1, distance / edge)) * 700
          if (speed) element.scrollTop += speed * Math.min(now - lastFrame, 32) / 1000
        }
        const top = Math.max(bounds.top, Math.min(drag.top + y - current.startY, bounds.bottom - drag.height))
        current.card.style.translate = `0 ${top - drag.top + element.scrollTop - drag.scrollTop}px`
      }
      const target = destination(current, bounds)
      if (marker !== target?.card) {
        clearMarker()
        marker = target?.card
        if (marker && target) marker.setAttribute('data-drop', target.position)
      }
      lastFrame = now
      frame = window.requestAnimationFrame(update)
    }

    function onDown(event: PointerEvent) {
      if (press || !event.isPrimary || event.button !== 0) return
      suppressClick = false
      const button = (event.target as Element).closest<HTMLButtonElement>('.clip-main:enabled')
      const card = button?.closest<HTMLElement>('.clip-card')
      if (!canStart() || !button || !card) return
      const pinned = card.hasAttribute('data-pinned')
      const current: Press = {
        pointer: event.pointerId, button, card, id: Number(card.dataset.clipId), pinned,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      }
      press = current
      button.setPointerCapture(event.pointerId)
      hold = window.setTimeout(() => {
        suppressClick = true
        if (!button.hasAttribute('data-reorderable')) return
        const group = Array.from(element.querySelectorAll<HTMLElement>('.clip-card')).filter((item) => item.hasAttribute('data-pinned') === pinned)
        const { top, height } = card.getBoundingClientRect()
        current.drag = { top, height, scrollTop: element.scrollTop, siblings: group.filter((item) => item !== card), index: group.indexOf(card) }
        current.startX = current.x
        current.startY = current.y
        card.setAttribute('data-dragging', '')
        element.setAttribute('data-dragging', '')
        grab(current.id)
        lastFrame = performance.now()
        frame = window.requestAnimationFrame(update)
      }, holdMs)
    }

    function onMovePointer(event: PointerEvent) {
      if (press?.pointer !== event.pointerId) return
      press.x = event.clientX
      press.y = event.clientY
      if (!press.drag && Math.hypot(press.x - press.startX, press.y - press.startY) > movementTolerance) {
        cancel()
      }
    }

    function onUp(event: PointerEvent) {
      const current = press
      if (current?.pointer !== event.pointerId) return
      const bounds = element.getBoundingClientRect()
      current.x = event.clientX
      current.y = event.clientY
      const target = current.y >= bounds.top && current.y <= bounds.bottom ? destination(current, bounds) : undefined
      finish()
      if (target) move({ type: 'move', id: current.id, anchor: Number(target.card.dataset.clipId), position: target.position, pinned: current.pinned })
      else if (current.drag) announceCancellation()
    }

    function cancel() {
      if (!press) return
      const dragging = Boolean(press.drag)
      suppressClick = true
      finish()
      if (dragging) announceCancellation()
    }

    function onCancelPointer(event: PointerEvent) {
      if (press?.pointer === event.pointerId) cancel()
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing || !press) return
      const card = press.drag ? press.card : undefined
      if (card) event.preventDefault()
      cancel()
      card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    element.addEventListener('pointerdown', onDown, options)
    element.addEventListener('pointermove', onMovePointer, options)
    element.addEventListener('pointerup', onUp, options)
    element.addEventListener('pointercancel', onCancelPointer, options)
    element.addEventListener('lostpointercapture', onCancelPointer, options)
    element.addEventListener('click', (event) => {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.stopPropagation()
      event.preventDefault()
    }, { ...options, capture: true })
    // A swipe can scroll normally. Once the hold activates, keep the same touch for dragging.
    element.addEventListener('touchmove', (event) => {
      if (event.touches.length > 1) cancel()
      else if (press?.drag && event.cancelable) event.preventDefault()
    }, { ...options, passive: false })
    element.addEventListener('contextmenu', (event) => {
      if (press) event.preventDefault()
    }, options)
    window.addEventListener('keydown', onKey, { ...options, capture: true })
    window.addEventListener('blur', cancel, options)
    document.addEventListener('visibilitychange', cancel, options)
    cancelPress.current = cancel
    return () => { finish(); listeners.abort(); cancelPress.current = null }
  }, [list])

  useLayoutEffect(() => { cancelPress.current?.() }, [enabled, scope])
}
