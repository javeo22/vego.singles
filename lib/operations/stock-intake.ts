import { collectrCardName } from "./collectr";
import {
  normalize,
  normalizeFinish,
  normalizeLanguage,
  sameCollectorNumber,
  type ImportRow,
} from "./imports";

export type CatalogResolution = {
  rowNumber: number;
  sourceName: string;
  sourceSet: string;
  sourceFinish: string;
  collectorNumber: string;
  setName: string;
  treatment: string;
  provider: "scryfall";
  externalId: string;
  setCode: string;
  sourceUrl: string;
  observedAt: string;
};
type IntakeRow = ImportRow & {
  sourceCatalogEvidence?: CatalogResolution;
  sourceValidationErrors?: string[];
  pendingChecks?: string[];
};

export function applyIntakeResolutions(
  rows: ImportRow[],
  resolutions: CatalogResolution[],
): IntakeRow[] {
  if (
    new Set(resolutions.map((resolution) => resolution.rowNumber)).size !==
    resolutions.length
  )
    throw new Error("Duplicate catalog resolutions");
  for (const resolution of resolutions) {
    const row = rows.find((row) => row.rowNumber === resolution.rowNumber);
    if (
      !row ||
      row.game !== "magic" ||
      row.name !== resolution.sourceName ||
      row.setName !== resolution.sourceSet ||
      row.finish !== resolution.sourceFinish ||
      row.collectorNumber ||
      row.errors.some((error) => error !== "Falta número de carta") ||
      !resolution.collectorNumber ||
      !resolution.setName ||
      resolution.provider !== "scryfall" ||
      !/^https:\/\/scryfall\.com\/card\//.test(resolution.sourceUrl) ||
      !/^[0-9a-f-]{36}$/.test(resolution.externalId)
    )
      throw new Error(
        "Catalog resolution does not match the original source row",
      );
  }
  return rows.map((row) => {
    const resolution = resolutions.find(
      (resolution) => resolution.rowNumber === row.rowNumber,
    );
    return resolution
      ? {
          ...row,
          collectorNumber: resolution.collectorNumber,
          setName: resolution.setName,
          treatment: resolution.treatment,
          provider: resolution.provider,
          externalId: resolution.externalId,
          errors: [],
          sourceCatalogEvidence: resolution,
        }
      : row;
  });
}

