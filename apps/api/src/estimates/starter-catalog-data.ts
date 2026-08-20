export interface StarterMaterial {
  code: string;
  name: string;
  unit: string;
  defaultUnitPrice: number;
}

export interface StarterRateItem {
  code: string;
  name: string;
  unit: string;
  laborHoursPerUnit: number;
  materials: { materialCode: string; quantityPerUnit: number; wasteFactorPercent?: number }[];
}

export const metricMaterials: StarterMaterial[] = [
  { code: "CER-TILE", name: "Ceramic floor tile", unit: "m2", defaultUnitPrice: 22.0 },
  { code: "TILE-ADH", name: "Tile adhesive", unit: "kg", defaultUnitPrice: 1.8 },
  { code: "GROUT", name: "Tile grout", unit: "kg", defaultUnitPrice: 3.5 },
  { code: "PAINT-INT", name: "Interior wall paint", unit: "L", defaultUnitPrice: 9.5 },
  { code: "PRIMER", name: "Wall primer", unit: "L", defaultUnitPrice: 6.0 },
  { code: "DRYWALL", name: "Drywall sheet, 12.5mm", unit: "m2", defaultUnitPrice: 7.2 },
  { code: "DRYWALL-SCREW", name: "Drywall screws", unit: "kg", defaultUnitPrice: 4.0 },
  { code: "INSULATION", name: "Mineral wool insulation", unit: "m2", defaultUnitPrice: 8.5 },
  { code: "CONCRETE", name: "Ready-mix concrete", unit: "m3", defaultUnitPrice: 110.0 },
  { code: "REBAR", name: "Reinforcement steel", unit: "kg", defaultUnitPrice: 1.1 },
  { code: "TIMBER", name: "Structural timber", unit: "m3", defaultUnitPrice: 480.0 },
  { code: "ROOF-TILE", name: "Roof tile", unit: "m2", defaultUnitPrice: 28.0 },
  { code: "CABLE", name: "Electrical cable, 1.5mm²", unit: "m", defaultUnitPrice: 0.9 },
  { code: "SOCKET", name: "Electrical socket", unit: "pcs", defaultUnitPrice: 3.2 },
  { code: "PIPE-PVC", name: "PVC drain pipe", unit: "m", defaultUnitPrice: 4.5 },
];

