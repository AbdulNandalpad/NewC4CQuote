using { c4cquote.db as db } from '../db/schema';

type Region           : String enum { americas; europe; china; india; };
type StockClass       : String enum { MTS; NONMTS; };
type ShipFrom         : String enum { domestic; overseas; };
type SupplierSource   : String enum { jde; sap; };
type CountryOfOrigin  : String enum { us; other; };
type SupplierType     : String enum { local; overseas; };

type PriceBreakdownRow {
  label : String;
  value : Decimal(15,2);
}

type PriceCalculationResult {
  unitPrice  : Decimal(15,2);
  totalPrice : Decimal(15,2);
  scenario   : String;
  costSource : String;
  breakdown  : many PriceBreakdownRow;
  error      : String;
}

// Auth is deliberately OFF for now (open to anyone) — restricting this to
// BTP users via XSUAA is prepared but parked (xs-security.json, app/router)
// until we come back to it as its own OBO/authorization phase, once the
// rest of the app is built out. See README "Open items".
service PricingService @(path:'/pricing') {
  entity Simulations     as projection on db.PricingSimulations;
  entity SimulationItems as projection on db.PricingSimulationItems;

  // Regional pricing engine — see docs/pricing-engine-spec.md for the
  // formulas. baseCost is optional: if omitted, it's looked up live via
  // the API6 middleware (ERP, then BI Central Cost DB); if that also
  // comes up empty, the result carries `error` instead of a price.
  action calculatePrice(
    region             : Region,
    partNumber         : String,
    quantity           : Integer,
    baseCost           : Decimal(15,2),
    stockClass         : StockClass,
    mroq               : Boolean,
    shipFrom           : ShipFrom,
    freightPct         : Decimal(5,2),
    dutyPct            : Decimal(5,2),
    supplierSource     : SupplierSource,
    countryOfOrigin    : CountryOfOrigin,
    applyLocalMarkups  : Boolean,
    supplierType       : SupplierType
  ) returns PriceCalculationResult;
}
