export const REGIONS = [
  { key: 'americas', label: 'Americas' },
  { key: 'europe', label: 'Europe' },
  { key: 'china', label: 'China' },
  { key: 'india', label: 'India' },
]

export const DEFAULT_CURRENCY = {
  americas: 'USD',
  europe: 'EUR',
  china: 'CNY',
  india: 'INR',
}

export function defaultFieldsFor(region) {
  switch (region) {
    case 'americas':
      return { stockClass: 'MTS', mroq: false, shipFrom: 'domestic' }
    case 'europe':
      return { stockClass: 'MTS', freightPct: 3.5, dutyPct: 2.2 }
    case 'china':
      return { supplierSource: 'jde', countryOfOrigin: 'us', applyLocalMarkups: true }
    case 'india':
      return { supplierType: 'local' }
    default:
      return {}
  }
}

export function newLineItem(region = 'americas') {
  return {
    lineId: `row-${Math.random().toString(36).slice(2)}`,
    region,
    partNumber: '',
    quantity: 1,
    baseCost: '',
    currency: DEFAULT_CURRENCY[region],
    ...defaultFieldsFor(region),
  }
}

// Column order shared by the Excel template download and the upload
// parser, so every UI field round-trips through Excel.
export const EXCEL_COLUMNS = [
  'region',
  'partNumber',
  'quantity',
  'baseCost',
  'currency',
  'stockClass',
  'mroq',
  'shipFrom',
  'freightPct',
  'dutyPct',
  'supplierSource',
  'countryOfOrigin',
  'applyLocalMarkups',
  'supplierType',
]

export const FORMULA_REFERENCE = {
  americas: [
    'Base Cost + Freight (3.5%) + Duty (2.2%) + Tariff (1.5%)',
    '= Subtotal',
    '+ LCA Handling Fee (6.7% domestic / 10.5% overseas, on Subtotal)',
    '+ Pick Charge (flat, ÷ quantity)',
    '= Unit Price',
  ],
  europe: [
    'MTS: Base Cost + SCM Markup (4.7%) + Pick Charge (flat, ÷ quantity) = Unit Price',
    'Non-MTS: Base Cost + Freight% + Duty% + SCM Markup (4.7% of Base+Freight+Duty) + Pick Charge = Unit Price',
  ],
  china: [
    'JDE China Direct: Base Cost × LCS Factor (1.032) = Unit Price',
    'SAP Europe Fallback: Base Cost × F&D Factor (1.32 if COO=US, else 1.21) = Unit Price',
    'If "Apply Local Markups": + LCE Markup (6%) + LCS Markup (3.2%), both on the running Unit Price',
  ],
  india: [
    'Local Supplier: Unit Price = Base Cost (landed cost, no markup)',
    'Overseas Supplier: Unit Price = Base Cost + Overseas Markup (40%)',
  ],
}
