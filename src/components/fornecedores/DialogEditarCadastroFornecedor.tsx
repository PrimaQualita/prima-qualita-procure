import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface DialogEditarCadastroFornecedorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedor: any;
  onSave: () => void;
}

const UFs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function DialogEditarCadastroFornecedor({
  open,
  onOpenChange,
  fornecedor,
  onSave,
}: DialogEditarCadastroFornecedorProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    razao_social: "",
    nome_fantasia: "",
    telefone: "",
    email: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
    segmento_atividade: "",
    nome_socio_administrador: "",
    nomes_socios_cotistas: "",
  });
  const [responsaveisLegais, setResponsaveisLegais] = useState<string[]>([""]);

  useEffect(() => {
    if (open && fornecedor) {
      // Parse address from endereco_comercial
      const endereco = fornecedor.endereco_comercial || "";
      const partes = endereco.split(", ");
      
      // Try to extract components
      let logradouro = "";
      let numero = "";
      let complemento = "";
      let bairro = "";
      let municipio = "";
      let uf = "";
      let cep = "";
      
      partes.forEach((parte: string) => {
        if (parte.startsWith("Nº ")) {
          numero = parte.replace("Nº ", "");
        } else if (parte.startsWith("CEP: ")) {
          cep = parte.replace("CEP: ", "");
        } else if (UFs.includes(parte)) {
          uf = parte;
        } else if (!logradouro) {
          logradouro = parte;
        } else if (!bairro) {
          bairro = parte;
        } else if (!municipio) {
          municipio = parte;
        } else {
          complemento = parte;
        }
      });

      setFormData({
        razao_social: fornecedor.razao_social || "",
        nome_fantasia: fornecedor.nome_fantasia || "",
        telefone: fornecedor.telefone || "",
        email: fornecedor.email || "",
        logradouro,
        numero,
        complemento,
        bairro,
        municipio,
        uf,
        cep,
        segmento_atividade: fornecedor.segmento_atividade || "",
        nome_socio_administrador: fornecedor.nome_socio_administrador || "",
        nomes_socios_cotistas: fornecedor.nomes_socios_cotistas || "",
      });

      // Load responsaveis_legais
      const responsaveis = Array.isArray(fornecedor.responsaveis_legais)
        ? fornecedor.responsaveis_legais
        : [];
      setResponsaveisLegais(responsaveis.length > 0 ? responsaveis : [""]);
    }
  }, [open, fornecedor]);

  const handleAddResponsavel = () => {
    setResponsaveisLegais([...responsaveisLegais, ""]);
  };

  const handleRemoveResponsavel = (index: number) => {
    if (responsaveisLegais.length > 1) {
      setResponsaveisLegais(responsaveisLegais.filter((_, i) => i !== index));
    }
  };

  const handleResponsavelChange = (index: number, value: string) => {
    const newResponsaveis = [...responsaveisLegais];
    newResponsaveis[index] = value;
    setResponsaveisLegais(newResponsaveis);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.razao_social.trim()) {
      toast.error("Razão Social é obrigatória");
      return;
    }

    setLoading(true);

    try {
      const enderecoCompleto = [
        formData.logradouro,
        formData.numero ? `Nº ${formData.numero}` : "",
        formData.complemento,
        formData.bairro,
        formData.municipio,
        formData.uf,
        formData.cep ? `CEP: ${formData.cep}` : ""
      ].filter(Boolean).join(", ");

      const responsaveisValidos = responsaveisLegais.filter(r => r.trim() !== "");

      const { error } = await supabase
        .from("fornecedores")
        .update({
          razao_social: formData.razao_social,
          nome_fantasia: formData.nome_fantasia || null,
          telefone: formData.telefone,
          email: formData.email,
          endereco_comercial: enderecoCompleto,
          segmento_atividade: formData.segmento_atividade || null,
          nome_socio_administrador: formData.nome_socio_administrador || null,
          nomes_socios_cotistas: formData.nomes_socios_cotistas || null,
          responsaveis_legais: responsaveisValidos,
        })
        .eq("id", fornecedor.id);

      if (error) throw error;

      toast.success("Cadastro atualizado com sucesso!");
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao atualizar cadastro:", error);
      toast.error("Erro ao atualizar cadastro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cadastro</DialogTitle>
          <DialogDescription>
            Atualize as informações do seu cadastro como fornecedor
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados da Empresa */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Dados da Empresa</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="razao_social">Razão Social *</Label>
                <Input
                  id="razao_social"
                  value={formData.razao_social}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
                <Input
                  id="nome_fantasia"
                  value={formData.nome_fantasia}
                  onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={fornecedor?.cnpj || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="segmento_atividade">Segmento de Atividade</Label>
              <Input
                id="segmento_atividade"
                value={formData.segmento_atividade}
                onChange={(e) => setFormData({ ...formData, segmento_atividade: e.target.value })}
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Endereço</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="logradouro">Logradouro</Label>
                <Input
                  id="logradouro"
                  value={formData.logradouro}
                  onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={formData.complemento}
                  onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={formData.bairro}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="municipio">Município</Label>
                <Input
                  id="municipio"
                  value={formData.municipio}
                  onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uf">UF</Label>
                <Select
                  value={formData.uf}
                  onValueChange={(value) => setFormData({ ...formData, uf: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {UFs.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.cep}
                  onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Sócios */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Informações Societárias</h3>
            
            <div className="space-y-2">
              <Label htmlFor="nome_socio_administrador">Nome do Sócio Administrador</Label>
              <Input
                id="nome_socio_administrador"
                value={formData.nome_socio_administrador}
                onChange={(e) => setFormData({ ...formData, nome_socio_administrador: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nomes_socios_cotistas">Nomes dos Sócios Cotistas</Label>
              <Input
                id="nomes_socios_cotistas"
                value={formData.nomes_socios_cotistas}
                onChange={(e) => setFormData({ ...formData, nomes_socios_cotistas: e.target.value })}
                placeholder="Separe por vírgula se houver mais de um"
              />
            </div>
          </div>

          {/* Responsáveis Legais */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-lg">Responsáveis Legais</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddResponsavel}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>
            
            <div className="space-y-3">
              {responsaveisLegais.map((responsavel, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={responsavel}
                    onChange={(e) => handleResponsavelChange(index, e.target.value)}
                    placeholder={`Nome completo do responsável legal ${index + 1}`}
                  />
                  {responsaveisLegais.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveResponsavel(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
