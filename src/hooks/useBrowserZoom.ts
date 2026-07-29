import { useEffect } from 'react'

/**
 * Turns off the browser's own page zoom for the whole app.
 *
 * The app is a fixed viewport-sized layout with its own zoom on the canvas.
 * A page zoom — a pinch on the toolbar, a trackpad pinch, Ctrl/Cmd + wheel —
 * scales the chrome as well and leaves the user in a state the app cannot see
 * or undo, so every route into it is blocked:
 *
 * - `touch-action` in CSS and `user-scalable=no` in the viewport meta tag stop
 *   pinch and double-tap zoom in Chrome/Android.
 * - Safari (iOS and macOS) needs its proprietary `gesture*` events prevented.
 * - A trackpad pinch reaches the page as a wheel event with `ctrlKey` set.
 * - Very old iOS ignores `touch-action`, so a second finger is stopped by
 *   preventing the multi-touch `touchmove` default.
 *
 * The canvas keeps its own handlers: it turns the same gestures into canvas
 * zoom instead of page zoom.
 */
export function useBrowserZoom() {
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault()

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault()
    }

    document.addEventListener('gesturestart', preventGesture, { passive: false })
    document.addEventListener('gesturechange', preventGesture, { passive: false })
    document.addEventListener('gestureend', preventGesture, { passive: false })
    window.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('gestureend', preventGesture)
      window.removeEventListener('wheel', onWheel)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [])
}
