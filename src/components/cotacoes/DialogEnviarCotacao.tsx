import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DialogEnviarCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  processoNumero: string;
  tituloCotacao: string;
  dataLimite: string;
}

interface Fornecedor {
  id: string;
  razao_social: string;
  email: string;
}

interface ConviteGerado {
  fornecedor_id: string;
  link: string;
}

export function DialogEnviarCotacao({
  open,
  onOpenChange,
  cotacaoId,
  processoNumero,
  tituloCotacao,
  dataLimite,
}: DialogEnviarCotacaoProps) {
  const [copiado, setCopiado] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
  const [convitesGerados, setConvitesGerados] = useState<ConviteGerado[]>([]);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (open) {
      loadFornecedores();
      loadConvitesExistentes();
    }
  }, [open, cotacaoId]);

  const loadFornecedores = async () => {
    const { data, error } = await supabase
      .from("fornecedores")
      .select("id, razao_social, email")
      .eq("status_aprovacao", "aprovado")
      .eq("ativo", true)
      .order("razao_social");

    if (error) {
      console.error("Erro ao carregar fornecedores:", error);
    } else {
      setFornecedores(data || []);
    }
  };

  const loadConvitesExistentes = async () => {
    const { data, error } = await supabase
      .from("cotacao_fornecedor_convites")
      .select("fornecedor_id, id")
      .eq("cotacao_id", cotacaoId);

    if (error) {
      console.error("Erro ao carregar convites:", error);
    } else if (data) {
      const convites = data.map(c => ({
        fornecedor_id: c.fornecedor_id,
        link: `${window.location.origin}/resposta-cotacao?convite=${c.id}`
      }));
      setConvitesGerados(convites);
    }
  };

  const gerarConvites = async () => {
    if (fornecedoresSelecionados.length === 0) {
      toast.error("Selecione pelo menos um fornecedor");
      return;
    }

    setGerando(true);
    try {
      const novosConvites = [];
      
      for (const fornecedorId of fornecedoresSelecionados) {
        // Verificar se já existe convite
        const conviteExistente = convitesGerados.find(c => c.fornecedor_id === fornecedorId);
        if (conviteExistente) continue;

        const { data, error } = await supabase
          .from("cotacao_fornecedor_convites")
          .insert({
            cotacao_id: cotacaoId,
            fornecedor_id: fornecedorId,
            status_convite: "enviado",
          })
          .select()
          .single();

        if (error) throw error;

        novosConvites.push({
          fornecedor_id: fornecedorId,
          link: `${window.location.origin}/resposta-cotacao?convite=${data.id}`
        });
      }

      setConvitesGerados([...convitesGerados, ...novosConvites]);
      toast.success("Convites gerados com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar convites:", error);
      toast.error("Erro ao gerar convites");
    } finally {
      setGerando(false);
    }
  };


  const gerarTextoEmailFornecedor = (fornecedorId: string) => {
    const fornecedor = fornecedores.find(f => f.id === fornecedorId);
    const convite = convitesGerados.find(c => c.fornecedor_id === fornecedorId);
    
    if (!fornecedor || !convite) return "";

    const dataFormatada = new Date(dataLimite).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return `Prezado(a) ${fornecedor.razao_social},

Solicitamos cotação de preços para o processo abaixo:

Processo: ${processoNumero}
Objeto: ${tituloCotacao}
Prazo para Resposta: ${dataFormatada}

Para enviar sua proposta, acesse o link abaixo e preencha as informações solicitadas:

${convite.link}

Importante:
- Preencha todos os dados da sua empresa
- Informe os valores unitários de cada item solicitado
- Envie sua resposta até o prazo estabelecido

Atenciosamente,
Departamento de Compras`;
  };

  const copiarTextoFornecedor = async (fornecedorId: string) => {
    const texto = gerarTextoEmailFornecedor(fornecedorId);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado!");
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar texto");
    }
  };

  const adicionarFornecedor = (fornecedorId: string) => {
    if (!fornecedoresSelecionados.includes(fornecedorId)) {
      setFornecedoresSelecionados([...fornecedoresSelecionados, fornecedorId]);
    }
  };

  const removerFornecedor = (fornecedorId: string) => {
    setFornecedoresSelecionados(fornecedoresSelecionados.filter(id => id !== fornecedorId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Cotação para Fornecedores</DialogTitle>
          <DialogDescription>
            Selecione os fornecedores, gere os convites e copie o texto do e-mail
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Seleção de Fornecedores */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select onValueChange={adicionarFornecedor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores
                      .filter(f => !fornecedoresSelecionados.includes(f.id))
                      .map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.razao_social} ({f.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={gerarConvites} 
                disabled={gerando || fornecedoresSelecionados.length === 0}
              >
                {gerando ? "Gerando..." : "Gerar Convites"}
              </Button>
            </div>

            {/* Lista de fornecedores selecionados */}
            {fornecedoresSelecionados.length > 0 && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <h4 className="font-semibold mb-2">Fornecedores Selecionados:</h4>
                <div className="space-y-2">
                  {fornecedoresSelecionados.map(id => {
                    const fornecedor = fornecedores.find(f => f.id === id);
                    return (
                      <div key={id} className="flex items-center justify-between bg-background p-2 rounded">
                        <span className="text-sm">{fornecedor?.razao_social}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removerFornecedor(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Convites Gerados */}
          {convitesGerados.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Convites Gerados - Copie o texto para cada fornecedor:</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convitesGerados.map(convite => {
                    const fornecedor = fornecedores.find(f => f.id === convite.fornecedor_id);
                    return (
                      <TableRow key={convite.fornecedor_id}>
                        <TableCell>{fornecedor?.razao_social}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fornecedor?.email}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-xs truncate">
                          {convite.link}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copiarTextoFornecedor(convite.fornecedor_id)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar E-mail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Próximos passos:</strong>
            </p>
            <ol className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-decimal list-inside">
              <li>Selecione os fornecedores que deseja convidar</li>
              <li>Clique em "Gerar Convites" para criar os links únicos</li>
              <li>Clique em "Copiar E-mail" para cada fornecedor</li>
              <li>Abra seu e-mail institucional (Outlook)</li>
              <li>Cole o texto no corpo do e-mail e envie</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
