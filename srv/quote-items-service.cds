using { c4cquote.db as db } from '../db/schema';

// Explicitly open (@requires: 'any'), not just "unannotated" — CAP defaults
// any service WITHOUT an explicit @requires/@restrict to requiring
// 'authenticated-user' once NODE_ENV=production, specifically to stop
// services from being accidentally left open. This one is deliberately
// public: it must stay reachable anonymously for the C4C mashup iframe.
service QuoteItemsService @(path:'/quote-items', requires: 'any') {
  entity Items as projection on db.QuoteItems;
}