export type IntakePrinting = {
  id: string;
  game: string;
  canonical_name: string;
  set_name: string;
  collector_number: string;
  language: string;
  treatment: string;
  kind: string;
  identity_verified: boolean;
  metadata: Record<string, unknown>;
};
export type IntakeListing = {
  id: string;
  card_printing_id: string;
  condition: string;
  finish: string;
  archived_at: string | null;
};
export type IntakeDecision = {
  row: IntakeRow;
  decision: "new" | "existing" | "review" | "excluded";
  reason: string;
  existingIds: string[];
  group?: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const nameKey = (value: string) =>
  normalize(collectrCardName(value).name)
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-");
const conditionKey = (value: string) => normalize(value).replace(/[_\s-]/g, "");
const setKey = (value: string) => normalize(value).replace(/[’‘]/g, "'");
const numberKey = (value: string) =>
  value
    .split("/")
    .map((part) => normalize(part).replace(/^0+(?=\d)/, ""))
    .join("/");

// Existing Collectr source fields are essential: older records sometimes lost
// their treatment suffix or renamed the set while retaining the original row.
export function planMissingStock(
  rows: IntakeRow[],
  printings: IntakePrinting[],
  listings: IntakeListing[],
) {
  const indexed = listings.flatMap((listing) => {
    const printing = printings.find((p) => p.id === listing.card_printing_id);
    if (!printing) return [];
    const raw = printing.metadata?.original_data as
      Record<string, unknown> | undefined;
    const sourceName = text(raw?.["Product Name"]);
    return [
      {
        listing,
        printing,
        sourceName,
        sourceSet: text(raw?.Set),
        sourceNumber: text(raw?.["Card Number"]),
        sourceTreatment: sourceName
          ? collectrCardName(sourceName).treatment
          : "",
      },
    ];
  });
  const decisions: IntakeDecision[] = rows.map((sourceRow) => {
    // Description-only One Piece stock is received privately, with the missing
    // number retained as a review item. Identity verification requires a number
    // or an exact external catalog identifier; neither is invented here.
    const row: IntakeRow =
      sourceRow.game === "one-piece" &&
      !sourceRow.collectorNumber &&
      sourceRow.errors.length === 1 &&
      sourceRow.errors[0] === "Falta número de carta"
        ? {
            ...sourceRow,
            errors: [],
            sourceValidationErrors: sourceRow.errors,
            pendingChecks: ["collectorNumber"],
            treatment: `unnumbered: ${normalize(sourceRow.name)}`,
          }
        : sourceRow;
    const base = { row, existingIds: [] as string[] };
    if (
      row.errors.some((error) =>
        /Watchlist|graduada|Cantidad inválida|columnas|Falta nombre|Falta set/.test(
          error,
        ),
      ) ||
      row.quantity === 0
    )
      return {
        ...base,
        decision: "excluded",
        reason: row.errors.join("; ") || "Cantidad cero",
      };
    const rawKey = (raw: Record<string, unknown>) =>
      JSON.stringify(
        Object.keys(raw)
          .sort()
          .map((key) => [key, raw[key]]),
      );
    const previouslyReceived = indexed.filter(({ printing }) => {
      const metadata = printing.metadata;
      return (
        metadata?.provisional_receipt === true &&
        Array.isArray(metadata.source_row_numbers) &&
        metadata.source_row_numbers.includes(row.rowNumber) &&
        metadata.original_data &&
        typeof metadata.original_data === "object" &&
        rawKey(metadata.original_data as Record<string, unknown>) ===
          rawKey(row.raw)
      );
    });
    if (previouslyReceived.length)
      return {
        ...base,
        decision: "existing",
        reason: "La fila fuente ya fue recibida anteriormente",
        existingIds: previouslyReceived.map((match) => match.listing.id),
      };
    if (row.errors.length)
      return { ...base, decision: "review", reason: row.errors.join("; ") };
    const matches = indexed.filter(
      ({
        listing,
        printing,
        sourceName,
        sourceSet,
        sourceNumber,
        sourceTreatment,
      }) => {
        if (
          printing.game !== row.game ||
          conditionKey(listing.condition) !== conditionKey(row.condition) ||
          normalizeFinish(listing.finish) !== row.finish
        )
          return false;
        if (
          ![printing.canonical_name, sourceName]
            .filter(Boolean)
            .some((name) => nameKey(name) === nameKey(row.name))
        )
          return false;
        if (
          ![printing.set_name, sourceSet]
            .filter(Boolean)
            .some((set) => setKey(set) === setKey(row.setName))
        )
          return false;
        if (
          ![printing.collector_number, sourceNumber]
            .filter(Boolean)
            .some((number) =>
              sameCollectorNumber(number, row.collectorNumber),
            ) &&
          !(row.kind === "sealed" && !row.collectorNumber)
        )
          return false;
        if (
          row.language !== "unknown" &&
          normalizeLanguage(printing.language) !== "unknown" &&
          normalizeLanguage(printing.language) !== row.language
        )
          return false;
        return (
          [printing.treatment || "standard", sourceTreatment]
            .filter(Boolean)
            .some(
              (treatment) => normalize(treatment) === normalize(row.treatment),
            ) && (printing.kind || "single") === row.kind
        );
      },
    );
    if (matches.length)
      return {
        ...base,
        decision: "existing",
        reason: "La variante ya tiene un listado; cantidad conservada",
        existingIds: matches.map((match) => match.listing.id),
      };
    const group = JSON.stringify([
      row.game,
      nameKey(row.name),
      setKey(row.setName),
      numberKey(row.collectorNumber),
      row.language,
      conditionKey(row.condition),
      row.finish,
      normalize(row.treatment),
      row.kind,
    ]);
    return {
      ...base,
      decision: "new",
      reason:
        "Recepción provisional; identidad, idioma, precio y ubicación pendientes de revisión",
      group,
    };
  });
  const groups = new Map<
    string,
    {
      rows: number[];
      quantity: number;
      printingId: string;
      listingId: string;
      row: IntakeRow;
    }
  >();
  for (const decision of decisions) {
    if (decision.decision !== "new") continue;
    const found = groups.get(decision.group!);
    if (found) {
      found.rows.push(decision.row.rowNumber);
      found.quantity += decision.row.quantity;
    } else
      groups.set(decision.group!, {
        rows: [decision.row.rowNumber],
        quantity: decision.row.quantity,
        printingId: crypto.randomUUID(),
        listingId: crypto.randomUUID(),
        row: decision.row,
      });
  }
  return { decisions, groups: [...groups.values()] };
}

export const inventorySnapshotQuery = `with snapshot as (
 select jsonb_build_object(
  'printings',coalesce((select jsonb_agg(to_jsonb(c) order by id) from card_printings c),'[]'::jsonb),
  'listings',coalesce((select jsonb_agg(to_jsonb(l) order by id) from listings l),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(s) order by id) from stock_lots s),'[]'::jsonb)
 ) inventory
) select inventory,md5(inventory::text) fingerprint from snapshot`;

// Privileged maintenance intake, deliberately separate from verified receiving:
// unknown-language cards enter quarantine with no approved price/publication.
// The original import rows remain traceable and cannot be received twice.
export function missingStockSql(input: {
  fileHash: string;
  fingerprint: string;
  plan: ReturnType<typeof planMissingStock>;
  rollback?: boolean;
}) {
  const payload = JSON.stringify({ ...input, rollback: undefined });
  const delimiter = "$vego_intake_payload$";
  if (payload.includes(delimiter))
    throw new Error("Unexpected SQL delimiter in source data");
  return `begin;
set local statement_timeout='60s';
lock table card_printings,listings,stock_lots,operation_import_batches,operation_import_rows in share row exclusive mode;
do $intake$
declare payload jsonb=${delimiter}${payload}${delimiter}::jsonb;
 batch uuid; source jsonb; normalized jsonb; group_data jsonb; printing uuid; listing uuid; qty integer;
 expected text; actual text; added integer=0; added_copies integer=0; source_rows integer[];
begin
 select fingerprint into actual from (${inventorySnapshotQuery}) checked;
 expected=payload->>'fingerprint';
 if actual<>expected then raise exception 'Inventory changed after comparison; rebuild the intake plan'; end if;
 if payload->>'fileHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid source hash'; end if;
 insert into operation_import_batches(name,file_hash,mode,receipt_reference)
 values('Collectr 2026-10-21 — nuevas variantes, revisión pendiente',payload->>'fileHash','receipt','missing-only/'||(payload->>'fileHash'))
 on conflict(file_hash,mode,receipt_reference) do nothing;
 select id into batch from operation_import_batches where file_hash=payload->>'fileHash' and mode='receipt' and receipt_reference='missing-only/'||(payload->>'fileHash') for update;
 for source in select value from jsonb_array_elements(payload->'plan'->'decisions') loop
  normalized=source->'row';
  insert into operation_import_rows(batch_id,row_number,raw,normalized,status,errors)
  values(batch,(normalized->>'rowNumber')::integer,normalized->'raw',normalized||jsonb_build_object('intakeDecision',source->>'decision','intakeReason',source->>'reason','existingListingIds',source->'existingIds'),
   case when source->>'decision' in ('existing','excluded') then 'skipped' else 'needs_review' end,
   coalesce(normalized->'errors','[]'::jsonb))
  on conflict(batch_id,row_number) do nothing;
 end loop;
 for group_data in select value from jsonb_array_elements(payload->'plan'->'groups') loop
  normalized=group_data->'row'; qty=(group_data->>'quantity')::integer;
  select array_agg(value::integer) into source_rows from jsonb_array_elements_text(group_data->'rows');
  if exists(select 1 from operation_import_rows where batch_id=batch and row_number=any(source_rows) and status in ('committed','skipped')) then
   if (select count(*) from operation_import_rows where batch_id=batch and row_number=any(source_rows) and status='committed')=cardinality(source_rows) then continue; end if;
   raise exception 'A source group was already handled differently';
  end if;
  if qty not between 1 and 100000 or jsonb_array_length(normalized->'errors')<>0 then raise exception 'Invalid provisional receipt'; end if;
  printing=(group_data->>'printingId')::uuid; listing=(group_data->>'listingId')::uuid;
  insert into card_printings(id,game,canonical_name,set_name,collector_number,language,catalog_source,external_card_id,set_code,treatment,kind,identity_verified,metadata)
  values(printing,normalized->>'game',normalized->>'name',normalized->>'setName',normalized->>'collectorNumber',normalized->>'language',coalesce(nullif(normalized->>'provider',''),'collectr'),nullif(normalized->>'externalId',''),normalized->'sourceCatalogEvidence'->>'setCode',normalized->>'treatment',normalized->>'kind',false,
   jsonb_build_object('source_format','collectr','original_data',normalized->'raw','source_file_sha256',payload->>'fileHash','source_import_batch_id',batch,'source_row_numbers',group_data->'rows','provisional_receipt',true,'source_catalog_evidence',normalized->'sourceCatalogEvidence','source_validation_errors',normalized->'sourceValidationErrors','pending_checks',normalized->'pendingChecks','source_market_price_snapshot',normalized->'sourceMarketPrice','source_price_override',normalized->'sourcePriceOverride'));
  insert into listings(id,card_printing_id,condition,finish,approved_price_crc,published,price_verified,cost_confirmed)
  values(listing,printing,normalized->>'condition',normalized->>'finish',0,false,false,false);
  insert into stock_lots(listing_id,location_code,quantity,quarantined,source_reference,cost_verified)
  values(listing,'UNASSIGNED',qty,true,batch::text,false);
  update listings set stock_revision=stock_revision+1 where id=listing;
  insert into inventory_events(listing_id,quantity_change,previous_quantity,new_quantity,reason,reference_number,location_code,details)
  values(listing,qty,0,qty,'Recepción CSV provisional: solo variantes ausentes',batch::text,'UNASSIGNED',jsonb_build_object('source_file_sha256',payload->>'fileHash','source_rows',group_data->'rows','quarantined',true));
  update operation_import_rows set status='committed',card_printing_id=printing,listing_id=listing,committed_at=now(),errors='[]'::jsonb,normalized=operation_import_rows.normalized||((group_data->'row')-'raw'-'rowNumber'-'quantity')||jsonb_build_object('provisionalReceipt',true)
   where batch_id=batch and row_number=any(source_rows);
  added=added+1; added_copies=added_copies+qty;
 end loop;
 if added>0 then
  perform log_operation('receive_missing_csv_stock',batch,jsonb_build_object('source_file_sha256',payload->>'fileHash','new_variants',added,'copies',added_copies,'language_policy','unconfirmed','quarantined',true,'published',false));
 end if;
end $intake$;
${input.rollback ? "rollback;" : "commit;"}
`;
}
