import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);
  const [enviandoCompliance, setEnviandoCompliance] = useState(false);
  const [encaminhamento, setEncaminhamento] = useState<any>(null);
  const [gerandoEncaminhamento, setGerandoEncaminhamento] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
      loadPlanilhaGerada();
      loadEncaminhamento();
    }
  }, [open, cotacaoId]);

  const loadPlanilhaGerada = async () => {
    try {
      const { data } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setPlanilhaGerada(data);
    } catch (error) {
      console.error("Erro ao carregar planilha:", error);
    }
  };

  const loadEncaminhamento = async () => {
    try {
      const { data } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setEncaminhamento(data);
    } catch (error) {
      console.error("Erro ao carregar encaminhamento:", error);
    }
  };

  const gerarPlanilhaConsolidada = async () => {
    setGerandoPlanilha(true);
    setPlanilhaConsolidadaOpen(true);
    setGerandoPlanilha(false);
  };

  const enviarAoCompliance = async () => {
    try {
      setEnviandoCompliance(true);
      
      const { error } = await supabase
        .from('cotacoes_precos')
        .update({ 
          enviado_compliance: true,
          data_envio_compliance: new Date().toISOString()
        })
        .eq('id', cotacaoId);

      if (error) throw error;

      toast.success("Enviado ao Compliance com sucesso!");
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao enviar ao Compliance:', error);
      toast.error("Erro ao enviar ao Compliance");
    } finally {
      setEnviandoCompliance(false);
    }
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

      // Deletar encaminhamento anterior se existir
      if (encaminhamento) {
        await supabase.storage
          .from('processo-anexos')
          .remove([encaminhamento.storagePath]);
        
        await supabase
          .from('encaminhamentos_processo')
          .delete()
          .eq('id', encaminhamento.id);
      }

      const resultado = await gerarEncaminhamentoPDF(
        processoNumero,
        processoObjeto,
        perfil.nome_completo,
        perfil.cpf
      );

      // Salvar no banco
      const { error: dbError } = await supabase
        .from('encaminhamentos_processo')
        .insert({
          cotacao_id: cotacaoId,
          processo_numero: processoNumero,
          protocolo: resultado.protocolo,
          storage_path: resultado.storagePath,
          url: resultado.url,
          gerado_por: user.id
        });

      if (dbError) throw dbError;

      // Recarregar encaminhamento
      await loadEncaminhamento();
      toast.success('Encaminhamento gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar encaminhamento:', error);
      toast.error("Erro ao gerar encaminhamento");
    } finally {
      setGerandoEncaminhamento(false);
    }
  };

  const excluirEncaminhamento = async () => {
    if (!encaminhamento) return;

    try {
      console.log('Excluindo encaminhamento:', encaminhamento.id);
      
      // Deletar arquivo do storage primeiro
      const { error: storageError } = await supabase.storage
        .from('processo-anexos')
        .remove([encaminhamento.storagePath]);

      if (storageError) {
        console.error('Erro ao deletar do storage:', storageError);
      }

      // Deletar do banco de dados usando o ID
      const { error: dbError } = await supabase
        .from('encaminhamentos_processo')
        .delete()
        .eq('id', encaminhamento.id);

      if (dbError) {
        console.error('Erro ao deletar do banco:', dbError);
        throw dbError;
      }

      console.log('Encaminhamento excluído com sucesso');
      
      // Limpar estado local sem recarregar
      setEncaminhamento(null);
      toast.success("Encaminhamento excluído com sucesso");
    } catch (error) {
      console.error('Erro ao excluir encaminhamento:', error);
      toast.error("Erro ao excluir encaminhamento");
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
          fornecedores:fornecedor_id (
            razao_social,
            cnpj,
            endereco_comercial
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: false });

      if (error) throw error;

      // Transformar dados
      const respostasFormatadas = (data || []).map((r: any) => ({
        id: r.id,
        valor_total_anual_ofertado: r.valor_total_anual_ofertado,
        observacoes_fornecedor: r.observacoes_fornecedor,
        data_envio_resposta: r.data_envio_resposta,
        fornecedor: {
          razao_social: r.fornecedores?.razao_social || "N/A",
          cnpj: r.fornecedores?.cnpj || "N/A",
          endereco_comercial: r.fornecedores?.endereco_comercial || "",
        },
      }));

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
      
      const { url, nome } = await gerarPropostaFornecedorPDF(
        resposta.id,
        resposta.fornecedor,
        resposta.valor_total_anual_ofertado,
        resposta.observacoes_fornecedor,
        tituloCotacao
      );

      // Salvar referência do anexo no banco
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respostas Recebidas</DialogTitle>
          <DialogDescription>
            Cotação: {tituloCotacao}
          </DialogDescription>
        </DialogHeader>

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
                                  onClick={() => {
                                    const { data } = supabase.storage
                                      .from('cotacao-anexos')
                                      .getPublicUrl(anexo.url_arquivo);
                                    window.open(data.publicUrl, '_blank');
                                  }}
                                  title="Visualizar PDF"
                                >
                                  <Eye className="h-4 w-4" />
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

            {/* Botões de Planilha e Compliance */}
            <div className="mt-6 space-y-4 border-t pt-4">
              <Button 
                onClick={gerarPlanilhaConsolidada}
                disabled={gerandoPlanilha}
                className="w-full"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {gerandoPlanilha ? "Gerando..." : "Gerar Planilha Consolidada"}
              </Button>

              {planilhaGerada && (
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Planilha Consolidada Gerada</span>
                    <span className="text-xs text-muted-foreground">Protocolo: {planilhaGerada.protocolo || 'N/A'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        let filePath = planilhaGerada.url_arquivo;
                        if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
                          filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
                        }
                        const { data } = await supabase.storage.from("processo-anexos").createSignedUrl(filePath, 3600);
                        if (data) window.open(data.signedUrl, "_blank");
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
                        let filePath = planilhaGerada.url_arquivo;
                        if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
                          filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
                        }
                        const { data } = await supabase.storage.from("processo-anexos").createSignedUrl(filePath, 3600);
                        if (data) {
                          const link = document.createElement("a");
                          link.href = data.signedUrl;
                          link.download = planilhaGerada.nome_arquivo;
                          link.click();
                          toast.success("Download iniciado!");
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
                      onClick={async () => {
                        try {
                          let filePath = planilhaGerada.url_arquivo;
                          if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
                            filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
                          }

                          const { error: storageError } = await supabase.storage
                            .from("processo-anexos")
                            .remove([filePath]);

                          if (storageError) throw storageError;

                          const { error: dbError } = await supabase
                            .from("planilhas_consolidadas")
                            .delete()
                            .eq("id", planilhaGerada.id);

                          if (dbError) throw dbError;

                          setPlanilhaGerada(null);
                          toast.success("Planilha excluída com sucesso");
                        } catch (error: any) {
                          console.error("Erro ao excluir planilha:", error);
                          toast.error("Erro ao excluir planilha");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              {planilhaGerada && (
                <div className="mt-6 pt-6 border-t space-y-4">
                  <div className="flex gap-2">
                    <Button onClick={gerarEncaminhamento} disabled={gerandoEncaminhamento} className="flex-1">
                      <FileText className="mr-2 h-4 w-4" />
                      {gerandoEncaminhamento ? "Gerando..." : "Gerar Encaminhamento"}
                    </Button>
                    <Button onClick={enviarAoCompliance} disabled={enviandoCompliance} className="flex-1">
                      <Send className="mr-2 h-4 w-4" />
                      {enviandoCompliance ? "Enviando..." : "Enviar ao Compliance"}
                    </Button>
                  </div>

                  {encaminhamento && (
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Encaminhamento Gerado</span>
                        <span className="text-xs text-muted-foreground">Protocolo: {encaminhamento.protocolo}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .download(encaminhamento.storage_path);
                              
                              if (error) throw error;
                              
                              const blob = new Blob([data], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            } catch (error) {
                              console.error('Erro ao visualizar:', error);
                              toast.error('Erro ao visualizar encaminhamento');
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
                            try {
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .download(encaminhamento.storage_path);
                              
                              if (error) throw error;
                              
                              const blob = new Blob([data], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `encaminhamento-${processoNumero}.pdf`;
                              link.click();
                              URL.revokeObjectURL(url);
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
                          onClick={excluirEncaminhamento}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>

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
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
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

      <DialogPlanilhaConsolidada
        open={planilhaConsolidadaOpen}
        onOpenChange={setPlanilhaConsolidadaOpen}
        cotacaoId={cotacaoId}
        criterioJulgamento={criterioJulgamento}
        onPlanilhaGerada={loadPlanilhaGerada}
      />
    </Dialog>
  );
}
