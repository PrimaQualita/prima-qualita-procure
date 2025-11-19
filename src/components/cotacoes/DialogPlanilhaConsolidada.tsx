// @ts-nocheck - Tabelas de planilhas podem não existir no schema atual
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import { gerarPlanilhaConsolidadaPDF } from "@/lib/gerarPlanilhaConsolidadaPDF";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DialogPlanilhaConsolidadaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  criterioJulgamento: string;
  onPlanilhaGerada?: () => void;
}

interface RespostaConsolidada {
  fornecedor: {
    razao_social: string;
    cnpj: string;
    email: string;
  };
  itens: {
    numero_item: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario_ofertado: number;
    lote_id: string | null;
    lote_numero?: number;
    lote_descricao?: string;
    marca?: string;
  }[];
  valor_total: number;
  rejeitado?: boolean;
  motivo_rejeicao?: string;
}

export function DialogPlanilhaConsolidada({
  open,
  onOpenChange,
  cotacaoId,
  criterioJulgamento,
  onPlanilhaGerada,
}: DialogPlanilhaConsolidadaProps) {
  const [respostas, setRespostas] = useState<RespostaConsolidada[]>([]);
  const [loading, setLoading] = useState(true);
  // Usa automaticamente o critério de julgamento da cotação
  const tipoVisualizacao = criterioJulgamento === "por_lote" ? "lote" : criterioJulgamento === "global" ? "global" : "item";
  const [calculosPorItem, setCalculosPorItem] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculosPorLote, setCalculosPorLote] = useState<Record<string, "media" | "mediana" | "menor">>({});
  const [calculoGlobal, setCalculoGlobal] = useState<"media" | "mediana" | "menor">("menor");
  const [todosItens, setTodosItens] = useState<any[]>([]);
  const [tipoProcesso, setTipoProcesso] = useState<string>("");
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
    }
  }, [open, cotacaoId]);

  const loadRespostas = async () => {
    setLoading(true);
    try {
      // Buscar informações da cotação e do processo
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select(`
          processo_compra_id,
          processos_compras!inner (
            tipo
          )
        `)
        .eq("id", cotacaoId)
        .single();

      if (cotacaoData?.processos_compras) {
        setTipoProcesso(cotacaoData.processos_compras.tipo);
      }

      // Buscar APENAS a análise de compliance mais recente
      const { data: analiseMaisRecente } = await supabase
        .from("analises_compliance" as any)
        .select("empresas_reprovadas")
        .eq("cotacao_id", cotacaoId)
        .order("data_analise", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cnpjsReprovados = new Set<string>();
      if (analiseMaisRecente?.empresas_reprovadas) {
        analiseMaisRecente.empresas_reprovadas.forEach((cnpj: string) => {
          cnpjsReprovados.add(cnpj);
        });
      }

      console.log("CNPJs reprovados na análise mais recente:", Array.from(cnpjsReprovados));

      const { data: respostasData, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          valor_total_anual_ofertado,
          rejeitado,
          motivo_rejeicao,
          fornecedor:fornecedor_id (
            razao_social,
            cnpj,
            email
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (error) throw error;

      // Buscar TODOS os itens da cotação (não das respostas)
      const { data: todosItensData } = await supabase
        .from("itens_cotacao")
        .select(`
          id,
          numero_item,
          descricao,
          quantidade,
          unidade,
          marca,
          lote_id,
          lotes_cotacao (
            numero_lote,
            descricao_lote
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("numero_item");
      
      // Formatar os dados dos itens com informações do lote
      const itensFormatados = (todosItensData || []).map((item: any) => ({
        ...item,
        numero_lote: item.lotes_cotacao?.numero_lote,
        descricao_lote: item.lotes_cotacao?.descricao_lote
      }));

      const respostasCompletas: RespostaConsolidada[] = [];

      for (const resposta of respostasData || []) {
        const cnpjFornecedor = resposta.fornecedor?.cnpj || "";
        const foiReprovada = cnpjsReprovados.has(cnpjFornecedor);
        
        // FILTRAR empresas reprovadas na análise mais recente
        if (foiReprovada) {
          console.log(`Empresa ${resposta.fornecedor?.razao_social} (${cnpjFornecedor}) foi reprovada na análise mais recente - EXCLUÍDA da planilha`);
          continue; // Pula esta empresa
        }

        const { data: itensData } = await supabase
          .from("respostas_itens_fornecedor")
          .select(`
            valor_unitario_ofertado,
            marca,
            item_cotacao:item_cotacao_id (
              id,
              numero_item,
              descricao,
              quantidade,
              unidade,
              lote_id,
              lote:lote_id (
                numero_lote,
                descricao_lote
              )
            )
          `)
          .eq("cotacao_resposta_fornecedor_id", resposta.id);

        console.log(`📦 Itens do fornecedor ${resposta.fornecedor.razao_social}:`, itensData);
        console.log(`🏷️ Marcas encontradas:`, itensData?.map((i: any) => ({ item: i.item_cotacao.numero_item, marca: i.marca })));

        const itensFormatadosFornecedor = (itensData || []).map((item: any) => ({
          numero_item: item.item_cotacao.numero_item,
          descricao: item.item_cotacao.descricao,
          quantidade: item.item_cotacao.quantidade,
          unidade: item.item_cotacao.unidade,
          marca: item.marca,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          lote_id: item.item_cotacao.lote_id,
          lote_numero: item.item_cotacao.lote?.numero_lote,
          lote_descricao: item.item_cotacao.lote?.descricao_lote,
        })).sort((a, b) => a.numero_item - b.numero_item);

        console.log(`✅ Itens formatados para ${resposta.fornecedor.razao_social}:`, itensFormatadosFornecedor);

        respostasCompletas.push({
          fornecedor: resposta.fornecedor as any,
          itens: itensFormatadosFornecedor,
          valor_total: resposta.valor_total_anual_ofertado,
          rejeitado: resposta.rejeitado || foiReprovada, // Marcar como rejeitada se foi reprovada antes
          motivo_rejeicao: resposta.motivo_rejeicao || (foiReprovada ? 'Reprovada em análise anterior' : undefined),
        });
      }

      setRespostas(respostasCompletas);
      
      // Inicializar apenas empresas NÃO reprovadas como selecionadas
      const empresasNaoRejeitadas = new Set(
        respostasCompletas
          .filter(r => !cnpjsReprovados.has(r.fornecedor.cnpj))
          .map(r => r.fornecedor.razao_social)
      );
      setEmpresasSelecionadas(empresasNaoRejeitadas);
      
      // Armazenar TODOS os itens da cotação para usar na configuração
      setTodosItens(itensFormatados || []);
      
      // Inicializar cálculos com "menor" para TODOS os itens da cotação
      // Usar chave composta "loteId_itemId" para diferenciar itens de lotes diferentes
      if (itensFormatados && itensFormatados.length > 0) {
        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
        itensFormatados.forEach((item: any) => {
          const chave = `${item.lote_id || 'sem-lote'}_${item.id}`;
          novosCalculos[chave] = "menor";
        });
        setCalculosPorItem(novosCalculos as any);

        // Inicializar cálculos por lote se aplicável
        if (criterioJulgamento === "por_lote") {
          const lotes = new Set<string>();
          itensFormatados.forEach((item: any) => {
            if (item.lote_id) lotes.add(item.lote_id);
          });
          const novosCalculosLote: Record<string, "media" | "mediana" | "menor"> = {};
          lotes.forEach(loteId => {
            novosCalculosLote[loteId] = "menor";
          });
          setCalculosPorLote(novosCalculosLote);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  const calcularEstatisticas = (valores: number[]) => {
    if (valores.length === 0) return { media: 0, mediana: 0, menor: 0 };

    const menor = Math.min(...valores);
    const soma = valores.reduce((a, b) => a + b, 0);
    const media = Math.round((soma / valores.length) * 100) / 100; // Arredondar para 2 casas
    
    const valoresOrdenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(valoresOrdenados.length / 2);
    const medianaCalc = valoresOrdenados.length % 2 === 0
      ? (valoresOrdenados[meio - 1] + valoresOrdenados[meio]) / 2
      : valoresOrdenados[meio];
    const mediana = Math.round(medianaCalc * 100) / 100; // Arredondar para 2 casas

    return { media, mediana, menor };
  };

  const gerarPlanilha = async () => {
    try {
      console.log('🚀 Iniciando geração da planilha consolidada...');
      
      // Buscar dados do processo e da cotação
      const { data: cotacaoData } = await supabase
        .from('cotacoes_precos')
        .select(`
          id,
          titulo_cotacao,
          processos_compras!inner (
            numero_processo_interno,
            objeto_resumido
          )
        `)
        .eq('id', cotacaoId)
        .single();

      if (!cotacaoData) {
        throw new Error('Cotação não encontrada');
      }

      // Buscar dados do usuário
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from('profiles')
        .select('nome_completo, cpf')
        .eq('id', userData.user!.id)
        .single();

      if (!profileData) {
        throw new Error('Perfil do usuário não encontrado');
      }

      // Gerar protocolo único
      const protocolo = uuidv4();

      // Preparar dados dos itens
      const itensFormatados = todosItens.map(item => ({
        numero_item: item.numero_item,
        descricao: stripHtml(item.descricao),
        quantidade: item.quantidade,
        unidade: item.unidade,
        lote_numero: item.lote?.numero_lote,
        lote_descricao: item.lote?.descricao_lote
      }));

      // Preparar dados das respostas (apenas fornecedores selecionados)
      const respostasFiltradas = respostas.filter(r => empresasSelecionadas.has(r.fornecedor.cnpj));
      const respostasFormatadas = respostasFiltradas.map(resposta => ({
        fornecedor: {
          razao_social: resposta.fornecedor.razao_social,
          cnpj: resposta.fornecedor.cnpj,
          email: resposta.fornecedor.email
        },
        itens: resposta.itens.map(item => ({
          numero_item: item.numero_item,
          valor_unitario_ofertado: item.valor_unitario_ofertado,
          marca: item.marca
        })),
        valor_total: resposta.valor_total
      }));

      console.log('📊 Gerando PDF com:', {
        itens: itensFormatados.length,
        respostas: respostasFormatadas.length
      });

      // Gerar o PDF usando a função correta
      const pdfBlob = await gerarPlanilhaConsolidadaPDF(
        {
          numero: cotacaoData.processos_compras.numero_processo_interno,
          objeto: cotacaoData.processos_compras.objeto_resumido
        },
        {
          titulo_cotacao: cotacaoData.titulo_cotacao
        },
        itensFormatados,
        respostasFormatadas,
        {
          protocolo,
          usuario: {
            nome_completo: profileData.nome_completo,
            cpf: profileData.cpf
          }
        }
      );

      // Salvar no storage
      const nomeArquivo = `planilha_consolidada_${cotacaoId}_${Date.now()}.pdf`;
      const filePath = `${cotacaoId}/${nomeArquivo}`;

      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(filePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Registrar no banco de dados
      const { data: { user } } = await supabase.auth.getUser();
      
      // Coletar CNPJs dos fornecedores incluídos na planilha (empresas selecionadas)
      const cnpjsIncluidos = respostas
        .filter(r => empresasSelecionadas.has(r.fornecedor.razao_social))
        .map(r => r.fornecedor.cnpj);
      
      console.log("💾 Salvando planilha com fornecedores incluídos:", cnpjsIncluidos);
      
      const { error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .insert({
          cotacao_id: cotacaoId,
          nome_arquivo: nomeArquivo,
          url_arquivo: filePath,
          usuario_gerador_id: user?.id,
          data_geracao: new Date().toISOString(),
          protocolo: protocoloDocumento,
          fornecedores_incluidos: cnpjsIncluidos
        });

      if (dbError) throw dbError;

      // CRÍTICO: Invalidar todas as aprovações de documentos ao gerar nova planilha
      console.log("🔄 Invalidando aprovações anteriores de documentos...");
      
      // PRIMEIRO: Buscar IDs dos campos antes de deletar
      const { data: campos } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id")
        .eq("cotacao_id", cotacaoId);
      
      // SEGUNDO: Deletar documentos enviados pelos fornecedores
      if (campos && campos.length > 0) {
        const campoIds = campos.map(c => c.id);
        const { error: deleteDocsError } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .delete()
          .in("campo_documento_id", campoIds);
        
        if (deleteDocsError) {
          console.error("Erro ao limpar documentos enviados:", deleteDocsError);
        } else {
          console.log("✅ Documentos enviados por fornecedores invalidados");
        }
      }

      // TERCEIRO: Deletar solicitações de documentos de finalizacao
      const { error: deleteError } = await supabase
        .from("campos_documentos_finalizacao")
        .delete()
        .eq("cotacao_id", cotacaoId);
      
      if (deleteError) {
        console.error("Erro ao limpar aprovações:", deleteError);
        toast.error("Atenção: Não foi possível limpar aprovações anteriores");
      } else {
        console.log("✅ Solicitações de documentos invalidadas");
      }

      console.log("✅ Todas as aprovações anteriores invalidadas com sucesso");

      toast.success("Planilha consolidada gerada com sucesso!");
      
      // Chamar callback se fornecido
      if (onPlanilhaGerada) {
        onPlanilhaGerada();
      }
      
      // Fechar diálogo
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao gerar planilha:", error);
      toast.error("Erro ao gerar planilha consolidada");
    }
  };

  // Obter lista de TODOS os itens da cotação do state
  const itensUnicos = todosItens.sort((a, b) => a.numero_item - b.numero_item);

  // Obter lotes únicos de TODOS os itens
  const lotesUnicos = todosItens.length > 0 && criterioJulgamento === "por_lote"
    ? (() => {
        const lotesMap = new Map<string, any>();
        todosItens
          .filter((i: any) => i.lote_id)
          .forEach((i: any) => {
            if (!lotesMap.has(i.lote_id!)) {
              lotesMap.set(i.lote_id!, { 
                id: i.lote_id!, 
                numero: i.numero_lote || 0, 
                descricao: i.descricao_lote || ""
              });
            }
          });
        return Array.from(lotesMap.values()).sort((a, b) => a.numero - b.numero);
      })()
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Gerar Planilha Consolidada para Seleção</DialogTitle>
          <DialogDescription>
            Configure os parâmetros de cálculo para cada item ou lote
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-4">
            {/* Campo "Tipo de Visualização" removido - usa automaticamente o critério de julgamento */}

            {tipoVisualizacao === "global" && (
              <div className="space-y-2">
                <Label>Tipo de Cálculo Global</Label>
                <Select value={calculoGlobal} onValueChange={(v: "media" | "mediana" | "menor") => setCalculoGlobal(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menor">Menor Preço</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="mediana">Mediana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {tipoVisualizacao === "lote" && criterioJulgamento === "por_lote" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Configurar Cálculo por Lote</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Aplicar para todos:</Label>
                    <Select 
                      value="" 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
                        lotesUnicos.forEach(lote => {
                          novosCalculos[lote.id] = v;
                        });
                        setCalculosPorLote(novosCalculos);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {lotesUnicos.map((lote) => (
                  <div key={lote.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Lote {lote.numero}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{lote.descricao}</p>
                    </div>
                    <Select 
                      value={calculosPorLote[lote.id] || "menor"} 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        setCalculosPorLote(prev => ({ ...prev, [lote.id]: v }));
                      }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {tipoVisualizacao === "item" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Configurar Cálculo por Item</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Aplicar para todos:</Label>
                    <Select 
                      value="" 
                      onValueChange={(v: "media" | "mediana" | "menor") => {
                        const novosCalculos: Record<string, "media" | "mediana" | "menor"> = {};
                        todosItens.forEach((item: any) => {
                          const chave = `${item.lote_id || 'sem-lote'}_${item.id}`;
                          novosCalculos[chave] = v;
                        });
                        setCalculosPorItem(novosCalculos as any);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor">Menor Preço</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {itensUnicos.map((item) => {
                  const chaveItem = `${item.lote_id || 'sem-lote'}_${item.id}`;
                  return (
                    <div key={chaveItem} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm">Item {item.numero_item}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{stripHtml(item.descricao)}</p>
                        {item.lote_id && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Lote {item.numero_lote}: {item.descricao_lote}
                          </p>
                        )}
                      </div>
                      <Select 
                        value={calculosPorItem[chaveItem] || "menor"} 
                        onValueChange={(v: "media" | "mediana" | "menor") => {
                          setCalculosPorItem(prev => ({ ...prev, [chaveItem]: v }));
                        }}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="menor">Menor Preço</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="mediana">Mediana</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Seleção de Empresas */}
            <div className="space-y-3 mt-6 p-4 border rounded-lg bg-muted/30">
              <Label className="text-base font-semibold">Selecionar Empresas para Planilha</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Marque as empresas que devem aparecer na planilha consolidada. Empresas reprovadas estão desmarcadas por padrão.
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {respostas.map((resposta, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 border rounded">
                    <input
                      type="checkbox"
                      id={`empresa-${idx}`}
                      checked={empresasSelecionadas.has(resposta.fornecedor.razao_social)}
                      onChange={(e) => {
                        const novaSelecao = new Set(empresasSelecionadas);
                        if (e.target.checked) {
                          novaSelecao.add(resposta.fornecedor.razao_social);
                        } else {
                          novaSelecao.delete(resposta.fornecedor.razao_social);
                        }
                        setEmpresasSelecionadas(novaSelecao);
                      }}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`empresa-${idx}`} className="flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{resposta.fornecedor.razao_social}</span>
                      {resposta.rejeitado && (
                        <span className="ml-2 text-xs text-red-600">(Reprovada)</span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        CNPJ: {resposta.fornecedor.cnpj}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Empresas selecionadas:</strong> {empresasSelecionadas.size} de {respostas.length} fornecedor(es)
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Configure o tipo de cálculo e selecione as empresas antes de gerar a planilha.
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={gerarPlanilha} disabled={loading || respostas.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Gerar Planilha
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}