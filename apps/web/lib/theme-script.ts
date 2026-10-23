/** localStorage key holding the person's explicit pick ("light" | "dark"); absent means "system". */
export const THEME_STORAGE_KEY = "theme";

/**
 * Runs from <head> before the first paint (app/layout.tsx) and sets the `dark` class the same way
 * ThemeProvider will, so a dark-mode user never sees a white frame while React loads. Kept in a
 * plain module (not ThemeContext.tsx): a "use client" file's exports reach a server component as
 * client references, not as this string. Allowed by the CSP's script-src 'unsafe-inline'.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
