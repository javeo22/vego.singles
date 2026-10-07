import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCandidates, type CatalogCard, type ImportRow } from "./imports";
import { CoverageError, searchCatalog } from "./providers";
import { checkMarketPrice, referenceToQuote } from "./market-sources";
type Job = {
  id: string;
  kind: string;
  entity_id: string;
  lease_token: string;
  attempts: number;
};
async function rpc(db: SupabaseClient, action: string, payload: unknown) {
  const { data, error } = await db.rpc("admin_command", {
    p_action: action,
    p_payload: payload,
    p_key: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function runNextJob(
  db: SupabaseClient,
  request: typeof fetch = fetch,
) {
  const job = (await rpc(db, "claim_job", {})) as Job | null;
  if (!job) return { message: "No hay trabajos listos" };
  try {
    if (job.kind === "match_import") {
      const rowResult = await db
        .from("operation_import_rows")
        .select("*")
        .eq("id", job.entity_id)
        .single();
      if (rowResult.error) throw new Error("No se pudo cargar la fila");
      const row = rowResult.data.normalized as ImportRow;
      if (rowResult.data.status !== "needs_review") {
        await rpc(db, "finish_job", {
          id: job.id,
          token: job.lease_token,
          status: "succeeded",
          result: { message: "Fila ya revisada" },
        });
        return { message: "Fila ya revisada" };
      }
      const aliases = await db
        .from("catalog_aliases")
        .select("canonical_set")
        .eq("game", row.game)
        .eq("language", row.language)
        .eq("input_set", row.setName.toLowerCase());
      const setName = aliases.data?.[0]?.canonical_set || row.setName;
      const local = await db.rpc("catalog_candidates", {
        p_game: row.game,
        p_set: setName,
        p_number: row.collectorNumber,
        p_provider: row.provider,
        p_external_id: row.externalId,
      });
      if (local.error) throw new Error("No se pudo cargar el catálogo local");
      const cards = (local.data || []) as CatalogCard[];
      const match = matchCandidates({ ...row, setName }, cards);
      if (match.automatic) {
        await rpc(db, "finish_job", {
          id: job.id,
          token: job.lease_token,
          status: "succeeded",
          automatic: match.automatic.id,
          candidates: match.candidates,
          result: { message: "Coincidencia exacta verificada" },
        });
      } else {
        let candidates = match.candidates;
        let note = "Selecciona y confirma la impresión exacta";
        if (!candidates.length)
          try {
            candidates = await searchCatalog({ ...row, setName }, request);
          } catch (e) {
            if (e instanceof CoverageError) note = e.message;
            else throw e;
          }
        await rpc(db, "finish_job", {
          id: job.id,
          token: job.lease_token,
          status: "needs_review",
          candidates,
          result: { message: note },
        });
      }
    } else {
      const result = await db
        .from("operations_inventory")
        .select("*")
        .eq("listing_id", job.entity_id)
        .single();
      if (result.error) throw new Error("No se pudo cargar el listado");
      const l = result.data;
      if (l.archived_at) throw new CoverageError("Listado archivado");
      if (!l.identity_verified)
        throw new CoverageError(
          "Verifica identidad antes de consultar mercado",
        );
      if (l.price_locked_until && Date.parse(l.price_locked_until) > Date.now())
        throw new CoverageError("Precio bloqueado por decisión manual");
      const settings = await db
        .from("operation_settings")
        .select("policy")
        .single();
      if (settings.error) throw new Error("No se pudo consultar la política");
      const verification = {
        ...(await checkMarketPrice(
          l,
          l.condition,
          l.finish,
          request,
          settings.data.policy.maxAgeHours,
        )),
        jobId: job.id,
      };
      const selected = verification.references.find(
        (r) => r.id === verification.recommendedId,
      );
      const quote = selected
        ? {
            ...referenceToQuote(selected),
            priceCheckId: job.id,
            priceReferenceId: selected.id,
          }
        : null;
      await rpc(db, "finish_job", {
        id: job.id,
        token: job.lease_token,
        status: "needs_review",
        result: {
          quote,
          verification,
          message: quote
            ? "Referencia contrastada. Confirma condición y variante antes de calcular."
            : "La consulta necesita revisión. Comprueba cobertura, fechas y coincidencia exacta.",
        },
      });
    }
    return { message: "Trabajo procesado" };
  } catch (e) {
    const coverage = e instanceof CoverageError;
    await rpc(db, "finish_job", {
      id: job.id,
      token: job.lease_token,
      status: coverage
        ? "needs_review"
        : job.attempts >= 5
          ? "failed"
          : "pending",
      error: coverage
        ? e.message
        : "No se pudo conectar o validar la respuesta del proveedor",
      result: coverage ? { message: e.message } : null,
    });
    return {
      message: coverage
        ? e.message
        : "El proveedor no respondió. El trabajo quedó para reintentar.",
    };
  }
}
