using { c4cquote.db as db } from '../db/schema';

service PricingService @(path:'/pricing') {
  entity Simulations     as projection on db.PricingSimulations;
  entity SimulationItems as projection on db.PricingSimulationItems;
}
