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

// One line item's inputs. lineId is a client-generated id (e.g. a row key
// from the UI table or an Excel row number) echoed back on the matching
// result, so a batch of results can be matched back to input rows.
type PriceCalculationInput {
  lineId             : String;
  region             : Region;
  partNumber         : String;
  quantity           : Integer;
  baseCost           : Decimal(15,2);
  currency           : String(3);
  stockClass         : StockClass;
  mroq               : Boolean;
  shipFrom           : ShipFrom;
  freightPct         : Decimal(5,2);
  dutyPct            : Decimal(5,2);
  supplierSource     : SupplierSource;
  countryOfOrigin    : CountryOfOrigin;
  applyLocalMarkups  : Boolean;
  supplierType       : SupplierType;
}

type PriceCalculationResult {
  lineId     : String;
  partNumber : String;
  currency   : String(3);
  baseCost   : Decimal(15,2);
  unitPrice  : Decimal(15,2);
  totalPrice : Decimal(15,2);
  scenario   : String;
  costSource : String;
  breakdown  : many PriceBreakdownRow;
  error      : String;
}

type CostLookupResult {
  baseCost : Decimal(15,2);
  source   : String;
  error    : String;
}

// Interim lock: a single hardcoded account (see srv/server.js), HTTP Basic
// Auth, no XSUAA. Real BTP-user/role-based restriction via XSUAA is
// prepared but parked (xs-security.json, app/router) until the upcoming
// OBO/authorization phase. See README "Open items".
service PricingService @(path:'/pricing', requires: 'authenticated-user') {
  entity Simulations     as projection on db.PricingSimulations;
  entity SimulationItems as projection on db.PricingSimulationItems;

  // Admin-editable rates behind the regional formulas — see
  // docs/pricing-engine-spec.md and srv/lib/pricing-engine.js.
  entity RateConfig as projection on db.PricingRateConfig;

  // Regional pricing engine — see docs/pricing-engine-spec.md for the
  // formulas. baseCost is optional per line: if omitted, it's looked up
  // live via the API6 middleware (ERP, then BI Central Cost DB); if that
  // also comes up empty, that line's result carries `error` instead of a
  // price. Always a batch (of 1 or many) so the UI's multi-item table and
  // Excel upload share one code path.
  action calculatePrices(items: many PriceCalculationInput) returns many PriceCalculationResult;

  // Explicit "Fetch from ERP" / "Fetch from BI Central Cost DB" lookups,
  // for a single part, used by the per-row fetch buttons in the UI.
  function fetchCostFromERP(region: Region, partNumber: String) returns CostLookupResult;
  function fetchCostFromBI(region: Region, partNumber: String) returns CostLookupResult;
}
