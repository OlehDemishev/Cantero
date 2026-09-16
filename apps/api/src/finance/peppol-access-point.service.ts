import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Scaffold for actually transmitting a Peppol BIS Billing 3.0 invoice over the Peppol network —
 * distinct from generating the XML (see peppol.ts/InvoicesService.generatePeppolBisXml), which
 * this app already does. Real transmission requires a contracted Access Point provider (Storecove,
 * Basware, ...), which isn't something this environment has access to, so today there's exactly
 * one "provider" (the unset default), and it fails fast with an explanation rather than pretending
 * to send anything — same pattern as AccountingSyncService.getAuthorizeUrl's unset-client-ID
 * check. Wiring a real provider later means adding one entry to a small map here and implementing
 * its submit call, not touching the controller/frontend that already call this service.
 */
@Injectable()
export class PeppolAccessPointService {
  constructor(private readonly config: ConfigService) {}

  async sendInvoice(xml: string, filename: string): Promise<void> {
    const provider = this.config.get<string>("PEPPOL_AP_PROVIDER") ?? "none";
    if (provider === "none") {
      throw new BadRequestException(
        "Peppol network sending isn't configured on this server (PEPPOL_AP_PROVIDER is unset) — this only generates the BIS Billing 3.0 XML file. Actually transmitting it over the Peppol network requires contracting a real Access Point provider (e.g. Storecove, Basware) and implementing its submit call here.",
      );
    }
    throw new Error(`Unknown PEPPOL_AP_PROVIDER "${provider}"`);
  }
}
