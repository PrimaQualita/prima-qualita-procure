## Correção: Duplicação de Autorizações e Homologações

### 1. Trava de UI nos botões (Cotacoes.tsx)
- Adicionar estado `gerandoAutorizacaoSelecao` e `gerandoAutorizacaoCompraDireta`
- Aplicar `disabled={gerando...}` + spinner nos dois botões "Gerar Autorização"
- `try/finally` para garantir reset do estado

### 2. Trava de UI no botão de Homologação (DetalheSelecao.tsx)
- Adicionar estado `gerandoHomologacao`
- `disabled` + spinner no botão "Gerar Homologação"
- `try/finally`

### 3. Migration: UNIQUE constraints
- Pré-limpeza: para cada `(cotacao_id, tipo_autorizacao)` em `autorizacoes_processo` e cada `selecao_id` em `homologacoes_selecao`, manter apenas o registro mais antigo (menor `created_at`), deletar duplicados.
- `ALTER TABLE autorizacoes_processo ADD CONSTRAINT autorizacoes_processo_cotacao_tipo_unique UNIQUE (cotacao_id, tipo_autorizacao);`
- `ALTER TABLE homologacoes_selecao ADD CONSTRAINT homologacoes_selecao_selecao_unique UNIQUE (selecao_id);`

### 4. Tratamento de erro 23505
- Em ambos os handlers, capturar Postgres error code `23505` e exibir toast amigável: "Já existe uma autorização/homologação para este registro" em vez do erro técnico.

### 5. Limpeza dos duplicados do processo 028/2026
- A pré-limpeza da migration cobre automaticamente este caso (mantém o mais antigo `7702ad11…` e remove os outros 6).

### Arquivos afetados
- `src/pages/Cotacoes.tsx`
- `src/pages/DetalheSelecao.tsx`
- Nova migration SQL

### Risco
Baixo — mudanças cirúrgicas nos handlers + constraints alinhadas à lógica já existente (1 autorização por cotação/tipo, 1 homologação por seleção).
