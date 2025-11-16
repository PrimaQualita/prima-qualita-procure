// @ts-nocheck - Tabelas podem não existir no schema atual
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, CheckCircle2, XCircle, FileText, FileCheck, FileSpreadsheet, FileBox } from "lucide-react";
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
      // 1. Autorizações de Processo
      const { data: autorizacao, error: errorAuth } = await supabase
        .from('autorizacoes_processo')
        .select('*')
        .eq('protocolo', prot)
        .maybeSingle();

      console.log('Autorizacao:', autorizacao, errorAuth);

      if (autorizacao) {
        setResultado({
          encontrado: true,
          tipo: 'Autorização de Processo',
          icone: FileCheck,
          data: autorizacao,
          detalhes: {
            'Protocolo': autorizacao.protocolo,
            'Data de Geração': format(new Date(autorizacao.data_geracao), 'dd/MM/yyyy HH:mm'),
            'Tipo de Autorização': autorizacao.tipo_autorizacao === 'compra_direta' ? 'Compra Direta' : 'Seleção de Fornecedores',
            'Arquivo': autorizacao.nome_arquivo,
          }
        });
        return;
      }

      // 2. Relatórios Finais
      const { data: relatorio, error: errorRel } = await supabase
        .from('relatorios_finais')
        .select('*')
        .eq('protocolo', prot)
        .maybeSingle();

      console.log('Relatorio:', relatorio, errorRel);

      if (relatorio) {
        setResultado({
          encontrado: true,
          tipo: 'Relatório Final',
          icone: FileText,
          data: relatorio,
          detalhes: {
            'Protocolo': relatorio.protocolo,
            'Data de Geração': format(new Date(relatorio.data_geracao), 'dd/MM/yyyy HH:mm'),
            'Arquivo': relatorio.nome_arquivo,
          }
        });
        return;
      }

      // 3. Planilhas Consolidadas (sempre pegar a mais recente)
      const { data: planilha, error: errorPlan } = await supabase
        .from('planilhas_consolidadas')
        .select('*')
        .eq('protocolo', prot)
        .order('data_geracao', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('Planilha:', planilha, errorPlan);

      if (planilha) {
        setResultado({
          encontrado: true,
          tipo: 'Planilha Consolidada',
          icone: FileSpreadsheet,
          data: planilha,
          detalhes: {
            'Protocolo': planilha.protocolo,
            'Data de Geração': format(new Date(planilha.data_geracao), 'dd/MM/yyyy HH:mm'),
            'Arquivo': planilha.nome_arquivo,
          }
        });
        return;
      }

      // 4. Encaminhamentos de Processo
      const { data: encaminhamento, error: errorEnc } = await supabase
        .from('encaminhamentos_processo')
        .select('*')
        .eq('protocolo', prot)
        .maybeSingle();

      console.log('Encaminhamento:', encaminhamento, errorEnc);

      if (encaminhamento) {
        setResultado({
          encontrado: true,
          tipo: 'Encaminhamento de Processo',
          icone: FileBox,
          data: encaminhamento,
          detalhes: {
            'Protocolo': encaminhamento.protocolo,
            'Data de Geração': format(new Date(encaminhamento.created_at), 'dd/MM/yyyy HH:mm'),
            'Processo': encaminhamento.processo_numero,
          }
        });
        return;
      }

      // Se não encontrou em nenhuma tabela
      setResultado({
        encontrado: false
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
