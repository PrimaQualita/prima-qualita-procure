// @ts-nocheck - Tabelas podem não existir no schema atual
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, CheckCircle2, XCircle, FileText, FileCheck, FileSpreadsheet, FileBox, Gavel, FileSignature, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

const VerificarDocumento = () => {
  const [searchParams] = useSearchParams();
  const [protocolo, setProtocolo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocoloParam = searchParams.get('protocolo');
    if (protocoloParam) {
      setProtocolo(protocoloParam);
      verificarDocumentoAutomatico(protocoloParam);
    }
  }, [searchParams]);

  const verificarDocumentoAutomatico = async (prot: string) => {
    setLoading(true);
    await verificarComProtocolo(prot);
    setLoading(false);
  };

  const verificarComProtocolo = async (prot: string) => {
    setResultado(null);

    try {
      console.log('Procurando protocolo:', prot);
      
      // Usar edge function para bypass de RLS
      const { data: payload, error } = await supabase.functions.invoke(
        "verificar-documento",
        { body: { protocolo: prot } }
      );

      if (error) throw error;

      const doc = payload?.documento;
      const tipo = payload?.tipo;

      if (!doc) {
        setResultado({ encontrado: false });
        return;
      }

      // Mapear tipo para exibição
      const tipoMap: Record<string, { label: string; icone: any }> = {
        autorizacao: { label: 'Autorização de Processo', icone: FileCheck },
        relatorio_final: { label: 'Relatório Final', icone: FileText },
        planilha_consolidada: { label: 'Planilha Consolidada', icone: FileSpreadsheet },
        encaminhamento: { label: 'Encaminhamento de Processo', icone: FileBox },
        encaminhamento_contabilidade: { label: 'Encaminhamento para Contabilidade', icone: FileBox },
        resposta_contabilidade: { label: 'Resposta da Contabilidade', icone: FileCheck },
        planilha_habilitacao: { label: 'Planilha de Habilitação', icone: FileSpreadsheet },
        planilha_lances: { label: 'Planilha de Lances', icone: FileSpreadsheet },
        ata_selecao: { label: 'Ata de Seleção', icone: Gavel },
        homologacao: { label: 'Homologação de Seleção', icone: FileSignature },
        proposta_selecao: { label: 'Proposta de Seleção', icone: FileText },
        proposta_realinhada: { label: 'Proposta Realinhada', icone: FileText },
        proposta_cotacao: { label: 'Proposta de Cotação', icone: FileText },
        recurso_fornecedor: { label: 'Recurso de Fornecedor', icone: ScrollText },
        recurso_inabilitacao: { label: 'Recurso de Inabilitação', icone: ScrollText },
        resposta_recurso: { label: 'Resposta de Recurso', icone: ScrollText },
        resposta_recurso_inabilitacao: { label: 'Resposta de Recurso de Inabilitação', icone: ScrollText },
        requisicao_compras: { label: 'Requisição de Compras', icone: FileText },
        capa_processo: { label: 'Capa do Processo', icone: FileText },
        autorizacao_despesa: { label: 'Autorização de Despesa', icone: FileCheck },
      };

      const tipoInfo = tipoMap[tipo] || { label: 'Documento', icone: FileText };
      
      // Montar detalhes baseado no tipo
      const detalhes: Record<string, string> = {
        'Protocolo': doc.protocolo || doc.protocolo_recurso || doc.protocolo_resposta || prot,
      };

      if (doc.data_geracao) {
        detalhes['Data de Geração'] = format(new Date(doc.data_geracao), 'dd/MM/yyyy HH:mm');
      } else if (doc.created_at) {
        detalhes['Data de Geração'] = format(new Date(doc.created_at), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_envio) {
        detalhes['Data de Envio'] = format(new Date(doc.data_envio), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_envio_proposta) {
        detalhes['Data de Envio'] = format(new Date(doc.data_envio_proposta), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_envio_resposta) {
        detalhes['Data de Envio'] = format(new Date(doc.data_envio_resposta), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_envio_recurso) {
        detalhes['Data de Envio'] = format(new Date(doc.data_envio_recurso), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_resposta) {
        detalhes['Data de Resposta'] = format(new Date(doc.data_resposta), 'dd/MM/yyyy HH:mm');
      } else if (doc.data_resposta_gestor) {
        detalhes['Data de Resposta'] = format(new Date(doc.data_resposta_gestor), 'dd/MM/yyyy HH:mm');
      }

      if (doc.tipo_autorizacao) {
        detalhes['Tipo de Autorização'] = doc.tipo_autorizacao === 'compra_direta' ? 'Compra Direta' : 'Seleção de Fornecedores';
      }

      if (doc.nome_arquivo || doc.nome_arquivo_recurso || doc.nome_arquivo_resposta) {
        detalhes['Arquivo'] = doc.nome_arquivo || doc.nome_arquivo_recurso || doc.nome_arquivo_resposta;
      }

      if (doc.processo_numero) {
        detalhes['Processo'] = doc.processo_numero;
      }

      // Fornecedor - buscar em diferentes estruturas
      if (doc.fornecedores?.razao_social) {
        detalhes['Fornecedor'] = doc.fornecedores.razao_social;
      } else if (doc.recursos_fornecedor?.fornecedores?.razao_social) {
        detalhes['Fornecedor'] = doc.recursos_fornecedor.fornecedores.razao_social;
      }

      // Processo - buscar em diferentes estruturas
      if (doc.processos_compras?.numero_processo_interno) {
        detalhes['Processo'] = doc.processos_compras.numero_processo_interno;
      } else if (doc.selecoes_fornecedores?.processos_compras?.numero_processo_interno) {
        detalhes['Processo'] = doc.selecoes_fornecedores.processos_compras.numero_processo_interno;
      } else if (doc.fornecedores_rejeitados_cotacao?.cotacoes_precos?.processos_compras?.numero_processo_interno) {
        detalhes['Processo'] = doc.fornecedores_rejeitados_cotacao.cotacoes_precos.processos_compras.numero_processo_interno;
      } else if (doc.recursos_fornecedor?.fornecedores_rejeitados_cotacao?.cotacoes_precos?.processos_compras?.numero_processo_interno) {
        detalhes['Processo'] = doc.recursos_fornecedor.fornecedores_rejeitados_cotacao.cotacoes_precos.processos_compras.numero_processo_interno;
      }

      if (doc.valor_total_proposta) {
        detalhes['Valor Total'] = `R$ ${doc.valor_total_proposta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      } else if (doc.valor_total_anual_ofertado) {
        detalhes['Valor Total'] = `R$ ${doc.valor_total_anual_ofertado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }

      // Decisão para resposta de recurso
      if (doc.decisao) {
        const decisaoMap: Record<string, string> = {
          'provimento': 'Provimento Total',
          'provimento_parcial': 'Provimento Parcial',
          'negado': 'Negado'
        };
        detalhes['Decisão'] = decisaoMap[doc.decisao] || doc.decisao;
      } else if (doc.status_recurso) {
        const statusMap: Record<string, string> = {
          'deferido': 'Deferido',
          'indeferido': 'Indeferido',
          'parcial': 'Deferido Parcialmente'
        };
        detalhes['Decisão'] = statusMap[doc.status_recurso] || doc.status_recurso;
      }

      if (doc.resultado) {
        detalhes['Resultado'] = doc.resultado;
      }

      if (doc.responsavel_nome) {
        detalhes['Responsável'] = doc.responsavel_nome;
      }

      if (doc.fornecedores_incluidos && Array.isArray(doc.fornecedores_incluidos) && doc.fornecedores_incluidos.length > 0) {
        detalhes['Fornecedores Incluídos'] = doc.fornecedores_incluidos.join(', ');
      }

      // URL do arquivo
      const urlArquivo = doc.url_arquivo || doc.url || doc.url_pdf_recurso || doc.url_documento || doc.url_pdf_proposta || doc.url_pdf_resposta;

      setResultado({
        encontrado: true,
        tipo: tipoInfo.label,
        icone: tipoInfo.icone,
        data: { ...doc, url_arquivo: urlArquivo },
        detalhes
      });

    } catch (error) {
      console.error('Erro ao verificar documento:', error);
      toast({
        title: "Erro",
        description: "Erro ao verificar o documento. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const verificarDocumento = async () => {
    if (!protocolo.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, informe o protocolo do documento",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    await verificarComProtocolo(protocolo);
    setLoading(false);
  };

  const IconeDocumento = resultado?.icone || FileText;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Logo no topo */}
        <div className="flex justify-center mb-6">
          <img src={logoHorizontal} alt="Prima Qualitá" className="h-16" />
        </div>
        
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold">Verificar Documento</h1>
          </div>
          <p className="text-muted-foreground">
            Verifique a autenticidade de documentos oficiais através do protocolo de certificação digital
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verificação de Autenticidade</CardTitle>
            <CardDescription>
              Informe o protocolo do documento que deseja verificar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Digite o protocolo do documento"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verificarDocumento()}
              />
              <Button onClick={verificarDocumento} disabled={loading}>
                {loading ? "Verificando..." : "Verificar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {resultado && (
          <Card className={resultado.encontrado ? "border-green-500" : "border-red-500"}>
            <CardHeader>
              <div className="flex items-center gap-3">
                {resultado.encontrado ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <div>
                      <CardTitle className="text-green-700">Documento Autenticado</CardTitle>
                      <CardDescription>
                        O documento foi encontrado e é autêntico
                      </CardDescription>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-8 w-8 text-red-500" />
                    <div>
                      <CardTitle className="text-red-700">Documento Não Encontrado</CardTitle>
                      <CardDescription>
                        Não foi possível encontrar um documento com este protocolo
                      </CardDescription>
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            
            {resultado.encontrado && (
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                  <IconeDocumento className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-semibold text-lg">{resultado.tipo}</p>
                    <p className="text-sm text-muted-foreground">Tipo de Documento</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Detalhes do Documento:</h3>
                  {Object.entries(resultado.detalhes).map(([chave, valor]) => (
                    <div key={chave} className="flex justify-between py-2 border-b">
                      <span className="font-medium">{chave}:</span>
                      <span className="text-muted-foreground">{valor as string}</span>
                    </div>
                  ))}
                </div>

                {resultado.data.url_arquivo && (
                  <div className="pt-4">
                    <Button
                      onClick={() => window.open(resultado.data.url_arquivo, '_blank')}
                      className="w-full"
                    >
                      Visualizar Documento Original
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        <Card className="bg-muted">
          <CardHeader>
            <CardTitle className="text-sm">Sobre a Certificação Digital</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              A certificação digital é uma forma de garantir a autenticidade, integridade e validade jurídica 
              de documentos eletrônicos, conforme estabelecido pela Lei 14.063/2020.
            </p>
            <p>
              Cada documento gerado pelo sistema recebe um protocolo único que permite verificar sua autenticidade 
              a qualquer momento através desta página.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerificarDocumento;
