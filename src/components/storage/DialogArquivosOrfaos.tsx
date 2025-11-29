import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Trash2, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DialogArquivosOrfaosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arquivos: any[];
  onArquivosDeletados: () => void;
}

export function DialogArquivosOrfaos({ open, onOpenChange, arquivos, onArquivosDeletados }: DialogArquivosOrfaosProps) {
  const [search, setSearch] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [deletando, setDeletando] = useState(false);

  const arquivosFiltrados = useMemo(() => {
    if (!search.trim()) return arquivos;
    const termo = search.toLowerCase();
    return arquivos.filter((arq: any) => {
      const fileName = (typeof arq === 'string' ? arq : arq.path).split('/').pop() || '';
      return fileName.toLowerCase().includes(termo);
    });
  }, [arquivos, search]);

  const toggleSelecionado = (path: string) => {
    const novosSelecionados = new Set(selecionados);
    if (novosSelecionados.has(path)) {
      novosSelecionados.delete(path);
    } else {
      novosSelecionados.add(path);
    }
    setSelecionados(novosSelecionados);
  };

  const toggleTodos = () => {
    if (selecionados.size === arquivosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      const todosPaths = arquivosFiltrados.map((arq: any) => 
        typeof arq === 'string' ? arq : arq.path
      );
      setSelecionados(new Set(todosPaths));
    }
  };

  const deletarSelecionados = async () => {
    if (selecionados.size === 0) {
      toast.error("Selecione ao menos um arquivo para deletar");
      return;
    }

    setDeletando(true);
    try {
      const { error } = await supabase.functions.invoke('limpar-storage', {
        body: { 
          paths: Array.from(selecionados),
          deletarTudo: false 
        }
      });

      if (error) throw error;

      toast.success(`${selecionados.size} arquivo(s) deletado(s) com sucesso`);
      setSelecionados(new Set());
      onArquivosDeletados();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao deletar arquivos:', error);
      toast.error("Erro ao deletar arquivos selecionados");
    } finally {
      setDeletando(false);
    }
  };

  const deletarTodos = async () => {
    setDeletando(true);
    try {
      const { error } = await supabase.functions.invoke('limpar-storage', {
        body: { deletarTudo: true }
      });

      if (error) throw error;

      toast.success("Todos os arquivos órfãos foram deletados");
      setSelecionados(new Set());
      onArquivosDeletados();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao deletar todos os arquivos:', error);
      toast.error("Erro ao deletar todos os arquivos");
    } finally {
      setDeletando(false);
    }
  };

  const todosSelecionados = selecionados.size === arquivosFiltrados.length && arquivosFiltrados.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Arquivos Órfãos no Storage ({arquivos.length})</DialogTitle>
        </DialogHeader>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar arquivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded border">
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={todosSelecionados}
              onCheckedChange={toggleTodos}
            />
            <span className="text-sm font-medium">
              Selecionar Todos ({selecionados.size} de {arquivosFiltrados.length})
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={deletarSelecionados}
              disabled={deletando || selecionados.size === 0}
            >
              {deletando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Deletar Selecionados
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={deletarTodos}
              disabled={deletando}
            >
              {deletando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Deletar Todos
            </Button>
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {arquivosFiltrados.map((arq: any, i: number) => {
            const path = typeof arq === 'string' ? arq : arq.path;
            const fileName = path.split('/').pop() || path;
            const size = typeof arq === 'object' ? arq.size : 0;
            const estaSelecionado = selecionados.has(path);

            return (
              <div 
                key={i} 
                className={`flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-muted/80 transition-colors ${
                  estaSelecionado ? 'bg-muted border-primary' : 'bg-muted/50'
                }`}
                onClick={() => toggleSelecionado(path)}
              >
                <Checkbox 
                  checked={estaSelecionado}
                  onCheckedChange={() => toggleSelecionado(path)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">{path}</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {(size / 1024).toFixed(1)} KB
                </span>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