export const metricRateItems: StarterRateItem[] = [
  {
    code: "RC-TILE-FLOOR",
    name: "Lay ceramic floor tile",
    unit: "m2",
    laborHoursPerUnit: 0.6,
    materials: [
      { materialCode: "CER-TILE", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "TILE-ADH", quantityPerUnit: 4 },
      { materialCode: "GROUT", quantityPerUnit: 0.5 },
    ],
  },
  {
    code: "RC-TILE-WALL",
    name: "Lay ceramic wall tile",
    unit: "m2",
    laborHoursPerUnit: 0.65,
    materials: [
      { materialCode: "CER-TILE", quantityPerUnit: 1, wasteFactorPercent: 8 },
      { materialCode: "TILE-ADH", quantityPerUnit: 3.5 },
      { materialCode: "GROUT", quantityPerUnit: 0.4 },
    ],
  },
  {
    code: "RC-PAINT-WALL",
    name: "Paint interior wall, 2 coats",
    unit: "m2",
    laborHoursPerUnit: 0.15,
    materials: [
      { materialCode: "PAINT-INT", quantityPerUnit: 0.25 },
      { materialCode: "PRIMER", quantityPerUnit: 0.12 },
    ],
  },
  {
    code: "RC-PAINT-CEILING",
    name: "Paint ceiling, 2 coats",
    unit: "m2",
    laborHoursPerUnit: 0.18,
    materials: [
      { materialCode: "PAINT-INT", quantityPerUnit: 0.22 },
      { materialCode: "PRIMER", quantityPerUnit: 0.1 },
    ],
  },
  {
    code: "RC-DRYWALL-PARTITION",
    name: "Install drywall partition, single layer",
    unit: "m2",
    laborHoursPerUnit: 0.35,
    materials: [
      { materialCode: "DRYWALL", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "DRYWALL-SCREW", quantityPerUnit: 0.03 },
    ],
  },
  {
    code: "RC-DRYWALL-CEILING",
    name: "Install drywall ceiling",
    unit: "m2",
    laborHoursPerUnit: 0.4,
    materials: [
      { materialCode: "DRYWALL", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "DRYWALL-SCREW", quantityPerUnit: 0.035 },
    ],
  },
  {
    code: "RC-INSULATION",
    name: "Install wall insulation",
    unit: "m2",
    laborHoursPerUnit: 0.2,
    materials: [{ materialCode: "INSULATION", quantityPerUnit: 1, wasteFactorPercent: 5 }],
  },
  {
    code: "RC-ROOF-INSULATION",
    name: "Install roof insulation",
    unit: "m2",
    laborHoursPerUnit: 0.22,
    materials: [{ materialCode: "INSULATION", quantityPerUnit: 1, wasteFactorPercent: 10 }],
  },
  {
    code: "RC-CONCRETE-SLAB",
    name: "Pour concrete slab, 12cm",
    unit: "m2",
    laborHoursPerUnit: 0.45,
    materials: [
      { materialCode: "CONCRETE", quantityPerUnit: 0.12 },
      { materialCode: "REBAR", quantityPerUnit: 8 },
    ],
  },
  {
    code: "RC-CONCRETE-FOOTING",
    name: "Pour concrete footing",
    unit: "m",
    laborHoursPerUnit: 0.6,
    materials: [
      { materialCode: "CONCRETE", quantityPerUnit: 0.25 },
      { materialCode: "REBAR", quantityPerUnit: 12 },
    ],
  },
  {
    code: "RC-FRAMING",
    name: "Timber wall framing",
    unit: "m2",
    laborHoursPerUnit: 0.55,
    materials: [{ materialCode: "TIMBER", quantityPerUnit: 0.018 }],
  },
  {
    code: "RC-ROOFING",
    name: "Install roof tiles",
    unit: "m2",
    laborHoursPerUnit: 0.5,
    materials: [{ materialCode: "ROOF-TILE", quantityPerUnit: 1, wasteFactorPercent: 8 }],
  },
  {
    code: "RC-ELECTRICAL-CIRCUIT",
    name: "Rough-in electrical circuit",
    unit: "m",
    laborHoursPerUnit: 0.1,
    materials: [{ materialCode: "CABLE", quantityPerUnit: 1, wasteFactorPercent: 10 }],
  },
  {
    code: "RC-ELECTRICAL-SOCKET",
    name: "Install electrical socket",
    unit: "pcs",
    laborHoursPerUnit: 0.4,
    materials: [{ materialCode: "SOCKET", quantityPerUnit: 1 }],
  },
  {
    code: "RC-PLUMBING-DRAIN",
    name: "Install PVC drain pipe",
    unit: "m",
    laborHoursPerUnit: 0.25,
    materials: [{ materialCode: "PIPE-PVC", quantityPerUnit: 1, wasteFactorPercent: 5 }],
  },
];

export const imperialMaterials: StarterMaterial[] = [
  { code: "CER-TILE", name: "Ceramic floor tile", unit: "sqft", defaultUnitPrice: 2.5 },
  { code: "TILE-ADH", name: "Tile adhesive", unit: "lb", defaultUnitPrice: 0.9 },
  { code: "GROUT", name: "Tile grout", unit: "lb", defaultUnitPrice: 1.6 },
  { code: "PAINT-INT", name: "Interior wall paint", unit: "gal", defaultUnitPrice: 32.0 },
  { code: "PRIMER", name: "Wall primer", unit: "gal", defaultUnitPrice: 24.0 },
  { code: "DRYWALL", name: 'Drywall sheet, 1/2"', unit: "sqft", defaultUnitPrice: 0.65 },
  { code: "DRYWALL-SCREW", name: "Drywall screws", unit: "lb", defaultUnitPrice: 3.5 },
  { code: "INSULATION", name: "Fiberglass insulation", unit: "sqft", defaultUnitPrice: 0.75 },
  { code: "CONCRETE", name: "Ready-mix concrete", unit: "cuyd", defaultUnitPrice: 145.0 },
  { code: "REBAR", name: "Reinforcement steel", unit: "lb", defaultUnitPrice: 0.55 },
  { code: "LUMBER", name: "Structural lumber", unit: "bf", defaultUnitPrice: 3.2 },
  { code: "ROOF-SHINGLE", name: "Roofing shingle", unit: "sqft", defaultUnitPrice: 2.1 },
  { code: "CABLE", name: "Electrical cable, 14AWG", unit: "ft", defaultUnitPrice: 0.3 },
  { code: "SOCKET", name: "Electrical outlet", unit: "ea", defaultUnitPrice: 3.0 },
  { code: "PIPE-PVC", name: "PVC drain pipe", unit: "ft", defaultUnitPrice: 1.4 },
];

