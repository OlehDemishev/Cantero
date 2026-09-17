import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const BODY_DE = `Diese Verfahrensdokumentation beschreibt, wie Cantero die GoBD-Anforderungen an die \
Unveränderbarkeit gebuchter Belege (Festschreibung) und an einen nachvollziehbaren, \
manipulationssicheren Beleg-Nachweis technisch umsetzt. Sie ersetzt keine steuerliche Beratung \
und keine vollständige Verfahrensdokumentation im Sinne der GoBD (Rz. 151 ff.) — sie beschreibt \
ausschließlich die in dieser Software umgesetzten technischen Kontrollen. Bitte prüfen und \
ergänzen Sie diese Dokumentation gemeinsam mit Ihrem Steuerberater um die organisatorischen \
Abschnitte (Zugriffsberechtigungen, Backup- und Aufbewahrungsprozesse, Verantwortlichkeiten).

1. FESTSCHREIBUNG — WANN EIN BELEG GESPERRT WIRD

Ausgangsrechnungen (Invoice) werden gesperrt, sobald sie versendet werden (Status "sent"). Ab \
diesem Zeitpunkt wird das Feld "lockedAt" gesetzt und im System dauerhaft dokumentiert. Danach \
lässt sich an der Rechnung — auch über die schmale, bisher einzige Änderungsmöglichkeit \
(Fälligkeitsdatum) — nichts mehr ändern; ein entsprechender Änderungsversuch wird von der \
Anwendung mit einem Hinweis auf die Festschreibung abgelehnt.

Eingangsrechnungen des Lieferanten (VendorBill) werden gesperrt, sobald sie freigegeben werden \
(Status "approved"). Für Eingangsrechnungen bietet die Anwendung ohnehin keine Möglichkeit, \
Positionen oder Beträge nach der Erfassung zu bearbeiten — die Sperre dokumentiert hier vor allem \
den Zeitpunkt, ab dem der Beleg als endgültig gilt.

Bekannte Ausnahme: Verzugszinsen (Late Fee) können auf eine bereits versendete Rechnung als \
zusätzliche Position nachgetragen werden, statt einen eigenen Beleg zu erzeugen. Dies ist eine \
bewusste Design-Entscheidung dieser Software und keine Lücke in der Sperrlogik — sie sollte \
jedoch mit dem Steuerberater besprochen werden, falls eine strengere Auslegung der Festschreibung \
für Verzugszinsen gewünscht ist.

2. KORREKTURVERFAHREN — WIE EIN GESPERRTER BELEG KORRIGIERT WIRD

Ein gesperrter Beleg wird niemals bearbeitet oder gelöscht. Stattdessen:

Für eine Ausgangsrechnung erzeugt die Funktion "Rechnung stornieren" automatisch eine \
Stornorechnung: ein neuer, eigenständiger Beleg mit einer neuen fortlaufenden Rechnungsnummer, \
der jede Position der Originalrechnung exakt in negierter Höhe enthält. Die Originalrechnung \
erhält den Status "void" sowie einen dokumentierten Grund; die Stornorechnung wird sofort mit \
dem Status "sent" gebucht und dem Kunden per E-Mail zugestellt.

Für eine Eingangsrechnung markiert die Funktion "Rechnung stornieren" den Beleg als "void" mit \
einem dokumentierten Grund. Es wird keine automatische Korrekturbuchung erzeugt — eine korrigierte \
Rechnung des Lieferanten wird als eigener, neuer Beleg erfasst.

3. MANIPULATIONSSICHERER NACHWEIS (GOBD-LEDGER)

Jedes Sperr- und Korrekturereignis (Festschreibung, Stornierung, Ausstellung einer \
Stornorechnung) wird zusätzlich zur normalen Aktivitätshistorie in einem eigenen, \
kryptographisch verketteten Journal protokolliert. Jeder Eintrag enthält den Hash-Wert des \
vorherigen Eintrags; eine nachträgliche Änderung oder Löschung eines beliebigen Eintrags macht \
sich dadurch in jedem nachfolgenden Eintrag bemerkbar und lässt sich über die \
Prüffunktion ("Kette prüfen" in den Compliance-Einstellungen) jederzeit nachweisen. Dieses \
Journal ist bewusst getrennt von der allgemeinen Aktivitätshistorie (Audit-Log), die für die \
laufende Nachvollziehbarkeit aller Aktionen gedacht ist, aber keine kryptographische \
Manipulationssicherung bietet.

4. WAS DIESE DOKUMENTATION NICHT ABDECKT

— Datensicherung und Wiederherstellung (Backup/Restore) sowie die gesetzliche \
Aufbewahrungsfrist von zehn Jahren: dies ist eine Betriebs-/Infrastrukturaufgabe, keine \
Software-Funktion.
— Zugriffsberechtigungen und Rollenkonzept auf Betriebssystem- und Datenbankebene außerhalb \
dieser Anwendung.
— Ein vollständiges Berechtigungskonzept im Sinne der GoBD-Verfahrensdokumentation \
(Rz. 151–153) — die anwendungsseitigen Rollen (Inhaber/Admin/Buchhalter) sind in den \
Einstellungen dieser Anwendung ersichtlich, ersetzen aber keine eigenständige Dokumentation.
— Eine Zertifizierung oder Prüfung durch einen Wirtschaftsprüfer oder das Finanzamt. Diese \
Dokumentation beschreibt den technischen Ist-Zustand und ist als Ausgangspunkt für die \
Erstellung einer vollständigen Verfahrensdokumentation durch Ihren Steuerberater gedacht.`;

@Injectable()
export class GobdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
  ) {}

  async generateVerfahrensdokumentation(companyId: string): Promise<Buffer> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;

    return this.pdfService.renderTextDocument({
      title: "Verfahrensdokumentation GoBD",
      subtitle: company.name,
      meta: [{ label: "Erstellt am", value: new Date().toISOString().slice(0, 10) }],
      body: BODY_DE,
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }
}
