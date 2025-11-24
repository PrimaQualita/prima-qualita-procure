import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DialogEnviarSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  tituloSelecao: string;
  dataDisputa: string;
  horaDisputa: string;
}

export function DialogEnviarSelecao({
  open,
  onOpenChange,
  selecaoId,
  tituloSelecao,
  dataDisputa,
  horaDisputa,
}: DialogEnviarSelecaoProps) {
  const [copiado, setCopiado] = useState(false);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      loadFornecedores();
    }
  }, [open]);

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, razao_social, cnpj, email")
        .eq("status_aprovacao", "aprovado")
        .eq("ativo", true)
        .order("razao_social");

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores");
    }
  };

  const handleToggleFornecedor = (fornecedorId: string) => {
    setFornecedoresSelecionados(prev => 
      prev.includes(fornecedorId)
        ? prev.filter(id => id !== fornecedorId)
        : [...prev, fornecedorId]
    );
  };

  const handleEnviarConvites = async () => {
    if (fornecedoresSelecionados.length === 0) {
      toast.error("Selecione pelo menos um fornecedor");
      return;
    }

    setEnviando(true);
    try {
      // Criar convites para os fornecedores selecionados
      const convites = fornecedoresSelecionados.map(fornecedorId => ({
        selecao_id: selecaoId,
        fornecedor_id: fornecedorId,
        status_convite: "enviado",
        email_enviado_em: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("selecao_fornecedor_convites")
        .insert(convites);

      if (error) throw error;

      toast.success(`Convites enviados para ${fornecedoresSelecionados.length} fornecedor(es)`);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao enviar convites:", error);
      toast.error("Erro ao enviar convites");
    } finally {
      setEnviando(false);
    }
  };

  const linkSelecao = `${window.location.origin}/participar-selecao?id=${selecaoId}`;
  const dataFormatada = new Date(dataDisputa).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const textoEmail = `Prezado(a) Fornecedor(a),

Você está sendo convidado(a) a participar da seguinte seleção de fornecedores:

SELEÇÃO: ${tituloSelecao}
DATA DA SESSÃO DE DISPUTA: ${dataFormatada}
HORÁRIO: ${horaDisputa}

Para participar da disputa de lances, acesse o link abaixo utilizando suas credenciais de acesso:

${linkSelecao}

IMPORTANTE:
- Certifique-se de estar logado no sistema no horário da sessão de disputa
- Leia atentamente o Edital e o Aviso de Seleção antes de participar
- Os lances devem ser decrescentes (valores menores que o lance anterior)
- O sistema aceita lances em tempo real durante a sessão
- O fornecedor com o menor preço (ou maior desconto, conforme critério) será declarado vencedor

Para dúvidas ou mais informações, entre em contato através do sistema.

Atenciosamente,
Departamento de Compras`;

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(textoEmail);
      setCopiado(true);
      toast.success("Texto copiado para a área de transferência!");
      
      setTimeout(() => {
        setCopiado(false);
      }, 3000);
    } catch (error) {
      toast.error("Erro ao copiar texto");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Convite para Fornecedores</DialogTitle>
          <DialogDescription>
            Selecione os fornecedores que participarão desta seleção
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Lista de Fornecedores */}
          <div className="border rounded-lg p-4 max-h-[300px] overflow-y-auto">
            <h3 className="font-semibold mb-3">Fornecedores Disponíveis</h3>
            <div className="space-y-2">
              {fornecedores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum fornecedor aprovado encontrado</p>
              ) : (
                fornecedores.map((fornecedor) => (
                  <div key={fornecedor.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={fornecedor.id}
                      checked={fornecedoresSelecionados.includes(fornecedor.id)}
                      onCheckedChange={() => handleToggleFornecedor(fornecedor.id)}
                    />
                    <Label
                      htmlFor={fornecedor.id}
                      className="flex-1 cursor-pointer"
                    >
                      <span className="font-medium">{fornecedor.razao_social}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        ({fornecedor.cnpj})
                      </span>
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Texto do Email */}
          <div>
            <h3 className="font-semibold mb-2">Modelo de E-mail</h3>
            <div className="bg-muted p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono">{textoEmail}</pre>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-2">
            <Button
              onClick={handleEnviarConvites}
              className="flex-1"
              disabled={fornecedoresSelecionados.length === 0 || enviando}
            >
              <Send className="h-4 w-4 mr-2" />
              {enviando ? "Enviando..." : `Enviar Convites (${fornecedoresSelecionados.length})`}
            </Button>

            <Button
              onClick={handleCopiar}
              variant="outline"
              disabled={enviando}
            >
              <Copy className="h-4 w-4 mr-2" />
              {copiado ? "Copiado!" : "Copiar Texto"}
            </Button>

            <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={enviando}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
