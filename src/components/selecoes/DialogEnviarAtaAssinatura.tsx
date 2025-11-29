import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Building2, Loader2 } from "lucide-react";

interface DialogEnviarAtaAssinaturaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ataId: string;
  selecaoId: string;
  onSuccess: () => void;
}

interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
}

interface Fornecedor {
  id: string;
  razao_social: string;
  cnpj: string;
}

export function DialogEnviarAtaAssinatura({
  open,
  onOpenChange,
  ataId,
  selecaoId,
  onSuccess,
}: DialogEnviarAtaAssinaturaProps) {
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [enviarFornecedores, setEnviarFornecedores] = useState(true);
  const [usuariosSelecionados, setUsuariosSelecionados] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, selecaoId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Buscar usuários internos (profiles)
      const { data: usuariosData, error: usuariosError } = await supabase
        .from("profiles")
        .select("id, nome_completo, email")
        .eq("ativo", true)
        .order("nome_completo");

      if (usuariosError) throw usuariosError;
      setUsuarios(usuariosData || []);

      // Buscar TODOS os fornecedores participantes (não apenas vencedores)
      const { data: propostasParticipantes, error: propostasError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          fornecedor_id,
          fornecedores (
            id,
            razao_social,
            cnpj
          )
        `)
        .eq("selecao_id", selecaoId);

      if (propostasError) throw propostasError;

      // IDs únicos de fornecedores participantes
      const fornecedoresUnicos = new Map<string, Fornecedor>();
      propostasParticipantes?.forEach((proposta: any) => {
        if (proposta.fornecedores && !fornecedoresUnicos.has(proposta.fornecedor_id)) {
          fornecedoresUnicos.set(proposta.fornecedor_id, {
            id: proposta.fornecedores.id,
            razao_social: proposta.fornecedores.razao_social,
            cnpj: proposta.fornecedores.cnpj,
          });
        }
      });
      setFornecedores(Array.from(fornecedoresUnicos.values()));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleUsuarioToggle = (usuarioId: string) => {
    setUsuariosSelecionados((prev) =>
      prev.includes(usuarioId)
        ? prev.filter((id) => id !== usuarioId)
        : [...prev, usuarioId]
    );
  };

  const handleEnviar = async () => {
    if (!enviarFornecedores && usuariosSelecionados.length === 0) {
      toast.error("Selecione pelo menos um destinatário");
      return;
    }

    setEnviando(true);
    try {
      // Enviar para fornecedores
      if (enviarFornecedores && fornecedores.length > 0) {
        const assinaturasFornecedores = fornecedores.map((f) => ({
          ata_id: ataId,
          fornecedor_id: f.id,
          status_assinatura: "pendente",
          data_notificacao: new Date().toISOString(),
        }));

        const { error: insertFornecedoresError } = await supabase
          .from("atas_assinaturas_fornecedor")
          .upsert(assinaturasFornecedores, { onConflict: "ata_id,fornecedor_id" });

        if (insertFornecedoresError) throw insertFornecedoresError;
      }

      // Enviar para usuários selecionados
      if (usuariosSelecionados.length > 0) {
        const assinaturasUsuarios = usuariosSelecionados.map((usuarioId) => ({
          ata_id: ataId,
          usuario_id: usuarioId,
          status_assinatura: "pendente",
          data_notificacao: new Date().toISOString(),
        }));

        const { error: insertUsuariosError } = await supabase
          .from("atas_assinaturas_usuario")
          .upsert(assinaturasUsuarios, { onConflict: "ata_id,usuario_id" });

        if (insertUsuariosError) throw insertUsuariosError;
      }

      // Atualizar ata como enviada
      const { error: updateError } = await supabase
        .from("atas_selecao")
        .update({
          enviada_fornecedores: true,
          data_envio_fornecedores: new Date().toISOString(),
        })
        .eq("id", ataId);

      if (updateError) throw updateError;

      const totalDestinatarios =
        (enviarFornecedores ? fornecedores.length : 0) + usuariosSelecionados.length;

      toast.success(
        `Ata enviada para ${totalDestinatarios} destinatário(s)! Eles receberão notificação para assinar.`
      );

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao enviar ata:", error);
      toast.error("Erro ao enviar ata para assinatura");
    } finally {
      setEnviando(false);
    }
  };

  const formatCNPJ = (cnpj: string) => {
    const numeros = cnpj.replace(/\D/g, "");
    return numeros.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Ata para Assinatura</DialogTitle>
          <DialogDescription>
            Selecione os destinatários que devem assinar a ata
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Seção Fornecedores */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Fornecedores Participantes</Label>
              </div>
              
              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="enviar-fornecedores"
                  checked={enviarFornecedores}
                  onCheckedChange={(checked) => setEnviarFornecedores(checked as boolean)}
                />
                <Label htmlFor="enviar-fornecedores" className="cursor-pointer flex-1">
                  Enviar para todos os fornecedores participantes ({fornecedores.length})
                </Label>
              </div>

              {enviarFornecedores && fornecedores.length > 0 && (
                <div className="ml-6 space-y-1 text-sm text-muted-foreground">
                  {fornecedores.map((f) => (
                    <p key={f.id}>
                      • {f.razao_social} ({formatCNPJ(f.cnpj)})
                    </p>
                  ))}
                </div>
              )}

              {fornecedores.length === 0 && (
                <p className="text-sm text-muted-foreground ml-6">
                  Nenhum fornecedor participante encontrado
                </p>
              )}
            </div>

            {/* Seção Usuários */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Usuários Internos</Label>
              </div>

              <ScrollArea className="h-[200px] border rounded-lg p-3">
                <div className="space-y-2">
                  {usuarios.map((usuario) => (
                    <div
                      key={usuario.id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded"
                    >
                      <Checkbox
                        id={`usuario-${usuario.id}`}
                        checked={usuariosSelecionados.includes(usuario.id)}
                        onCheckedChange={() => handleUsuarioToggle(usuario.id)}
                      />
                      <Label
                        htmlFor={`usuario-${usuario.id}`}
                        className="cursor-pointer flex-1"
                      >
                        <span className="font-medium">{usuario.nome_completo}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          ({usuario.email})
                        </span>
                      </Label>
                    </div>
                  ))}
                  {usuarios.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum usuário encontrado
                    </p>
                  )}
                </div>
              </ScrollArea>

              {usuariosSelecionados.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {usuariosSelecionados.length} usuário(s) selecionado(s)
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={handleEnviar} disabled={enviando || loading}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar para Assinatura"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
