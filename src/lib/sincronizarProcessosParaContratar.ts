import { supabase } from "@/integrations/supabase/client";

export interface VencedorParaContratar {
  fornecedorId: string;
  fornecedorNome: string;
  valorAprovado: number;
}

interface SincronizarProcessosParaContratarInput {
  processoCompraId: string;
  contratoGestaoId: string;
  numeroProcesso: string;
  tipoProcesso: string;
  dataFinalizacaoIso: string;
  objeto: string;
  contaGerencial?: string | null;
  urlDossie?: string | null;
  valorGenerico?: number | null;
  vencedores: VencedorParaContratar[];
}

interface ProcessoParaContratarExistente {
  id: string;
  fornecedor_vencedor_id: string | null;
}

export async function sincronizarProcessosParaContratarAposFinalizacao({
  processoCompraId,
  contratoGestaoId,
  numeroProcesso,
  tipoProcesso,
  dataFinalizacaoIso,
  objeto,
  contaGerencial = null,
  urlDossie = null,
  valorGenerico = null,
  vencedores,
}: SincronizarProcessosParaContratarInput): Promise<{
  fornecedoresIgnoradosPorContrato: number;
  registrosSincronizados: number;
  registroGenericoSincronizado: boolean;
}> {
  const { data: ppcExistentes, error: ppcError } = await supabase
    .from("processos_para_contratar")
    .select("id, fornecedor_vencedor_id")
    .eq("processo_compra_id", processoCompraId);

  if (ppcError) throw ppcError;

  const registrosExistentes = (ppcExistentes || []) as ProcessoParaContratarExistente[];
  const ppcIds = registrosExistentes.map((r) => r.id);

  let idsComContrato = new Set<string>();
  if (ppcIds.length > 0) {
    const { data: contratosExistentes, error: contratosError } = await supabase
      .from("contratos_terceiros")
      .select("processo_para_contratar_id")
      .in("processo_para_contratar_id", ppcIds);

    if (contratosError) throw contratosError;

    idsComContrato = new Set((contratosExistentes || []).map((c) => c.processo_para_contratar_id));
  }

  const fornecedoresComContratoAtivo = new Set<string>();
  registrosExistentes.forEach((registro) => {
    if (registro.fornecedor_vencedor_id && idsComContrato.has(registro.id)) {
      fornecedoresComContratoAtivo.add(registro.fornecedor_vencedor_id);
    }
  });

  if (vencedores.length > 0) {
    const registrosParaSincronizar = vencedores
      .filter((vencedor) => !fornecedoresComContratoAtivo.has(vencedor.fornecedorId))
      .map((vencedor) => ({
        processo_compra_id: processoCompraId,
        contrato_gestao_id: contratoGestaoId,
        numero_processo: numeroProcesso,
        tipo_processo: tipoProcesso,
        data_finalizacao: dataFinalizacaoIso,
        fornecedor_vencedor_nome: vencedor.fornecedorNome,
        fornecedor_vencedor_id: vencedor.fornecedorId,
        objeto,
        valor_aprovado: vencedor.valorAprovado,
        conta_gerencial: contaGerencial,
        url_dossie: urlDossie,
        status: "pronto_para_contratar",
      }));

    if (registrosParaSincronizar.length > 0) {
      const { error: upsertError } = await supabase
        .from("processos_para_contratar")
        .upsert(registrosParaSincronizar, {
          onConflict: "processo_compra_id,fornecedor_vencedor_id",
          ignoreDuplicates: false,
        });

      if (upsertError) throw upsertError;
    }

    return {
      fornecedoresIgnoradosPorContrato: fornecedoresComContratoAtivo.size,
      registrosSincronizados: registrosParaSincronizar.length,
      registroGenericoSincronizado: false,
    };
  }

  if (fornecedoresComContratoAtivo.size > 0) {
    return {
      fornecedoresIgnoradosPorContrato: fornecedoresComContratoAtivo.size,
      registrosSincronizados: 0,
      registroGenericoSincronizado: false,
    };
  }

  const registroGenericoExistente = registrosExistentes.find((r) => !r.fornecedor_vencedor_id);
  const genericoTemContrato = !!registroGenericoExistente && idsComContrato.has(registroGenericoExistente.id);

  if (genericoTemContrato) {
    return {
      fornecedoresIgnoradosPorContrato: fornecedoresComContratoAtivo.size,
      registrosSincronizados: 0,
      registroGenericoSincronizado: false,
    };
  }

  const payloadGenerico = {
    processo_compra_id: processoCompraId,
    contrato_gestao_id: contratoGestaoId,
    numero_processo: numeroProcesso,
    tipo_processo: tipoProcesso,
    data_finalizacao: dataFinalizacaoIso,
    fornecedor_vencedor_nome: null,
    fornecedor_vencedor_id: null,
    objeto,
    valor_aprovado: valorGenerico,
    conta_gerencial: contaGerencial,
    url_dossie: urlDossie,
    status: "pronto_para_contratar",
  };

  if (registroGenericoExistente) {
    const { error: updateError } = await supabase
      .from("processos_para_contratar")
      .update(payloadGenerico)
      .eq("id", registroGenericoExistente.id);

    if (updateError) throw updateError;

    return {
      fornecedoresIgnoradosPorContrato: fornecedoresComContratoAtivo.size,
      registrosSincronizados: 0,
      registroGenericoSincronizado: true,
    };
  }

  const { error: insertError } = await supabase
    .from("processos_para_contratar")
    .insert(payloadGenerico);

  if (insertError) throw insertError;

  return {
    fornecedoresIgnoradosPorContrato: fornecedoresComContratoAtivo.size,
    registrosSincronizados: 0,
    registroGenericoSincronizado: true,
  };
}
