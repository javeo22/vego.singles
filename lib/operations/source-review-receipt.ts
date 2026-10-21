import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { PriceCheck } from "./price-verification";

export type SourceReviewReceipt = {
  key: string;
  rootKey?: string;
  batchId: string;
  checkedAt: string;
  results: Array<{
    printingId: string;
    listingId: string;
    expectedPrinting: Record<string, any>;
    expectedListing: Record<string, any>;
    verification: PriceCheck;
  }>;
};

// Save catalog/price comparisons for review, without asserting physical
// identity or changing inventory, language, approved price or publication.
export function sourceReviewSql(input: SourceReviewReceipt, rollback = false) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.ok(uuid.test(input.key) && uuid.test(input.batchId));
  assert.ok(!input.rootKey || uuid.test(input.rootKey));
  const reviewKey = input.rootKey || input.key;
  assert.equal(new Date(input.checkedAt).toISOString(), input.checkedAt);
  assert.ok(input.results.length > 0 && input.results.length <= 5000);
  assert.equal(
    new Set(input.results.map((row) => row.listingId)).size,
    input.results.length,
  );
  assert.equal(
    new Set(input.results.map((row) => row.printingId)).size,
    input.results.length,
  );
  for (const row of input.results) {
    assert.ok(uuid.test(row.printingId) && uuid.test(row.listingId));
    assert.equal(row.expectedPrinting.id, row.printingId);
    assert.equal(row.expectedListing.id, row.listingId);
    assert.equal(row.expectedListing.card_printing_id, row.printingId);
    assert.equal(row.expectedPrinting.metadata?.provisional_receipt, true);
    assert.equal(
      row.expectedPrinting.metadata?.source_import_batch_id,
      input.batchId,
    );
    assert.equal(row.verification.recommendedId, null);
    assert.equal(row.verification.references.length, 0);
    assert.equal(row.verification.variantSnapshot.identityVerified, false);
    assert.equal(row.verification.variantSnapshot.listingId, row.listingId);
    assert.equal(row.verification.variantSnapshot.printingId, row.printingId);
  }
  const json = JSON.stringify(input);
  assert.ok(!json.includes("$source_review_payload$"));
  const hash = createHash("sha256").update(json).digest("hex");
  return `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table source_review_input on commit drop as
select x.*,gen_random_uuid() job_id from jsonb_to_recordset($source_review_payload$${JSON.stringify(input.results)}$source_review_payload$::jsonb)
as x("printingId" uuid,"listingId" uuid,"expectedPrinting" jsonb,"expectedListing" jsonb,verification jsonb);
do $source_review_command$
declare receipt operation_receipts; payload jsonb=jsonb_build_object('batch','${input.batchId}','manifestSha256','${hash}'); result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('${input.key}',0));
 select * into receipt from operation_receipts where key='${input.key}';
 if found then
  if receipt.action<>'source_match_review' or receipt.payload<>payload then raise exception 'Review receipt key already used'; end if;
  return;
 end if;
 perform 1 from card_printings where id in (select "printingId" from source_review_input) order by id for update;
 perform 1 from listings where id in (select "listingId" from source_review_input) order by id for update;
 if exists(select 1 from source_review_input r left join card_printings c on c.id=r."printingId" left join listings l on l.id=r."listingId"
  where to_jsonb(c) is distinct from r."expectedPrinting" or to_jsonb(l) is distinct from r."expectedListing"
   or not exists(select 1 from stock_lots s where s.listing_id=l.id and s.source_reference='${input.batchId}')) then
  raise exception 'Inventory changed or receipt batch mismatch; refresh source review before applying';
 end if;
 insert into operation_jobs(id,kind,entity_id,status,attempts,result)
 select r.job_id,'refresh_price',r."listingId",'needs_review',1,jsonb_build_object(
  'message','Catálogo contrastado. Confirma idioma, identidad física, ubicación y precio antes de publicar.',
  'quote',null,'verification',r.verification,'sourceReviewKey','${reviewKey}','sourceImportBatchId','${input.batchId}')
 from source_review_input r;
 update card_printings c set metadata=c.metadata||jsonb_build_object('source_match_review',jsonb_build_object(
  'key','${reviewKey}','jobId',r.job_id,'checkedAt','${input.checkedAt}',
  'status','needs_review','catalogMatches',r.verification->'catalogMatches',
  'comparisonReferences',r.verification->'comparisonReferences','reviewReasons',r.verification->'reviewReasons')),
  updated_at=now()
 from source_review_input r where c.id=r."printingId";
 result=jsonb_build_object('saved',(select count(*) from source_review_input),'published',0,'review',(select count(*) from source_review_input));
 insert into activity_log(action,details) values('source_match_review',jsonb_build_object(
  'actor','codex','batch','${input.batchId}','manifestSha256','${hash}','result',result,
  'reason','User requested source matching and publication only where verified; unconfirmed physical variants retained for review'));
 insert into operation_receipts(key,action,payload,result) values('${input.key}','source_match_review',payload,result);
end $source_review_command$;
${rollback ? "rollback" : "commit"};`;
}
