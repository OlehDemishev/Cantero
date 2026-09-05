/**
 * A trimmed CSI MasterFormat starter set — enough divisions to classify a typical
 * renovation/commercial job without overwhelming a first-time user. Same list and "NN 00 00"
 * numbering the demo seed script (prisma/seed.ts) uses for every seeded company, so a real
 * company importing this later gets codes in the same shape rather than a second, differently
 * formatted set alongside any it already entered by hand. Bulk-imported into a company's
 * CostCode list on request (see CostCodesService.importStandardLibrary); codes that already
 * exist for the company are skipped rather than duplicated, same "skip what's already there"
 * convention as the material CSV importer.
 */
export const CSI_MASTERFORMAT_DIVISIONS: readonly { code: string; name: string }[] = [
  { code: "01 00 00", name: "General Requirements" },
  { code: "02 00 00", name: "Existing Conditions" },
  { code: "03 00 00", name: "Concrete" },
  { code: "04 00 00", name: "Masonry" },
  { code: "05 00 00", name: "Metals" },
  { code: "06 00 00", name: "Wood, Plastics, and Composites" },
  { code: "07 00 00", name: "Thermal and Moisture Protection" },
  { code: "08 00 00", name: "Openings" },
  { code: "09 00 00", name: "Finishes" },
  { code: "10 00 00", name: "Specialties" },
  { code: "21 00 00", name: "Fire Suppression" },
  { code: "22 00 00", name: "Plumbing" },
  { code: "23 00 00", name: "HVAC" },
  { code: "26 00 00", name: "Electrical" },
  { code: "31 00 00", name: "Earthwork" },
  { code: "32 00 00", name: "Exterior Improvements" },
];
