/**
 * Detects whether the app is running as an installed PWA / WebSpatial app
 * (i.e. in the PICO emulator after "Run as standalone app") vs. a regular
 * desktop browser tab.
 *
 * When running as standalone, we:
 *   - Add the `is-spatial` class to <html> so WebSpatial CSS applies
 *   - Open transcript history as a separate WebSpatial scene
 *
 * When running in a regular browser:
 *   - Show a dark background
 *   - Render mic button + history inline on one page
 */
export const isXRMode = window.matchMedia("(display-mode: standalone)").matches;
