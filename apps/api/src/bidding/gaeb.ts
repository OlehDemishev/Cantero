import { XMLParser } from "fast-xml-parser";

export interface GaebParty {
  name: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export interface GaebDa83Line {
  positionNo: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface BuildGaebDa83XmlInput {
  projectName: string;
  title: string;
  description: string | null;
  submissionDeadline: Date | null;
  owner: GaebParty;
  lines: GaebDa83Line[];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a GAEB DA XML 3.3 price inquiry (DA83) — the document a GC sends to bidders asking them to
 * price a fixed, position-numbered Bill of Quantities. Hand-built, structurally-correct XML modeled
 * on the real GAEB DA XML schema — not run through the official GAEB validator, and deliberately a
 * flat item list (no BoQCtgy category/section nesting), same "honest simplified subset" approach as
 * buildXRechnungXml in finance/e-invoice.ts. positionNo (GAEB RNo) is carried on the Item element's
 * RNoPart attribute so a returned DA84 can be matched back to the exact line it prices.
 */
export function buildGaebDa83Xml(input: BuildGaebDa83XmlInput): string {
  const items = input.lines
    .map(
      (line) => `        <Item RNoPart="${escapeXml(line.positionNo)}">
          <Qty>${line.quantity.toFixed(4)}</Qty>
          <QU>${escapeXml(line.unit)}</QU>
          <UP></UP>
          <IT></IT>
          <Description>
            <OutlineText>
              <OutlTxt>
                <span>${escapeXml(line.description)}</span>
              </OutlTxt>
            </OutlineText>
          </Description>
        </Item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3" DAVersion="3.3" GAEBVersion="GAEB_DA_XML_3.3">
  <PrjInfo>
    <NamePrj>${escapeXml(input.projectName)}</NamePrj>
    <LblPrj>${escapeXml(input.title)}</LblPrj>
  </PrjInfo>
  <Award>
    <OWN>
      <Name1>${escapeXml(input.owner.name)}</Name1>
      <Street>${escapeXml(input.owner.street)}</Street>
      <PCode>${escapeXml(input.owner.postalCode)}</PCode>
      <City>${escapeXml(input.owner.city)}</City>
      <Country>${escapeXml(input.owner.countryCode)}</Country>
    </OWN>
    <AwardInfo>
${input.description ? `      <Comment>${escapeXml(input.description)}</Comment>\n` : ""}${input.submissionDeadline ? `      <SubmDlDt>${isoDate(input.submissionDeadline)}</SubmDlDt>\n` : ""}    </AwardInfo>
    <BoQ>
      <BoQInfo>
        <Name>${escapeXml(input.title)}</Name>
      </BoQInfo>
      <BoQBody>
        <Itemlist>
${items}
        </Itemlist>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>
`;
}

export interface GaebDa84Item {
  positionNo: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
}

export class GaebParseError extends Error {}

/**
 * Parses an inbound GAEB DA XML priced response (DA84) — what a subcontractor's own GAEB-capable
 * software (Nevaris, RIB, BRZ, ...) produces after pricing a DA83 price inquiry. Only reads the
 * subset this app's own buildGaebDa83Xml emits (flat Itemlist, RNoPart attribute for the position
 * number) — a real DA84 from third-party software that nests position numbers differently (e.g.
 * <Identification><RNoPart>...) is handled via the fallback below, but full GAEB DA XML richness
 * (category hierarchy, alternates, unit price breakdowns) is not parsed. Hand-rolling a full XML
 * parser is not viable for real-world input, so this uses fast-xml-parser rather than a regex/string
 * approach (unlike the pure-template-string builder above, which has no such requirement).
 */
export function parseGaebDa84Xml(xml: string): GaebDa84Item[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: true });

  let doc: unknown;
  try {
    doc = parser.parse(xml, true);
  } catch (err) {
    throw new GaebParseError(`Malformed GAEB XML: ${err instanceof Error ? err.message : String(err)}`);
  }

  const gaeb = (doc as Record<string, unknown>)?.GAEB as Record<string, unknown> | undefined;
  const award = gaeb?.Award as Record<string, unknown> | undefined;
  const boq = award?.BoQ as Record<string, unknown> | undefined;
  const boqBody = boq?.BoQBody as Record<string, unknown> | undefined;
  const itemlist = boqBody?.Itemlist as Record<string, unknown> | undefined;
  if (!gaeb || !award || !boq || !boqBody || !itemlist) {
    throw new GaebParseError("Not a recognizable GAEB DA XML document — missing GAEB/Award/BoQ/BoQBody/Itemlist");
  }

  const rawItems = itemlist.Item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items.map((raw): GaebDa84Item => {
    const item = raw as Record<string, unknown>;
    const identification = item.Identification as Record<string, unknown> | undefined;
    const positionNo = String(item["@_RNoPart"] ?? identification?.RNoPart ?? "").trim();
    if (!positionNo) throw new GaebParseError("A GAEB Item is missing its RNoPart position number");

    const description = extractDescription(item.Description as Record<string, unknown> | undefined);
    const quantity = toNumberOrNull(item.Qty);
    const unitPrice = toNumberOrNull(item.UP);

    return { positionNo, description, quantity, unitPrice };
  });
}

function extractDescription(description: Record<string, unknown> | undefined): string | null {
  const outlTxt = (description?.OutlineText as Record<string, unknown> | undefined)?.OutlTxt as Record<string, unknown> | undefined;
  const span = outlTxt?.span;
  if (typeof span === "string") return span;
  if (typeof span === "number") return String(span);
  return null;
}

function toNumberOrNull(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return null;
}
