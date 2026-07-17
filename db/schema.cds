namespace c4cquote.db;

using { cuid, managed } from '@sap/cds/common';

/**
 * Part 1: standalone pricing simulation — a scratchpad for building and
 * pricing a hypothetical set of line items, independent of any real quote.
 */
entity PricingSimulations : cuid, managed {
  name        : String(111);
  description : String(1000);
  currency    : String(3);
  items       : Composition of many PricingSimulationItems on items.simulation = $self;
}

entity PricingSimulationItems : cuid, managed {
  simulation  : Association to PricingSimulations;
  product     : String(50);
  productDesc : String(255);
  quantity    : Decimal(15,3);
  listPrice   : Decimal(15,2);
  discountPct : Decimal(5,2);
  netPrice    : Decimal(15,2);
}

/**
 * Configurable rates behind the regional pricing formulas — see
 * docs/pricing-engine-spec.md and srv/lib/pricing-engine.js. Editable via
 * the admin tab in TSS Pricing AI (app/tss-pricing-ai); seeded (db/data) with the values
 * that used to be hardcoded, so behavior is unchanged until an admin
 * edits one. Flat key-value shape (rather than one column per rate) so a
 * single generic admin table can list/edit all regions without per-region
 * special-casing.
 */
entity PricingRateConfig : cuid, managed {
  region   : String(20);   // americas | europe | china | india
  paramKey : String(50);   // e.g. 'freightRate', 'pickCharge' — matched by srv/lib/pricing-engine.js
  label    : String(200);
  value    : Decimal(15,6);
  unit     : String(20);   // percent | currency | factor — display hint only
}

/**
 * Part 2: replica of a C4C Quote's item tab, keyed by the C4C quote/item IDs
 * passed in via mashup parameters. Fields beyond this placeholder set will
 * grow as the "AI replacement" feature requirements are defined.
 */
entity QuoteItems : cuid, managed {
  c4cQuoteId  : String(50);
  c4cItemId   : String(50);
  product     : String(50);
  productDesc : String(255);
  quantity    : Decimal(15,3);
  listPrice   : Decimal(15,2);
  netPrice    : Decimal(15,2);
  currency    : String(3);
  aiSuggested : Boolean default false;
}
