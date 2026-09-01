import { Controller, Get, Header, NotFoundException, Query, StreamableFile } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { CompanyService } from "./company.service";

/** Unauthenticated — the client portal's login page calls this with the hostname the browser is
 * actually on (window.location.hostname) to fetch branding for a verified custom domain, before
 * the visitor has signed in. Returns a JSON object with `found: false` for anything unregistered
 * (never a bare `null` body — Nest sends that as an empty response, which isn't valid JSON for a
 * caller doing res.json()) so the frontend can fall back to generic Cantero branding without
 * treating it as an error. */
@Controller("public/portal-branding")
export class PublicPortalBrandingController {
  constructor(private readonly service: CompanyService) {}

  @Public()
  @Get()
  @Header("Content-Type", "application/json")
  async get(@Query("domain") domain: string) {
    const branding = await this.service.getPortalBrandingForDomain(domain ?? "");
    return branding ? { found: true as const, ...branding } : { found: false as const };
  }

  @Public()
  @Get("logo")
  async logo(@Query("domain") domain: string) {
    if (!domain) throw new NotFoundException("No logo uploaded");
    const { buffer, mimeType } = await this.service.getPortalLogoForDomain(domain);
    return new StreamableFile(buffer, { type: mimeType });
  }
}
