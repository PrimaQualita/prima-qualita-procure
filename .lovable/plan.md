

# Plano: Dossiê Completo com Contratos (Download Direto)

## Resumo

Adicionar um botão "Baixar Dossiê com Contratos" ao lado do botão de download do Processo Completo no DialogAnexosProcesso. O botão só aparece quando existe um processo finalizado (PROCESSO_COMPLETO ou PROCESSO_COMPLETO_SELECAO).

## Comportamento

1. Busca o PDF do Processo Completo do storage
2. Busca contratos vinculados ao processo (via `processos_para_contratar` → `contratos_terceiros`)
3. Busca todos os documentos de cada contrato (`documentos_contrato`) e o arquivo principal do contrato
4. Ordena **todos** os documentos (contratos principais + aditivos + apostilamentos + rescisões) em ordem cronológica real pelo `created_at` do registro no sistema — sem agrupar por contrato
5. Mescla: Processo Completo → documentos em ordem cronológica
6. Numera todas as páginas ("Página X de Y")
7. Dispara download direto (blob URL), sem salvar no storage

## Ordem de mesclagem

```text
[Processo Completo PDF]
  ↓
[Documento mais antigo no sistema] (ex: Contrato Empresa A)
[2º documento] (ex: Contrato Empresa B)
[3º documento] (ex: Aditivo do Contrato A)
[4º documento] (ex: Apostilamento do Contrato B)
... tudo por created_at ASC
```

## Alterações

### `src/components/processos/DialogAnexosProcesso.tsx`

- Importar `FileStack` (ou ícone similar) do lucide-react
- Na seção onde renderiza o Processo Completo (linha ~1087, ao lado do botão Download existente), adicionar botão "Baixar Dossiê com Contratos"
- Estado `baixandoDossie` para loading
- Função `handleBaixarDossieContratos`:
  - Baixa o PDF do processo completo via storage
  - Consulta `processos_para_contratar` pelo `processo_compra_id` para obter os `contrato_terceiro_id`
  - Consulta `contratos_terceiros` para obter o `arquivo_url` de cada contrato e seu `created_at`
  - Consulta `documentos_contrato` para obter todos os aditivos/apostilamentos com `arquivo_url` e `created_at`
  - Junta contratos principais + documentos acessórios em um array único, ordena por `created_at ASC`
  - Baixa cada PDF do storage
  - Usa `pdf-lib` (PDFDocument) para mesclar tudo: Processo Completo + documentos cronológicos
  - Numera páginas com a mesma lógica já existente no projeto
  - Cria blob URL e dispara download
- O botão fica desabilitado (com tooltip) se não houver contratos vinculados

## Detalhes técnicos

- Buckets: `documents` para processo completo, `documents` para contratos (verificar campo `arquivo_url`)
- Usa `PDFDocument` do `pdf-lib` já instalado no projeto
- Reutiliza padrão de numeração de páginas dos PDFs existentes
- Nenhuma tabela nova ou migration necessária

