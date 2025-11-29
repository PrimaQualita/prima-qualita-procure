// @ts-nocheck - Tabelas de processos podem não existir no schema atual
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown, Mail, Trash2, FileSpreadsheet, Eye, Download, Send, FileText } from "lucide-react";
import { toast } from "sonner";
import { gerarEncaminhamentoPDF } from '@/lib/gerarEncaminhamentoPDF';
import { gerarPropostaFornecedorPDF } from '@/lib/gerarPropostaFornecedorPDF';
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { stripHtml } from "@/lib/htmlUtils";
import { DialogPlanilhaConsolidada } from "./DialogPlanilhaConsolidada";
import { v4 as uuidv4 } from 'uuid';

interface DialogRespostasCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  tituloCotacao: string;
  criterioJulgamento: string;
  requerSelecao: boolean;
}

interface ItemResposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
}

interface RespostaFornecedor {
  id: string;
  valor_total_anual_ofertado: number;
  observacoes_fornecedor: string | null;
  data_envio_resposta: string;
  usuario_gerador_id?: string | null;
  comprovantes_urls?: string[] | null;
  fornecedor: {
    razao_social: string;
    cnpj: string;
    endereco_comercial: string;
  };
  anexos?: Array<{
    id: string;
    nome_arquivo: string;
    url_arquivo: string;
    tipo_anexo: string;
  }>;
}

