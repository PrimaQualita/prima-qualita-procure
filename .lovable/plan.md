

# Plan: Exportar Lista Completa de Arquivos do Storage

## O que será feito
Gerar um arquivo CSV com todos os 577 arquivos dos 3 buckets (avatars, documents, processo-anexos), incluindo a URL pública de download de cada um.

## Abordagem técnica

1. **Consultar** todos os arquivos via `storage.objects` com campos: bucket, path, tamanho, tipo, data de criação
2. **Construir URL pública** no formato:
   ```
   https://ypkiikefrcpkqmwacjjb.supabase.co/storage/v1/object/public/{bucket}/{path}
   ```
3. **Gerar CSV** com colunas: Bucket, Caminho, URL Pública, Tamanho (KB), Tipo, Data de Criação
4. **Salvar** em `/mnt/documents/lista_arquivos_storage.csv`

## Resultado
Arquivo CSV para download com todos os 577 arquivos e suas URLs públicas de acesso direto.

