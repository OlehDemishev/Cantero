import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { GobdAnchorService } from "../common/gobd/gobd-anchor.service";
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

Auslagen von Mitarbeitern (Expense) werden gesperrt, sobald sie freigegeben werden (Status \
"approved"). Dabei wird neben Betrag, Datum und Kategorie auch ein SHA-256-Hashwert der \
hinterlegten Belegdatei (Foto oder Scan) im GoBD-Ledger festgehalten, sodass ein nachträglich \
ausgetauschter Beleg nachweisbar ist — auch dann, wenn die Datei direkt im Speicher ersetzt \
würde. Nach der Freigabe oder Ablehnung lässt sich der Beleg in der Anwendung nicht mehr \
ersetzen. Für freigegebene Auslagen gibt es derzeit keine Stornofunktion; eine Korrektur ist \
als eigener, neuer Vorgang zu erfassen.

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
Prüffunktion ("Kette prüfen" in den Compliance-Einstellungen) jederzeit nachweisen. Die \
Datenbank selbst lässt an diesem Journal nur das Anfügen neuer Einträge zu und weist \
Änderungen und Löschungen ab. Ebenso verhindert sie, dass Rechnungen, Eingangsrechnungen und \
Auslagen durch das Löschen eines Projekts, eines Mitarbeiters oder des Unternehmens mitgelöscht \
werden. Dieses Journal ist bewusst getrennt von der allgemeinen Aktivitätshistorie (Audit-Log), \
die für die laufende Nachvollziehbarkeit aller Aktionen gedacht ist, aber keine \
kryptographische Manipulationssicherung bietet.

Zusätzlich wird das Journal außerhalb der Anwendung verankert, sofern auf dem Server ein \
Zeitstempeldienst eingerichtet ist (siehe Kopfzeile dieses Dokuments): Einmal täglich lässt die \
Anwendung den Hashwert des jeweils neuesten Journaleintrags von einem unabhängigen \
Zeitstempeldienst nach RFC 3161 signieren. Weil jeder Hashwert alle vorherigen Einträge \
einschließt, passt eine nachträgliche Änderung früherer Einträge — selbst wenn die gesamte Kette \
neu berechnet würde — nicht mehr zu diesen Signaturen. An den Dienst wird dabei ausschließlich \
ein Hashwert übermittelt, keine Inhalte. Die Zeitstempel werden bei der Prüffunktion mit geprüft \
und lassen sich einzeln herunterladen und unabhängig von dieser Anwendung prüfen \
(openssl ts -verify).

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
    private readonly anchors: GobdAnchorService,
  ) {}

  async generateVerfahrensdokumentation(companyId: string): Promise<Buffer> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const tsaUrl = this.anchors.tsaUrl;
    const [lastAnchor] = tsaUrl ? await this.anchors.list(companyId) : [];
    const anchoring = !tsaUrl
      ? "nicht eingerichtet"
      : `aktiv (${new URL(tsaUrl).hostname})${lastAnchor ? `, zuletzt ${lastAnchor.timestampedAt.toISOString().slice(0, 10)} (Eintrag #${lastAnchor.sequence})` : ", noch keiner erstellt"}`;

    return this.pdfService.renderTextDocument({
      title: "Verfahrensdokumentation GoBD",
      subtitle: company.name,
      meta: [
        { label: "Erstellt am", value: new Date().toISOString().slice(0, 10) },
        { label: "Externe Zeitstempel", value: anchoring },
      ],
      body: BODY_DE,
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }
}