export const imperialRateItems: StarterRateItem[] = [
  {
    code: "RC-TILE-FLOOR",
    name: "Lay ceramic floor tile",
    unit: "sqft",
    laborHoursPerUnit: 0.06,
    materials: [
      { materialCode: "CER-TILE", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "TILE-ADH", quantityPerUnit: 0.4 },
      { materialCode: "GROUT", quantityPerUnit: 0.05 },
    ],
  },
  {
    code: "RC-TILE-WALL",
    name: "Lay ceramic wall tile",
    unit: "sqft",
    laborHoursPerUnit: 0.065,
    materials: [
      { materialCode: "CER-TILE", quantityPerUnit: 1, wasteFactorPercent: 8 },
      { materialCode: "TILE-ADH", quantityPerUnit: 0.35 },
      { materialCode: "GROUT", quantityPerUnit: 0.04 },
    ],
  },
  {
    code: "RC-PAINT-WALL",
    name: "Paint interior wall, 2 coats",
    unit: "sqft",
    laborHoursPerUnit: 0.015,
    materials: [
      { materialCode: "PAINT-INT", quantityPerUnit: 0.006 },
      { materialCode: "PRIMER", quantityPerUnit: 0.003 },
    ],
  },
  {
    code: "RC-PAINT-CEILING",
    name: "Paint ceiling, 2 coats",
    unit: "sqft",
    laborHoursPerUnit: 0.018,
    materials: [
      { materialCode: "PAINT-INT", quantityPerUnit: 0.0055 },
      { materialCode: "PRIMER", quantityPerUnit: 0.0025 },
    ],
  },
  {
    code: "RC-DRYWALL-PARTITION",
    name: "Install drywall partition, single layer",
    unit: "sqft",
    laborHoursPerUnit: 0.035,
    materials: [
      { materialCode: "DRYWALL", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "DRYWALL-SCREW", quantityPerUnit: 0.006 },
    ],
  },
  {
    code: "RC-DRYWALL-CEILING",
    name: "Install drywall ceiling",
    unit: "sqft",
    laborHoursPerUnit: 0.04,
    materials: [
      { materialCode: "DRYWALL", quantityPerUnit: 1, wasteFactorPercent: 5 },
      { materialCode: "DRYWALL-SCREW", quantityPerUnit: 0.007 },
    ],
  },
  {
    code: "RC-INSULATION",
    name: "Install wall insulation",
    unit: "sqft",
    laborHoursPerUnit: 0.02,
    materials: [{ materialCode: "INSULATION", quantityPerUnit: 1, wasteFactorPercent: 5 }],
  },
  {
    code: "RC-ROOF-INSULATION",
    name: "Install roof insulation",
    unit: "sqft",
    laborHoursPerUnit: 0.022,
    materials: [{ materialCode: "INSULATION", quantityPerUnit: 1, wasteFactorPercent: 10 }],
  },
  {
    code: "RC-CONCRETE-SLAB",
    name: 'Pour concrete slab, 4"',
    unit: "sqft",
    laborHoursPerUnit: 0.045,
    materials: [
      { materialCode: "CONCRETE", quantityPerUnit: 0.015 },
      { materialCode: "REBAR", quantityPerUnit: 0.8 },
    ],
  },
  {
    code: "RC-CONCRETE-FOOTING",
    name: "Pour concrete footing",
    unit: "ft",
    laborHoursPerUnit: 0.18,
    materials: [
      { materialCode: "CONCRETE", quantityPerUnit: 0.03 },
      { materialCode: "REBAR", quantityPerUnit: 1.2 },
    ],
  },
  {
    code: "RC-FRAMING",
    name: "Wood wall framing",
    unit: "sqft",
    laborHoursPerUnit: 0.055,
    materials: [{ materialCode: "LUMBER", quantityPerUnit: 1.5 }],
  },
  {
    code: "RC-ROOFING",
    name: "Install roof shingles",
    unit: "sqft",
    laborHoursPerUnit: 0.05,
    materials: [{ materialCode: "ROOF-SHINGLE", quantityPerUnit: 1, wasteFactorPercent: 10 }],
  },
  {
    code: "RC-ELECTRICAL-CIRCUIT",
    name: "Rough-in electrical circuit",
    unit: "ft",
    laborHoursPerUnit: 0.03,
    materials: [{ materialCode: "CABLE", quantityPerUnit: 1, wasteFactorPercent: 10 }],
  },
  {
    code: "RC-ELECTRICAL-SOCKET",
    name: "Install electrical outlet",
    unit: "ea",
    laborHoursPerUnit: 0.4,
    materials: [{ materialCode: "SOCKET", quantityPerUnit: 1 }],
  },
  {
    code: "RC-PLUMBING-DRAIN",
    name: "Install PVC drain pipe",
    unit: "ft",
    laborHoursPerUnit: 0.08,
    materials: [{ materialCode: "PIPE-PVC", quantityPerUnit: 1, wasteFactorPercent: 5 }],
  },
];
