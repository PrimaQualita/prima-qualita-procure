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
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";

interface DialogRespostasCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  tituloCotacao: string;
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
}

export function DialogRespostasCotacao({
  open,
  onOpenChange,
  cotacaoId,
  tituloCotacao,
}: DialogRespostasCotacaoProps) {
  const [respostas, setRespostas] = useState<RespostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [processoNumero, setProcessoNumero] = useState("");
  const [processoObjeto, setProcessoObjeto] = useState("");

  useEffect(() => {
    if (open && cotacaoId) {
      loadRespostas();
    }
  }, [open, cotacaoId]);

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

  const gerarPDFProposta = async (resposta: RespostaFornecedor) => {
    try {
      // Buscar itens da resposta
      const { data: itensData } = await supabase
        .from("respostas_itens_fornecedor")
        .select(`
          valor_unitario_ofertado,
          itens_cotacao:item_cotacao_id (
            numero_item,
            descricao,
            quantidade,
            unidade
          )
        `)
        .eq("cotacao_resposta_fornecedor_id", resposta.id)
        .order("item_cotacao_id");

      const itens: ItemResposta[] = (itensData || []).map((item: any) => ({
        numero_item: item.itens_cotacao?.numero_item || 0,
        descricao: item.itens_cotacao?.descricao || "",
        quantidade: item.itens_cotacao?.quantidade || 0,
        unidade: item.itens_cotacao?.unidade || "",
        valor_unitario_ofertado: item.valor_unitario_ofertado,
      }));

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
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th class="text-right">Quantidade</th>
                <th>Unidade</th>
                <th class="text-right">Valor Unitário</th>
                <th class="text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map(item => `
                <tr>
                  <td>${item.numero_item}</td>
                  <td>${stripHtml(item.descricao)}</td>
                  <td class="text-right">${item.quantidade.toLocaleString("pt-BR")}</td>
                  <td>${item.unidade}</td>
                  <td class="text-right">R$ ${item.valor_unitario_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">R$ ${(item.quantidade * item.valor_unitario_ofertado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join("")}
              <tr class="total">
                <td colspan="5" class="text-right"><strong>VALOR TOTAL ANUAL</strong></td>
                <td class="text-right"><strong>R$ ${resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>

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
            
            <div class="autenticidade">
              Este documento foi gerado eletronicamente através do sistema de cotação de preços e possui validade jurídica conforme 
              Lei nº 14.063/2020 (Marco Legal da Assinatura Eletrônica). A autenticidade pode ser verificada através do protocolo de envio 
              informado acima. Qualquer alteração após o envio invalidará este certificado.
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
      link.download = `Proposta_${resposta.fornecedor.razao_social.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date(resposta.data_envio_resposta).toLocaleDateString("pt-BR").replace(/\//g, "-")}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("PDF da proposta gerado com sucesso!");
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
            <div className="text-sm text-muted-foreground">
              Total de respostas: <strong>{respostas.length}</strong>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor Total Ofertado</TableHead>
                  <TableHead>Data Envio</TableHead>
                  <TableHead>Observações</TableHead>
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
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => gerarPDFProposta(resposta)}
                        >
                          <FileDown className="h-4 w-4 mr-2" />
                          Baixar Proposta
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
