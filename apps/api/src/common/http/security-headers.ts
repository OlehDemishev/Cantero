import type { NextFunction, Request, Response } from "express";

/**
 * Security headers for every API response. The API only serves JSON and files the web app fetches
 * (never pages meant to be framed or scripted), so it can be as strict as possible: nothing may load
 * from a response, frame it, or sniff it into another type. The one exception is the Swagger page
 * for the public API (`/api/docs`), which runs its own scripts and styles.
 */
export function securityHeaders(options: { production: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (!req.path.startsWith("/api/docs")) res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    // Only over HTTPS, i.e. in production behind Caddy: browsers ignore it on plain http anyway.
    if (options.production) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  };
}