export function DialogRespostasCotacao({
  open,
  onOpenChange,
  cotacaoId,
  tituloCotacao,
  criterioJulgamento,
  requerSelecao,
}: DialogRespostasCotacaoProps) {
  const [respostas, setRespostas] = useState<RespostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [processoNumero, setProcessoNumero] = useState("");
  const [processoObjeto, setProcessoObjeto] = useState("");
  const [emailCorrecaoOpen, setEmailCorrecaoOpen] = useState(false);
  const [respostaSelecionada, setRespostaSelecionada] = useState<RespostaFornecedor | null>(null);
  const [emailTexto, setEmailTexto] = useState("");
  const [planilhaConsolidadaOpen, setPlanilhaConsolidadaOpen] = useState(false);
  const [planilhaGerada, setPlanilhaGerada] = useState<any>(null);
  const [planilhasAnteriores, setPlanilhasAnteriores] = useState<any[]>([]);
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);
  const [enviandoCompliance, setEnviandoCompliance] = useState(false);
  const [encaminhamentos, setEncaminhamentos] = useState<any[]>([]);
  const [gerandoEncaminhamento, setGerandoEncaminhamento] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  const [analiseCompliance, setAnaliseCompliance] = useState<any>(null);
  const [analisesAnteriores, setAnalisesAnteriores] = useState<any[]>([]);
  const [empresasAprovadas, setEmpresasAprovadas] = useState<string[]>([]);
  const [empresasReprovadas, setEmpresasReprovadas] = useState<string[]>([]);

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
      loadPlanilhaGerada();
      loadEncaminhamento();
      loadAnaliseCompliance();

      // Listener realtime para atualizar quando análises são deletadas/criadas
      const channel = supabase
        .channel('analises-compliance-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'analises_compliance',
            filter: `cotacao_id=eq.${cotacaoId}`
          },
          (payload) => {
            console.log('Mudança em análise de compliance:', payload);
            loadAnaliseCompliance();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, cotacaoId]);

  const loadAnaliseCompliance = async () => {
    try {
      console.log('Carregando análises de compliance para cotação:', cotacaoId);
      
      // Buscar TODAS as análises ordenadas por data
      const { data: analises } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false });
      
      console.log('Análises encontradas:', analises?.length || 0);
      
      if (analises && analises.length > 0) {
        // A mais recente
        const maisRecente = analises[0];
        setAnaliseCompliance(maisRecente);
        
        // Carregar empresas da análise mais recente
        const empresas = maisRecente.empresas as any[];
        const aprovadas = empresas
          .filter((emp: any) => emp.aprovado === true)
          .map((emp: any) => emp.razao_social);
        const reprovadas = empresas
          .filter((emp: any) => emp.aprovado === false)
          .map((emp: any) => emp.razao_social);
        
        setEmpresasAprovadas(aprovadas);
        setEmpresasReprovadas(reprovadas);

        // Guardar todas as análises (incluindo a mais recente)
        setAnalisesAnteriores(analises);
      } else {
        // Limpar estados quando não há análises
        console.log('Nenhuma análise encontrada - limpando estados');
        setAnaliseCompliance(null);
        setEmpresasAprovadas([]);
        setEmpresasReprovadas([]);
        setAnalisesAnteriores([]);
      }
    } catch (error) {
      console.error("Erro ao carregar análise de compliance:", error);
    }
  };

  const loadPlanilhaGerada = async () => {
    try {
      console.log('🔄 Carregando planilhas geradas para cotação:', cotacaoId);
      
      // Buscar TODAS as planilhas ordenadas por data de geração (mais recente primeiro)
      const { data, error } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false });
      
      if (error) {
        console.error('❌ Erro ao carregar planilhas:', error);
        throw error;
      }
      
      if (data && data.length > 0) {
        // Guardar TODAS as planilhas (sem separar)
        setPlanilhasAnteriores(data);
        console.log('📄 Planilhas consolidadas encontradas:', data.length);
      } else {
        setPlanilhasAnteriores([]);
      }
    } catch (error) {
      console.error("Erro ao carregar planilhas:", error);
    }
  };

  const loadEncaminhamento = async () => {
    try {
      console.log('🔄 Carregando encaminhamentos para cotação:', cotacaoId);
      
      const { data, error } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error('❌ Erro ao carregar encaminhamentos:', error);
        throw error;
      }
      
      console.log('📄 Encaminhamentos encontrados:', data?.length || 0, data);
      setEncaminhamentos(data || []);
    } catch (error) {
      console.error("Erro ao carregar encaminhamentos:", error);
    }
  };

  const gerarPlanilhaConsolidada = () => {
    setPlanilhaConsolidadaOpen(true);
  };

  const handlePlanilhaGerada = () => {
    // Recarregar a lista de planilhas após gerar uma nova
    loadPlanilhaGerada();
  };

  // Função auxiliar para gerar o HTML da planilha
  const gerarHTMLPlanilha = (respostas: any[], itens: any[]) => {
    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; }
          </style>
        </head>
        <body>
          <h2>Planilha Consolidada de Propostas</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Unidade</th>
                ${respostas.map(r => `<th>${r.fornecedor.razao_social}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${itens.map(item => `
                <tr>
                  <td>${item.numero_item}</td>
                  <td>${item.descricao}</td>
                  <td>${item.quantidade}</td>
                  <td>${item.unidade}</td>
                  ${respostas.map(r => {
                    const itemResp = r.itens.find((i: any) => i.numero_item === item.numero_item);
                    return `<td>R$ ${itemResp?.valor_unitario_ofertado?.toFixed(2) || '0.00'}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
              <tr>
                <td colspan="4"><strong>TOTAL</strong></td>
                ${respostas.map(r => `<td><strong>R$ ${r.valor_total.toFixed(2)}</strong></td>`).join('')}
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  const enviarAoCompliance = async () => {
    try {
      setEnviandoCompliance(true);
      
      const { error } = await supabase
        .from('cotacoes_precos')
        .update({ 
          enviado_compliance: true,
          respondido_compliance: false, // Resetar para permitir novo parecer
          data_envio_compliance: new Date().toISOString()
        })
        .eq('id', cotacaoId);

      if (error) throw error;

      toast.success("Enviado ao Compliance com sucesso! Um novo parecer poderá ser realizado.");
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao enviar ao Compliance:', error);
      toast.error("Erro ao enviar ao Compliance");
    } finally {
      setEnviandoCompliance(false);
    }
  };

  const handleEncaminhamentoGerado = () => {
    // Recarregar a lista de encaminhamentos após gerar um novo
    loadEncaminhamento();
  };

  const gerarEncaminhamento = async () => {
    if (!processoNumero || !processoObjeto) {
      toast.error("Informações do processo não encontradas");
      return;
    }

    try {
      setGerandoEncaminhamento(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('nome_completo, cpf')
        .eq('id', user.id)
        .single();

      if (perfilError || !perfil) {
        toast.error("Perfil não encontrado");
        return;
      }

      const resultado = await gerarEncaminhamentoPDF(
        processoNumero,
        processoObjeto,
        perfil.nome_completo,
        perfil.cpf
      );

      console.log('📄 PDF gerado:', resultado);

      // Salvar no banco
      const { data: insertData, error: dbError } = await supabase
        .from('encaminhamentos_processo')
        .insert({
          cotacao_id: cotacaoId,
          processo_numero: processoNumero,
          protocolo: resultado.protocolo,
          storage_path: resultado.storagePath,
          url: resultado.url,
          gerado_por: user.id,
          nome_arquivo: resultado.fileName
        })
        .select();

      console.log('💾 Resultado do INSERT:', { data: insertData, error: dbError });

      if (dbError) {
        console.error('❌ Erro ao salvar no banco:', dbError);
        throw dbError;
      }

      console.log('✅ Encaminhamento salvo no banco, recarregando lista...');
      toast.success("Encaminhamento gerado com sucesso!");
      await loadEncaminhamento();
    } catch (error) {
      console.error('❌ Erro ao gerar encaminhamento:', error);
      toast.error("Erro ao gerar encaminhamento");
    } finally {
      setGerandoEncaminhamento(false);
    }
  };


  const excluirEncaminhamento = async () => {
    if (!encaminhamentoParaExcluir) return;
    
    try {
      const { error: storageError } = await supabase.storage
        .from("processo-anexos")
        .remove([encaminhamentoParaExcluir.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("encaminhamentos_processo")
        .delete()
        .eq("id", encaminhamentoParaExcluir.id);

      if (dbError) throw dbError;

      console.log('✅ Encaminhamento excluído, recarregando lista...');
      setEncaminhamentoParaExcluir(null);
      setConfirmDeleteEncaminhamentoOpen(false);
      await loadEncaminhamento();
      toast.success("Encaminhamento excluído com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir encaminhamento:", error);
      toast.error("Erro ao excluir encaminhamento");
    }
  };


  const excluirAnexo = async () => {
    if (!anexoParaExcluir) return;
    
    try {
      // Excluir do storage
      await supabase.storage
        .from('processo-anexos')
        .remove([anexoParaExcluir.url_arquivo]);
      
      // Excluir do banco
      const { error } = await supabase
        .from('anexos_cotacao_fornecedor')
        .delete()
        .eq('id', anexoParaExcluir.id);
      
      if (error) throw error;
      
      setConfirmDeleteAnexoOpen(false);
      setAnexoParaExcluir(null);
      toast.success('Anexo excluído com sucesso');
      loadRespostas();
    } catch (error) {
      console.error('Erro ao excluir anexo:', error);
      toast.error('Erro ao excluir anexo');
    }
  };
  
  const excluirPlanilha = async () => {
    if (!planilhaParaExcluir) return;
    
    try {
      const filePath = planilhaParaExcluir.url_arquivo;

      const { error: storageError } = await supabase.storage
        .from("processo-anexos")
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("planilhas_consolidadas")
        .delete()
        .eq("id", planilhaParaExcluir.id);

      if (dbError) throw dbError;

      // Limpar aprovações de documentos quando a planilha é excluída
      // Isso força nova verificação de documentos quando uma nova planilha for gerada
      const { error: clearDocsError } = await supabase
        .from("campos_documentos_finalizacao")
        .update({ 
          status_solicitacao: "pendente",
          data_aprovacao: null 
        })
        .eq("cotacao_id", cotacaoId)
        .in("status_solicitacao", ["aprovado", "em_analise"]);

      if (clearDocsError) {
        console.error("Erro ao limpar aprovações:", clearDocsError);
        // Não lançar erro aqui, pois a exclusão da planilha foi bem-sucedida
      }

      setPlanilhaParaExcluir(null);
      setConfirmDeletePlanilhaOpen(false);
      loadPlanilhaGerada();
      toast.success("Planilha excluída. As aprovações de documentos foram limpas para nova verificação.");
    } catch (error: any) {
      console.error("Erro ao excluir planilha:", error);
      toast.error("Erro ao excluir planilha");
    }
  };

  const excluirAnaliseCompliance = async () => {
    if (!analiseParaExcluir) return;
    
    try {
      // Remover arquivo do storage
      const fileName = analiseParaExcluir.url_documento?.split('/').pop();
      if (fileName) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove([`compliance/${fileName}`]);

        if (storageError) console.error("Erro ao excluir arquivo:", storageError);
      }

      const { error: dbError } = await supabase
        .from("analises_compliance")
        .delete()
        .eq("id", analiseParaExcluir.id);

      if (dbError) throw dbError;

      console.log("✅ [DialogRespostasCotacao] Análise deletada, resetando status...");

      // Resetar status de compliance quando análise é deletada
      const { error: updateError } = await supabase
        .from("cotacoes_precos")
        .update({
          respondido_compliance: false,
          enviado_compliance: false,
          data_resposta_compliance: null
        })
        .eq("id", cotacaoId);

      if (updateError) {
        console.error("❌ [DialogRespostasCotacao] Erro ao resetar status:", updateError);
        throw updateError;
      }

      console.log("✅ [DialogRespostasCotacao] Status resetado, cotacao_id:", cotacaoId);

      setAnaliseParaExcluir(null);
      setConfirmDeleteAnaliseOpen(false);
      loadAnaliseCompliance();
      toast.success("Análise de compliance excluída com sucesso");
    } catch (error: any) {
      console.error("Erro ao excluir análise:", error);
      toast.error("Erro ao excluir análise de compliance");
    }
  };


  const loadRespostas = async () => {
    setLoading(true);
    try {
      // Buscar cotação com processo
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select(`
          processos_compras:processo_compra_id (
            numero_processo_interno,
            objeto_resumido
          )
        `)
        .eq("id", cotacaoId)
        .single();

      if (cotacao) {
        setProcessoNumero((cotacao.processos_compras as any)?.numero_processo_interno || "");
        setProcessoObjeto((cotacao.processos_compras as any)?.objeto_resumido || "");
      }

      const { data, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id,
          valor_total_anual_ofertado,
          observacoes_fornecedor,
          data_envio_resposta,
          usuario_gerador_id,
          comprovantes_urls,
          fornecedor_id,
          fornecedores:fornecedor_id (
            razao_social,
            cnpj,
            endereco_comercial
          ),
          anexos:anexos_cotacao_fornecedor (
            id,
            nome_arquivo,
            url_arquivo,
            tipo_anexo
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: false });

      if (error) throw error;

      // Buscar IDs de fornecedores órfãos (quando o JOIN retornou null)
      const fornecedoresOrfaos = (data || [])
        .filter((r: any) => !r.fornecedores && r.fornecedor_id)
        .map((r: any) => r.fornecedor_id);

      // Buscar dados dos fornecedores órfãos diretamente
      let fornecedoresOrfaosData: any = {};
      if (fornecedoresOrfaos.length > 0) {
        const { data: fornecedoresReais } = await supabase
          .from("fornecedores")
          .select("id, razao_social, cnpj, endereco_comercial")
          .in("id", fornecedoresOrfaos);
        
        fornecedoresReais?.forEach((f: any) => {
          fornecedoresOrfaosData[f.id] = f;
        });
      }

      // Transformar dados
      const respostasFormatadas = (data || []).map((r: any) => {
        // Tentar pegar do JOIN ou buscar diretamente
        const fornecedorData = r.fornecedores || fornecedoresOrfaosData[r.fornecedor_id];
        
        return {
          id: r.id,
          valor_total_anual_ofertado: r.valor_total_anual_ofertado,
          observacoes_fornecedor: r.observacoes_fornecedor,
          data_envio_resposta: r.data_envio_resposta,
          usuario_gerador_id: r.usuario_gerador_id,
          comprovantes_urls: r.comprovantes_urls || [],
          fornecedor: {
            razao_social: fornecedorData?.razao_social || "N/A",
            cnpj: fornecedorData?.cnpj || "N/A",
            endereco_comercial: fornecedorData?.endereco_comercial || "",
          },
          anexos: r.anexos || [],
        };
      });

      setRespostas(respostasFormatadas);
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast.error("Erro ao carregar respostas");
    } finally {
      setLoading(false);
    }
  };

  const gerarESalvarPDFProposta = async (resposta: RespostaFornecedor) => {
    try {
      setGerandoPDF(resposta.id);
      
      // Buscar comprovantes pelas URLs salvas - COM LOG COMPLETO
      const comprovantes: File[] = [];
      
      console.log('=== INÍCIO RECUPERAÇÃO COMPROVANTES ===');
      console.log('Resposta ID:', resposta.id);
      console.log('Possui comprovantes_urls?', resposta.comprovantes_urls);
      console.log('Array de URLs:', JSON.stringify(resposta.comprovantes_urls));
      
      if (resposta.comprovantes_urls && resposta.comprovantes_urls.length > 0) {
        console.log(`📁 Encontradas ${resposta.comprovantes_urls.length} URLs para download`);
        
        for (let i = 0; i < resposta.comprovantes_urls.length; i++) {
          const url = resposta.comprovantes_urls[i];
          console.log(`\n[${i + 1}/${resposta.comprovantes_urls.length}] Processando:`, url);
          
          try {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('processo-anexos')
              .download(url);
            
            if (downloadError) {
              console.error('❌ ERRO no download:', downloadError);
              toast.error(`Falha ao baixar: ${url.split('/').pop()}`);
              continue;
            }
            
            if (!fileData) {
              console.error('❌ Download sem dados para:', url);
              continue;
            }
            
            const nomeArquivo = url.split('/').pop() || 'comprovante.pdf';
            const file = new File([fileData], nomeArquivo, { type: 'application/pdf' });
            comprovantes.push(file);
            console.log('✅ Comprovante OK:', nomeArquivo, `(${(fileData.size / 1024).toFixed(2)} KB)`);
            
          } catch (error) {
            console.error('❌ Exceção ao processar:', url, error);
            toast.error(`Erro ao processar: ${url.split('/').pop()}`);
          }
        }
      } else {
        console.warn('⚠️ NENHUMA URL DE COMPROVANTE ENCONTRADA!');
        console.log('Estrutura da resposta:', {
          id: resposta.id,
          has_comprovantes_urls: !!resposta.comprovantes_urls,
          type: typeof resposta.comprovantes_urls,
          value: resposta.comprovantes_urls
        });
      }

      console.log('\n=== RESULTADO FINAL ===');
      console.log(`📊 Total recuperado: ${comprovantes.length} de ${resposta.comprovantes_urls?.length || 0} esperados`);
      
      if (comprovantes.length === 0 && resposta.comprovantes_urls && resposta.comprovantes_urls.length > 0) {
        toast.warning('⚠️ Nenhum comprovante pôde ser recuperado. PDF será gerado sem anexos.');
      } else if (comprovantes.length > 0) {
        toast.success(`✅ ${comprovantes.length} comprovante(s) recuperado(s) para mesclagem`);
      }

      // Buscar dados do usuário que gerou (se for preços públicos)
      let usuarioNome: string | undefined;
      let usuarioCpf: string | undefined;

      if (resposta.fornecedor.cnpj === '00000000000000' && resposta.usuario_gerador_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', resposta.usuario_gerador_id)
          .single();

        if (profile) {
          usuarioNome = profile.nome_completo;
          usuarioCpf = profile.cpf;
        }
      }
      
      const { url, nome, hash } = await gerarPropostaFornecedorPDF(
        resposta.id,
        resposta.fornecedor,
        resposta.valor_total_anual_ofertado,
        resposta.observacoes_fornecedor,
        tituloCotacao,
        comprovantes,
        usuarioNome,
        usuarioCpf,
        cotacaoData?.criterio_julgamento
      );

      // Atualizar hash de certificação
      await supabase
        .from("cotacao_respostas_fornecedor")
        .update({ hash_certificacao: hash })
        .eq("id", resposta.id);

      // Deletar APENAS anexo PROPOSTA anterior (manter COMPROVANTES)
      await supabase
        .from('anexos_cotacao_fornecedor')
        .delete()
        .eq('cotacao_resposta_fornecedor_id', resposta.id)
        .eq('tipo_anexo', 'PROPOSTA');

      // Salvar novo anexo
      const { error: anexoError } = await supabase
        .from('anexos_cotacao_fornecedor')
        .insert({
          cotacao_resposta_fornecedor_id: resposta.id,
          nome_arquivo: nome,
          url_arquivo: url,
          tipo_anexo: 'PROPOSTA'
        });

      if (anexoError) throw anexoError;

      toast.success('PDF da proposta gerado e salvo com sucesso!');
      loadRespostas(); // Recarregar para mostrar o PDF
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF da proposta');
    } finally {
      setGerandoPDF(null);
    }
  };

  const gerarPDFProposta = async (resposta: RespostaFornecedor) => {
    try {
      // Buscar critério de julgamento e processo da cotação
      const { data: cotacaoData } = await supabase
        .from("cotacoes_precos")
        .select(`
          criterio_julgamento,
          processo_compra:processo_compra_id (
            tipo
          )
        `)
        .eq("id", cotacaoId)
        .single();

      const criterioJulgamento = cotacaoData?.criterio_julgamento || "global";
      const tipoProcesso = (cotacaoData?.processo_compra as any)?.tipo || "";

      // Buscar lotes se for por lote
      let lotes: any[] = [];
      if (criterioJulgamento === "por_lote") {
        const { data: lotesData } = await supabase
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_lote");
        lotes = lotesData || [];
      }

      // Buscar itens da resposta
      const { data: itensData } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          valor_unitario_ofertado,
          marca,
          itens_cotacao:item_cotacao_id (
            id,
            numero_item,
            descricao,
            quantidade,
            unidade,
            lote_id
          )
        `)
        .eq("cotacao_resposta_fornecedor_id", resposta.id);

      const itens: (ItemResposta & { lote_id?: string; marca?: string })[] = (itensData || []).map((item: any) => ({
        numero_item: item.itens_cotacao?.numero_item || 0,
        descricao: item.itens_cotacao?.descricao || "",
        quantidade: item.itens_cotacao?.quantidade || 0,
        unidade: item.itens_cotacao?.unidade || "",
        valor_unitario_ofertado: item.valor_unitario_ofertado,
        marca: item.marca,
        lote_id: item.itens_cotacao?.lote_id,
      })).sort((a, b) => a.numero_item - b.numero_item);

      // Gerar HTML para PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #0ea5e9; font-size: 24px; margin-bottom: 10px; }
            h2 { color: #0284c7; font-size: 18px; margin-top: 30px; margin-bottom: 15px; }
            .info { margin-bottom: 20px; }
            .info p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #0ea5e9; color: white; }
            .certificacao { margin-top: 40px; padding: 20px; background-color: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; }
            .certificacao h3 { margin-top: 0; color: #0284c7; font-size: 16px; }
            .certificacao p { margin: 8px 0; font-size: 13px; }
            .hash { font-family: monospace; color: #059669; word-break: break-all; font-size: 11px; }
            .autenticidade { margin-top: 15px; font-size: 12px; font-style: italic; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 15px; }
            .text-right { text-align: right; }
            .total { font-weight: bold; background-color: #f0f9ff; }
            .observacoes { margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #0ea5e9; }
          </style>
        </head>
        <body>
          <h1>PROPOSTA DE COTAÇÃO DE PREÇOS</h1>
          
          <div class="info">
            <p><strong>Processo:</strong> ${processoNumero}</p>
            <p><strong>Descrição:</strong> ${stripHtml(processoObjeto)}</p>
            <p><strong>Data de Envio:</strong> ${new Date(resposta.data_envio_resposta).toLocaleString("pt-BR")}</p>
          </div>

          <h2>Dados do Fornecedor</h2>
          <div class="info">
            <p><strong>Razão Social:</strong> ${resposta.fornecedor.razao_social}</p>
            <p><strong>CNPJ:</strong> ${formatarCNPJ(resposta.fornecedor.cnpj)}</p>
            <p><strong>Endereço:</strong> ${resposta.fornecedor.endereco_comercial}</p>
          </div>

          <h2>Itens Cotados</h2>
          ${criterioJulgamento === "por_lote" && lotes.length > 0 ? `
            ${lotes.map((lote: any) => {
              const itensDoLote = itens.filter(item => item.lote_id === lote.id).sort((a, b) => a.numero_item - b.numero_item);
              const totalLote = itensDoLote.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario_ofertado), 0);
              
              return `
                <div style="margin-top: 30px;">
                  <h3 style="background-color: #0ea5e9; color: white; padding: 10px; margin-bottom: 0;">
                    LOTE ${lote.numero_lote} - ${lote.descricao_lote}
                  </h3>
                  <table style="margin-top: 0;">
                    <thead>
                      <tr>
                        <th style="text-align: center;">Item</th>
                        <th>Descrição</th>
                        <th style="text-align: center;">Quantidade</th>
                        <th style="text-align: center;">Unidade</th>
                        ${tipoProcesso === "material" ? '<th style="text-align: center;">Marca</th>' : ''}
                        <th class="text-right">Valor Unitário</th>
                        <th class="text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itensDoLote.map(item => `
                        <tr>
                          <td style="text-align: center;">${item.numero_item}</td>
                          <td>${stripHtml(item.descricao)}</td>
                          <td style="text-align: center;">${item.quantidade.toLocaleString("pt-BR")}</td>
                          <td style="text-align: center;">${item.unidade}</td>
                          ${tipoProcesso === "material" ? `<td style="text-align: center;">${item.marca || '-'}</td>` : ''}
                          <td class="text-right">R$ ${item.valor_unitario_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td class="text-right">R$ ${(item.quantidade * item.valor_unitario_ofertado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      `).join("")}
                      <tr class="total">
                        <td colspan="${tipoProcesso === 'material' ? '6' : '5'}" class="text-right"><strong>TOTAL DO LOTE ${lote.numero_lote}</strong></td>
                        <td class="text-right"><strong>R$ ${totalLote.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
            }).join("")}
            <div style="margin-top: 20px; padding: 15px; background-color: #0ea5e9; color: white;">
              <table style="width: 100%; border: none;">
                <tr>
                  <td style="border: none; text-align: right; font-size: 18px;"><strong>VALOR TOTAL GERAL</strong></td>
                  <td style="border: none; text-align: right; font-size: 20px; width: 200px;"><strong>R$ ${resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              </table>
            </div>
          ` : `
            <table>
              <thead>
                <tr>
                  <th style="text-align: center;">Item</th>
                  <th>Descrição</th>
                  <th style="text-align: center;">Quantidade</th>
                  <th style="text-align: center;">Unidade</th>
                  ${tipoProcesso === "material" ? '<th style="text-align: center;">Marca</th>' : ''}
                  <th class="text-right">Valor Unitário</th>
                  <th class="text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${itens.map(item => `
                  <tr>
                    <td style="text-align: center;">${item.numero_item}</td>
                    <td>${stripHtml(item.descricao)}</td>
                    <td style="text-align: center;">${item.quantidade.toLocaleString("pt-BR")}</td>
                    <td style="text-align: center;">${item.unidade}</td>
                    ${tipoProcesso === "material" ? `<td style="text-align: center;">${item.marca || '-'}</td>` : ''}
                    <td class="text-right">R$ ${item.valor_unitario_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td class="text-right">R$ ${(item.quantidade * item.valor_unitario_ofertado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join("")}
                <tr class="total">
                  <td colspan="${tipoProcesso === 'material' ? '6' : '5'}" class="text-right"><strong>VALOR TOTAL ANUAL</strong></td>
                  <td class="text-right"><strong>R$ ${resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              </tbody>
            </table>
          `}

          ${resposta.observacoes_fornecedor ? `
            <div class="observacoes">
              <h3 style="margin-top: 0;">Observações do Fornecedor:</h3>
              <p>${stripHtml(resposta.observacoes_fornecedor)}</p>
            </div>
          ` : ""}

          <div class="certificacao">
            <h3>🔒 CERTIFICADO DE AUTENTICIDADE DIGITAL</h3>
            <p><strong>Protocolo de Envio:</strong> ${resposta.id.toUpperCase()}</p>
            <p><strong>Data e Hora de Envio:</strong> ${new Date(resposta.data_envio_resposta).toLocaleString("pt-BR", { 
              day: "2-digit", 
              month: "2-digit", 
              year: "numeric", 
              hour: "2-digit", 
              minute: "2-digit", 
              second: "2-digit",
              timeZone: "America/Sao_Paulo"
            })} (Horário de Brasília)</p>
            <p><strong>CNPJ do Fornecedor:</strong> ${formatarCNPJ(resposta.fornecedor.cnpj)}</p>
            <p><strong>Hash de Verificação:</strong> <span class="hash">${resposta.id.replace(/-/g, "").substring(0, 32)}</span></p>
            <p><strong>URL de Verificação:</strong> ${window.location.origin}/verificar-proposta?protocolo=${resposta.id}</p>
            
            <div class="autenticidade">
              Este documento foi gerado eletronicamente através do sistema de cotação de preços e possui validade jurídica conforme 
              Lei nº 14.063/2020 (Marco Legal da Assinatura Eletrônica). A autenticidade pode ser verificada através do protocolo de envio 
              informado acima ou acessando a URL de verificação. Qualquer alteração após o envio invalidará este certificado.
            </div>
          </div>
        </body>
        </html>
      `;

      // Criar blob e fazer download
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const nomeArquivo = `Proposta_${resposta.fornecedor.razao_social.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date(resposta.data_envio_resposta).toLocaleDateString("pt-BR").replace(/\//g, "-")}.html`;
      link.download = nomeArquivo;
      link.style.display = "none";
      document.body.appendChild(link);
      
      // Forçar o download de forma mais robusta
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      }, 100);

      toast.success("Proposta baixada com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF da proposta");
    }
  };

  const formatarCNPJ = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString("pt-BR");
  };

  const menorValor = respostas.length > 0 
    ? Math.min(...respostas.map(r => r.valor_total_anual_ofertado))
    : 0;

  const solicitarCorrecao = (resposta: RespostaFornecedor) => {
    setRespostaSelecionada(resposta);
    // Link inclui o ID da resposta para carregar os dados preenchidos
    const linkCorrecao = `${window.location.origin}/resposta-cotacao?cotacao=${cotacaoId}&resposta=${resposta.id}`;
    const textoEmail = `Prezado(a) fornecedor(a) ${resposta.fornecedor.razao_social},\n\nIdentificamos a necessidade de correção em sua proposta referente à cotação "${tituloCotacao}" do processo ${processoNumero}.\n\nPor favor, acesse o link abaixo para revisar e reenviar sua proposta:\n\n${linkCorrecao}\n\nData limite para resposta: [INFORMAR DATA]\n\nAtenciosamente,\nEquipe de Compras`;
    setEmailTexto(textoEmail);
    setEmailCorrecaoOpen(true);
  };

  const copiarEmailCorrecao = () => {
    navigator.clipboard.writeText(emailTexto);
    toast.success("Texto do e-mail copiado!");
    setEmailCorrecaoOpen(false);
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [respostaParaExcluir, setRespostaParaExcluir] = useState<RespostaFornecedor | null>(null);
  
  // Estados para confirmação de exclusão de anexo
  const [confirmDeleteAnexoOpen, setConfirmDeleteAnexoOpen] = useState(false);
  const [anexoParaExcluir, setAnexoParaExcluir] = useState<any>(null);
  
  // Estados para confirmação de exclusão
  const [confirmDeletePlanilhaOpen, setConfirmDeletePlanilhaOpen] = useState(false);
  const [planilhaParaExcluir, setPlanilhaParaExcluir] = useState<any>(null);
  const [confirmDeleteEncaminhamentoOpen, setConfirmDeleteEncaminhamentoOpen] = useState(false);
  const [encaminhamentoParaExcluir, setEncaminhamentoParaExcluir] = useState<any>(null);
  const [confirmDeleteAnaliseOpen, setConfirmDeleteAnaliseOpen] = useState(false);
  const [analiseParaExcluir, setAnaliseParaExcluir] = useState<any>(null);
  

  const confirmarExclusao = (resposta: RespostaFornecedor) => {
    setRespostaParaExcluir(resposta);
    setConfirmDeleteOpen(true);
  };

  const excluirResposta = async () => {
    if (!respostaParaExcluir) return;

    try {
      // Excluir itens da resposta
      const { error: itensError } = await supabase
        .from("respostas_itens_fornecedor")
        .delete()
        .eq("cotacao_resposta_fornecedor_id", respostaParaExcluir.id);

      if (itensError) throw itensError;

      // Excluir resposta
      const { error: respostaError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .delete()
        .eq("id", respostaParaExcluir.id);

      if (respostaError) throw respostaError;

      toast.success("Resposta excluída com sucesso!");
      setConfirmDeleteOpen(false);
      setRespostaParaExcluir(null);
      loadRespostas();
    } catch (error) {
      console.error("Erro ao excluir resposta:", error);
      toast.error("Erro ao excluir resposta");
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[96vh]">
        <DrawerHeader>
          <DrawerTitle>Respostas Recebidas - {tituloCotacao}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-6 pb-6">

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando respostas...
          </div>
        ) : respostas.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhuma resposta recebida ainda
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Total de respostas: <strong>{respostas.length}</strong>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor Total Ofertado</TableHead>
                  <TableHead>Data Envio</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead>Proposta PDF</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {respostas.map((resposta) => {
                  const isMenorValor = resposta.valor_total_anual_ofertado === menorValor;
                  
                  return (
                    <TableRow key={resposta.id} className={isMenorValor ? "bg-green-50 dark:bg-green-950" : ""}>
                      <TableCell className="font-medium">
                        {resposta.fornecedor.razao_social}
                        {isMenorValor && (
                          <Badge className="ml-2 bg-green-600">Menor Preço</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatarCNPJ(resposta.fornecedor.cnpj)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatarData(resposta.data_envio_resposta)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {resposta.observacoes_fornecedor || "-"}
                      </TableCell>
                      <TableCell>
                        {resposta.anexos && resposta.anexos.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {resposta.anexos.map((anexo) => (
                              <div key={anexo.id} className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm truncate max-w-[150px]" title={anexo.nome_arquivo}>
                                  {anexo.nome_arquivo}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    const { data } = await supabase.storage
                                      .from('processo-anexos')
                                      .createSignedUrl(anexo.url_arquivo, 3600);
                                    if (data?.signedUrl) {
                                      window.open(data.signedUrl, '_blank');
                                    }
                                  }}
                                  title="Visualizar PDF"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAnexoParaExcluir(anexo);
                                    setConfirmDeleteAnexoOpen(true);
                                  }}
                                  title="Excluir PDF"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 items-center">
                            <span className="text-sm text-muted-foreground italic">
                              Não anexado
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => gerarESalvarPDFProposta(resposta)}
                              disabled={gerandoPDF === resposta.id}
                              title="Gerar PDF da proposta automaticamente"
                            >
                              {gerandoPDF === resposta.id ? (
                                <>Gerando...</>
                              ) : (
                                <>
                                  <FileText className="h-4 w-4 mr-1" />
                                  Gerar PDF
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => gerarPDFProposta(resposta)}
                          >
                            <FileDown className="h-4 w-4 mr-2" />
                            Baixar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => solicitarCorrecao(resposta)}
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Solicitar Correção
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => confirmarExclusao(resposta)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* ========== 2. PLANILHAS CONSOLIDADAS ========== */}
            <div className="mt-6 pt-6 border-t space-y-4">
                <h3 className="text-lg font-semibold">Planilha Consolidada</h3>
                
                {/* Mostrar planilhas anteriores */}
                {planilhasAnteriores.length > 0 && (
                  <div className="space-y-3">
                    {planilhasAnteriores.map((planilha) => (
                      <div key={planilha.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">Protocolo: {planilha.protocolo}</span>
                            <div className="text-xs text-muted-foreground">
                              Planilha Gerada em {new Date(planilha.data_geracao).toLocaleString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { data } = await supabase.storage
                                .from('processo-anexos')
                                .createSignedUrl(planilha.url_arquivo, 3600);
                              if (data?.signedUrl) {
                                window.open(data.signedUrl, '_blank');
                              }
                            }}
                            className="flex-1"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .download(planilha.url_arquivo);
                              if (error) throw error;
                              const blob = new Blob([data], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = planilha.nome_arquivo;
                              a.click();
                            }}
                            className="flex-1"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Baixar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setPlanilhaParaExcluir(planilha);
                              setConfirmDeletePlanilhaOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botão para gerar nova planilha */}
                <Button 
                  onClick={gerarPlanilhaConsolidada}
                  disabled={gerandoPlanilha}
                  className="w-full"
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {gerandoPlanilha ? "Gerando..." : "Gerar Planilha Consolidada"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Você poderá escolher o método de cálculo (menor preço, média, mediana)
                </p>
              </div>

              {/* ========== 3. ENCAMINHAMENTOS (só aparece se tiver planilha ou encaminhamentos) ========== */}
              {(planilhasAnteriores.length > 0 || encaminhamentos.length > 0) && (
                <div className="mt-6 pt-6 border-t space-y-4">
                  <h3 className="text-lg font-semibold">Encaminhamentos</h3>
                  
                  {/* Mostrar encaminhamentos anteriores */}
                  {encaminhamentos.map((enc) => (
                    <div key={enc.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Protocolo: {enc.protocolo}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(enc.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(enc.url, '_blank')}
                          className="flex-1"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { data, error} = await supabase.storage
                                .from('processo-anexos')
                                .download(enc.storage_path);
                              
                              if (error) throw error;
                              
                              const blob = new Blob([data], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `encaminhamento_${enc.protocolo}.pdf`;
                              a.click();
                            } catch (error) {
                              console.error('Erro ao baixar:', error);
                              toast.error('Erro ao baixar encaminhamento');
                            }
                          }}
                          className="flex-1"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Baixar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setEncaminhamentoParaExcluir(enc);
                            setConfirmDeleteEncaminhamentoOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Botões para gerar encaminhamento e enviar ao compliance (só se tiver planilha) */}
                  {planilhasAnteriores.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        onClick={gerarEncaminhamento}
                        disabled={gerandoEncaminhamento}
                        className="flex-1"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {gerandoEncaminhamento ? "Gerando..." : "Gerar Encaminhamento"}
                      </Button>
                      <Button
                        onClick={enviarAoCompliance}
                        disabled={enviandoCompliance}
                        className="flex-1"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {enviandoCompliance ? "Enviando..." : "Enviar ao Compliance"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ========== 4. ANÁLISES DE COMPLIANCE ========== */}
              {analisesAnteriores.length > 0 && (
                <div className="mt-6 pt-6 border-t space-y-4">
                  <h3 className="text-lg font-semibold">Análises de Compliance</h3>
                  
                  {analisesAnteriores.map((analise, index) => {
                    // Processar empresas desta análise específica
                    const empresas = analise.empresas as any[];
                    const aprovadas = empresas
                      .filter((emp: any) => emp.aprovado === true)
                      .map((emp: any) => emp.razao_social);
                    const reprovadas = empresas
                      .filter((emp: any) => emp.aprovado === false)
                      .map((emp: any) => emp.razao_social);
                    
                    return (
                    <div key={analise.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">
                            Análise #{analisesAnteriores.length - index}
                            {index === 0 && <span className="ml-2 text-xs text-primary">(Mais recente)</span>}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(analise.data_analise || '').toLocaleString("pt-BR")}
                          </p>
                          {analise.protocolo && (
                            <p className="text-xs text-muted-foreground">
                              Protocolo: {analise.protocolo}
                            </p>
                          )}
                          <p className="text-xs mt-1">
                            Status: <span className={analise.status_aprovacao === 'aprovado' ? 'text-green-600' : 'text-red-600'}>
                              {analise.status_aprovacao === 'aprovado' ? 'Aprovado' : 'Reprovado'}
                            </span>
                          </p>
                        </div>
                      </div>
                      
                      {/* Lista de Empresas Aprovadas e Reprovadas */}
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        {aprovadas.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-green-700">✓ Empresas Aprovadas:</p>
                            <ul className="text-xs space-y-1">
                              {aprovadas.map((empresa, idx) => (
                                <li key={idx} className="text-green-600">• {empresa}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {reprovadas.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-red-700">✗ Empresas Reprovadas:</p>
                            <ul className="text-xs space-y-1">
                              {reprovadas.map((empresa, idx) => (
                                <li key={idx} className="text-red-600">• {empresa}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      
                      {analise.url_documento && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(analise.url_documento, '_blank')}
                            className="flex-1"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = analise.url_documento;
                              link.download = analise.nome_arquivo || 'analise_compliance.pdf';
                              link.click();
                            }}
                            className="flex-1"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Baixar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setAnaliseParaExcluir(analise);
                              setConfirmDeleteAnaliseOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              )}

          </div>
        )}
        </div>
      </DrawerContent>
    </Drawer>

      <AlertDialog open={emailCorrecaoOpen} onOpenChange={setEmailCorrecaoOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar Correção de Proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Fornecedor: {respostaSelecionada?.fornecedor.razao_social}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Texto do E-mail</Label>
              <Textarea
                value={emailTexto}
                onChange={(e) => setEmailTexto(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Copie este texto e envie para o e-mail do fornecedor solicitando a correção da proposta.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={copiarEmailCorrecao}>
              Copiar Texto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Resposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a resposta do fornecedor <strong>{respostaParaExcluir?.fornecedor.razao_social}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita e todos os dados da proposta serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirResposta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Resposta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAnexoOpen} onOpenChange={setConfirmDeleteAnexoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o anexo <strong>{anexoParaExcluir?.nome_arquivo}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita e o arquivo será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirAnexo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Anexo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeletePlanilhaOpen} onOpenChange={setConfirmDeletePlanilhaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Planilha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta planilha consolidada?
              <br /><br />
              {planilhaParaExcluir && (
                <span className="text-sm">
                  Protocolo: <strong>{planilhaParaExcluir.protocolo}</strong>
                </span>
              )}
              <br /><br />
              Esta ação não pode ser desfeita. Você poderá gerar uma nova planilha a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirPlanilha} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Planilha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de encaminhamento */}
      <AlertDialog open={confirmDeleteEncaminhamentoOpen} onOpenChange={setConfirmDeleteEncaminhamentoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Encaminhamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este encaminhamento ao compliance?
              <br /><br />
              {encaminhamentoParaExcluir && (
                <span className="text-sm">
                  Protocolo: <strong>{encaminhamentoParaExcluir.protocolo}</strong>
                </span>
              )}
              <br /><br />
              Esta ação não pode ser desfeita. Você poderá gerar um novo encaminhamento a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirEncaminhamento} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Encaminhamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de análise de compliance */}
      <AlertDialog open={confirmDeleteAnaliseOpen} onOpenChange={setConfirmDeleteAnaliseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Análise</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta análise de compliance?
              <br /><br />
              {analiseParaExcluir && (
                <span className="text-sm">
                  {analiseParaExcluir.protocolo && (
                    <>
                      Protocolo: <strong>{analiseParaExcluir.protocolo}</strong>
                    </>
                  )}
                </span>
              )}
              <br /><br />
              Esta ação não pode ser desfeita. Você poderá solicitar uma nova análise a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirAnaliseCompliance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Análise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      <DialogPlanilhaConsolidada
        open={planilhaConsolidadaOpen}
        onOpenChange={setPlanilhaConsolidadaOpen}
        cotacaoId={cotacaoId}
        criterioJulgamento={criterioJulgamento}
        onPlanilhaGerada={loadPlanilhaGerada}
      />
    </>
  );
}
