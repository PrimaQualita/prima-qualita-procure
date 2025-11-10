import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

interface Fornecedor {
  id?: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  telefone: string;
  email: string;
  nome_socio_administrador: string;
  nomes_socios_cotistas?: string;
  segmento_atividade?: string;
  ativo?: boolean;
}

interface DialogFornecedorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedor: Fornecedor | null;
  onSave: (fornecedor: Omit<Fornecedor, "id">) => Promise<void>;
}

export function DialogFornecedor({
  open,
  onOpenChange,
  fornecedor,
  onSave,
}: DialogFornecedorProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Omit<Fornecedor, "id">>({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    telefone: "",
    email: "",
    nome_socio_administrador: "",
    nomes_socios_cotistas: "",
    segmento_atividade: "",
    ativo: true,
  });

  useEffect(() => {
    if (fornecedor) {
      setFormData({
        razao_social: fornecedor.razao_social,
        nome_fantasia: fornecedor.nome_fantasia || "",
        cnpj: fornecedor.cnpj,
        telefone: fornecedor.telefone,
        email: fornecedor.email,
        nome_socio_administrador: fornecedor.nome_socio_administrador,
        nomes_socios_cotistas: fornecedor.nomes_socios_cotistas || "",
        segmento_atividade: fornecedor.segmento_atividade || "",
        ativo: fornecedor.ativo ?? true,
      });
    } else {
      setFormData({
        razao_social: "",
        nome_fantasia: "",
        cnpj: "",
        telefone: "",
        email: "",
        nome_socio_administrador: "",
        nomes_socios_cotistas: "",
        segmento_atividade: "",
        ativo: true,
      });
    }
  }, [fornecedor, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {fornecedor ? "Editar Fornecedor" : "Novo Fornecedor"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="razao_social">Razão Social *</Label>
              <Input
                id="razao_social"
                value={formData.razao_social}
                onChange={(e) =>
                  setFormData({ ...formData, razao_social: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
              <Input
                id="nome_fantasia"
                value={formData.nome_fantasia}
                onChange={(e) =>
                  setFormData({ ...formData, nome_fantasia: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                value={formData.cnpj}
                onChange={(e) =>
                  setFormData({ ...formData, cnpj: e.target.value })
                }
                required
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) =>
                  setFormData({ ...formData, telefone: e.target.value })
                }
                required
                placeholder="(00) 00000-0000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome_socio_administrador">Sócio Administrador *</Label>
              <Input
                id="nome_socio_administrador"
                value={formData.nome_socio_administrador}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    nome_socio_administrador: e.target.value,
                  })
                }
                required
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="segmento_atividade">Segmento de Atividade</Label>
              <Input
                id="segmento_atividade"
                value={formData.segmento_atividade}
                onChange={(e) =>
                  setFormData({ ...formData, segmento_atividade: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nomes_socios_cotistas">Sócios Cotistas</Label>
            <RichTextEditor
              value={formData.nomes_socios_cotistas || ""}
              onChange={(value) =>
                setFormData({ ...formData, nomes_socios_cotistas: value })
              }
              placeholder="Liste os sócios cotistas..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
