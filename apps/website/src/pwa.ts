// Register once, from the host page. The demonstration iframe shares its scope.
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  const register = async () => {
    try {
      const base = new URL(import.meta.env.BASE_URL, location.href)
      await navigator.serviceWorker.register(new URL('sw.js', base), {
        scope: base.pathname, updateViaCache: 'none',
      })
    } catch (error) {
      console.warn('Simple Copy offline support could not start. The website remains available online.', error)
    }
  }
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => { void register() }, { once: true })
}
