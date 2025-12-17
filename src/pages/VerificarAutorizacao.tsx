import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, CheckCircle2, XCircle, Search, Download } from "lucide-react";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";
import { stripHtml } from "@/lib/htmlUtils";

const formatarProtocoloExibicao = (uuid: string): string => {
  if (!uuid) return 'N/A';
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

export default function VerificarAutorizacao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Se vier protocolo na URL, formatar automaticamente
  const protocoloInicial = searchParams.get("protocolo") || "";
  const protocoloFormatado = protocoloInicial ? formatarProtocoloExibicao(protocoloInicial) : "";
  
  const [protocolo, setProtocolo] = useState(protocoloFormatado);
  const [loading, setLoading] = useState(false);
  const [autorizacao, setAutorizacao] = useState<any>(null);
  const [tipoDocumento, setTipoDocumento] = useState<'autorizacao' | 'relatorio' | 'compliance' | 'planilha' | 'encaminhamento' | 'homologacao' | 'recurso' | 'resposta_recurso' | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);

  // Função auxiliar para normalizar protocolo (primeiros 16 chars sem hífens)
  const normalizarProtocolo = (proto: string): string => {
    return proto.replace(/-/g, '').toUpperCase().substring(0, 16);
  };

  const verificarAutorizacao = async (protocoloParam?: string) => {
    const protocoloParaBuscar = protocoloParam || protocolo;

    if (!protocoloParaBuscar.trim()) {
      toast({
        title: "Protocolo obrigatório",
        description: "Digite o protocolo do documento para verificar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setBuscaRealizada(true);
    setAutorizacao(null);
    setTipoDocumento(null);

    const protocoloLimpo = protocoloParaBuscar.trim();

    const formatarProtocoloNumerico = (proto: string) => {
      const semHifens = proto.replace(/-/g, '').trim();
      if (/^\d{16}$/.test(semHifens)) {
        return semHifens.match(/.{1,4}/g)?.join('-') || proto;
      }
      return proto;
    };

    try {
      const protocoloFormatado = formatarProtocoloNumerico(protocoloLimpo);

      const { data: payload, error } = await supabase.functions.invoke(
        "verificar-autorizacao",
        { body: { protocolo: protocoloFormatado } }
      );

      if (error) throw error;

      const aut = payload?.autorizacao ?? null;

      if (!aut) {
        toast({
          title: "Documento não encontrado",
          description: "Não foi possível localizar uma autorização com este protocolo. Verifique se o protocolo está correto.",
          variant: "destructive",
        });
        setAutorizacao(null);
        setTipoDocumento(null);
        return;
      }

      setAutorizacao(aut);
      setTipoDocumento('autorizacao');

      toast({
        title: "Autorização verificada",
        description: "Documento autêntico encontrado no sistema",
      });
    } catch (error) {
      console.error('💥 [VERIFICAÇÃO] Erro ao verificar autorização:', error);
      toast({
        title: "Erro ao verificar",
        description: "Ocorreu um erro ao buscar a autorização",
        variant: "destructive",
      });
      setAutorizacao(null);
      setTipoDocumento(null);
    } finally {
      setLoading(false);
    }
  };

  const baixarAutorizacao = async () => {
    if (!autorizacao?.url_arquivo) return;

    try {
      const response = await fetch(autorizacao.url_arquivo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = autorizacao.nome_arquivo || 'autorizacao.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar:', error);
      toast({
        title: "Erro ao baixar",
        description: "Não foi possível baixar a autorização",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 py-12 px-4">
      <div className="container max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <img src={logoHorizontal} alt="Prima Qualità" className="h-16" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">Verificação de Documentos</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Insira o protocolo para verificar a autenticidade de autorizações, relatórios, planilhas e encaminhamentos
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Documento
            </CardTitle>
            <CardDescription>
              Digite o protocolo completo do documento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="protocolo">Protocolo</Label>
              <div className="flex gap-2">
                <Input
                  id="protocolo"
                  placeholder="Digite o protocolo do documento"
                  value={protocolo}
                  onChange={(e) => setProtocolo(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && verificarAutorizacao()}
                />
                <Button 
                  onClick={() => verificarAutorizacao()} 
                  disabled={loading}
                  className="whitespace-nowrap"
                >
                  {loading ? "Verificando..." : "Verificar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {autorizacao && (
          <Card className="border-2 border-primary">
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                  <div>
                    <CardTitle className="text-green-600">
                      {tipoDocumento === 'relatorio' ? 'Relatório Final Autêntico' : 
                       tipoDocumento === 'compliance' ? 'Análise de Riscos e Conformidades Autêntica' :
                       tipoDocumento === 'planilha' ? 'Planilha Consolidada Autêntica' :
                       tipoDocumento === 'encaminhamento' ? 'Encaminhamento de Processo Autêntico' :
                       tipoDocumento === 'homologacao' ? 'Homologação de Seleção Autêntica' :
                       tipoDocumento === 'recurso' ? 'Recurso de Inabilitação Autêntico' :
                       tipoDocumento === 'resposta_recurso' ? 'Resposta de Recurso Autêntica' :
                       'Autorização Autêntica'}
                    </CardTitle>
                    <CardDescription>Documento verificado e válido</CardDescription>
                  </div>
                </div>
                <Button onClick={baixarAutorizacao} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-mono font-semibold">
                    {autorizacao.protocolo?.includes('-') && autorizacao.protocolo.split('-').length === 4
                      ? autorizacao.protocolo
                      : formatarProtocoloExibicao(autorizacao.protocolo)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tipo de Documento</p>
                  <p className="font-semibold capitalize">
                    {tipoDocumento === 'relatorio' ? 'Relatório Final' : 
                     tipoDocumento === 'compliance' ? 'Análise de Riscos e Conformidades' :
                     tipoDocumento === 'planilha' ? 'Planilha Consolidada' :
                     tipoDocumento === 'encaminhamento' ? 'Encaminhamento de Processo' :
                     tipoDocumento === 'homologacao' ? 'Homologação de Seleção' :
                     tipoDocumento === 'recurso' ? 'Recurso de Inabilitação' :
                     tipoDocumento === 'resposta_recurso' ? 'Resposta de Recurso' :
                     autorizacao.tipo_autorizacao === 'compra_direta' ? 'Autorização - Compra Direta' : 'Autorização - Seleção de Fornecedores'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Data de Geração</p>
                  <p className="font-semibold">
                    {new Date(autorizacao.data_geracao || autorizacao.data_analise).toLocaleString('pt-BR', {
                      dateStyle: 'long',
                      timeStyle: 'medium'
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{autorizacao.usuario?.nome_completo}</p>
                  {autorizacao.usuario?.cpf && (
                    <p className="text-sm text-muted-foreground">CPF: {autorizacao.usuario.cpf}</p>
                  )}
                </div>
              </div>

              {autorizacao.cotacao && (
                <>
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Informações do Processo</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Número do Processo</p>
                        <p className="font-semibold">{autorizacao.cotacao.processo?.numero_processo_interno}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Cotação</p>
                        <p className="font-semibold">{autorizacao.cotacao.titulo_cotacao}</p>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <p className="text-sm text-muted-foreground">Objeto</p>
                        <p className="font-semibold">{stripHtml(autorizacao.cotacao.processo?.objeto_resumido || "")}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {autorizacao.selecao && (
                <>
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Informações do Processo</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Número do Processo</p>
                        <p className="font-semibold">{autorizacao.selecao.processo?.numero_processo_interno}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Seleção de Fornecedores</p>
                        <p className="font-semibold">Nº {autorizacao.selecao.numero_selecao}</p>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <p className="text-sm text-muted-foreground">Objeto</p>
                        <p className="font-semibold">{stripHtml(autorizacao.selecao.processo?.objeto_resumido || "")}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Validade Legal:</strong> Este documento possui validade legal conforme Lei 14.063/2020
                </p>
                <p className="text-xs text-muted-foreground">
                  Hash de Verificação: {autorizacao.protocolo?.replace(/-/g, '').substring(0, 32).toUpperCase() || 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {buscaRealizada && !loading && protocolo && !autorizacao && (
          <Card className="border-2 border-destructive">
            <CardHeader className="bg-destructive/5">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-destructive" />
                <div>
                  <CardTitle className="text-destructive">Documento Não Encontrado</CardTitle>
                  <CardDescription>
                    Não foi possível localizar um documento com o protocolo informado
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Verifique se o protocolo foi digitado corretamente e tente novamente.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Voltar ao Sistema
          </Button>
        </div>
      </div>
    </div>
  );
}
