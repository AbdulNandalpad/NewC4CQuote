using { c4cquote.db as db } from '../db/schema';

service QuoteItemsService @(path:'/quote-items') {
  entity Items as projection on db.QuoteItems;
}
