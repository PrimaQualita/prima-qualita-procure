import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, CheckCircle2, XCircle, Search, Download } from "lucide-react";

export default function VerificarAutorizacao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [protocolo, setProtocolo] = useState(searchParams.get("protocolo") || "");
  const [loading, setLoading] = useState(false);
  const [autorizacao, setAutorizacao] = useState<any>(null);
  const [tipoDocumento, setTipoDocumento] = useState<'autorizacao' | 'relatorio' | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);

  const verificarAutorizacao = async (protocoloParam?: string) => {
    const protocoloParaBuscar = protocoloParam || protocolo;
    
    if (!protocoloParaBuscar.trim()) {
      toast({
        title: "Protocolo obrigatório",
        description: "Digite o protocolo do documento para verificar",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setBuscaRealizada(true);
    setAutorizacao(null);
    setTipoDocumento(null);
    
    const protocoloLimpo = protocoloParaBuscar.trim();
    console.log('🔍 [VERIFICAÇÃO] Iniciando busca');
    console.log('📋 [VERIFICAÇÃO] Protocolo original:', protocoloParaBuscar);
    console.log('✨ [VERIFICAÇÃO] Protocolo limpo:', protocoloLimpo);
    console.log('📏 [VERIFICAÇÃO] Tamanho:', protocoloLimpo.length);
    
    try {
      // Tentar buscar como autorização primeiro
      console.log('🔎 [VERIFICAÇÃO] Buscando em autorizacoes_processo...');
      const { data: autData, error: autError } = await supabase
        .from('autorizacoes_processo' as any)
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📄 [VERIFICAÇÃO] Resultado autorizacoes_processo:', { 
        encontrado: !!autData, 
        erro: autError?.message,
        dados: autData 
      });

      if (autData && !autError) {
        // Encontrou autorização
        console.log('✅ [VERIFICAÇÃO] Autorização encontrada!');
        const { data: cotacao } = await supabase
          .from('cotacoes_precos')
          .select('titulo_cotacao, processo_compra_id')
          .eq('id', (autData as any).cotacao_id)
          .single();

        let processo = null;
        if (cotacao?.processo_compra_id) {
          const { data: processoData } = await supabase
            .from('processos_compras')
            .select('numero_processo_interno, objeto_resumido')
            .eq('id', cotacao.processo_compra_id)
            .single();
          processo = processoData;
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', (autData as any).usuario_gerador_id)
          .single();

        setAutorizacao({
          ...(autData as any),
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('autorizacao');

        toast({
          title: "Autorização verificada",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // Se não encontrou autorização, tentar buscar como relatório final
      console.log('🔎 [VERIFICAÇÃO] Buscando em relatorios_finais...');
      const { data: relData, error: relError } = await supabase
        .from('relatorios_finais' as any)
        .select('*')
        .eq('protocolo', protocoloLimpo)
        .maybeSingle();

      console.log('📋 [VERIFICAÇÃO] Resultado relatorios_finais:', { 
        encontrado: !!relData, 
        erro: relError?.message,
        dados: relData 
      });

      if (relData && !relError) {
        // Encontrou relatório final
        console.log('✅ [VERIFICAÇÃO] Relatório Final encontrado!');
        const { data: cotacao } = await supabase
          .from('cotacoes_precos')
          .select('titulo_cotacao, processo_compra_id')
          .eq('id', (relData as any).cotacao_id)
          .single();

        let processo = null;
        if (cotacao?.processo_compra_id) {
          const { data: processoData } = await supabase
            .from('processos_compras')
            .select('numero_processo_interno, objeto_resumido')
            .eq('id', cotacao.processo_compra_id)
            .single();
          processo = processoData;
        }

        const { data: usuario } = await supabase
          .from('profiles')
          .select('nome_completo, cpf')
          .eq('id', (relData as any).usuario_gerador_id)
          .single();

        setAutorizacao({
          ...(relData as any),
          cotacao: cotacao ? { ...cotacao, processo } : null,
          usuario
        });
        setTipoDocumento('relatorio');

        toast({
          title: "Relatório Final verificado",
          description: "Documento autêntico encontrado no sistema",
        });
        return;
      }

      // Não encontrou nem autorização nem relatório
      console.error('❌ [VERIFICAÇÃO] Documento não encontrado em nenhuma tabela');
      console.error('🔍 [VERIFICAÇÃO] Protocolo buscado:', protocoloLimpo);
      
      toast({
        title: "Documento não encontrado",
        description: "Não foi possível localizar um documento com este protocolo. Verifique se o protocolo está correto.",
        variant: "destructive"
      });
      setAutorizacao(null);
      setTipoDocumento(null);
    } catch (error) {
      console.error('💥 [VERIFICAÇÃO] Erro ao verificar documento:', error);
      toast({
        title: "Erro ao verificar",
        description: "Ocorreu um erro ao buscar o documento",
        variant: "destructive"
      });
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
          <div className="flex justify-center mb-4">
            <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center">
              <FileText className="w-16 h-16 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground">Verificação de Documentos</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Insira o protocolo de autorizações ou relatórios finais para verificar sua autenticidade
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Documento
            </CardTitle>
            <CardDescription>
              Digite o protocolo completo (ex: AUT-CD-180-2025-... ou REL-FINAL-195-2025-...)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="protocolo">Protocolo</Label>
              <div className="flex gap-2">
                <Input
                  id="protocolo"
                  placeholder="AUT-CD-180-2025-... ou REL-FINAL-195-2025-..."
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
                      {tipoDocumento === 'relatorio' ? 'Relatório Final Autêntico' : 'Autorização Autêntica'}
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
                  <p className="font-mono font-semibold">{autorizacao.protocolo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tipo de Documento</p>
                  <p className="font-semibold capitalize">
                    {tipoDocumento === 'relatorio' ? 'Relatório Final' : 
                     autorizacao.tipo_autorizacao === 'compra_direta' ? 'Autorização - Compra Direta' : 'Autorização - Seleção de Fornecedores'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Data de Geração</p>
                  <p className="font-semibold">
                    {new Date(autorizacao.data_geracao).toLocaleString('pt-BR', {
                      dateStyle: 'long',
                      timeStyle: 'medium'
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{autorizacao.usuario?.nome_completo}</p>
                  <p className="text-sm text-muted-foreground">CPF: {autorizacao.usuario?.cpf}</p>
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
                        <p className="font-semibold">{autorizacao.cotacao.processo?.objeto_resumido}</p>
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
                  Hash de Verificação: {autorizacao.protocolo.replace(/-/g, '').substring(0, 32).toUpperCase()}
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
