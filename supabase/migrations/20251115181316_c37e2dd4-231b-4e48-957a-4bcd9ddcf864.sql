-- Adicionar coluna protocolo na tabela cotacao_respostas_fornecedor
ALTER TABLE public.cotacao_respostas_fornecedor
ADD COLUMN protocolo text;

-- Criar índice para busca rápida por protocolo
CREATE INDEX idx_cotacao_respostas_fornecedor_protocolo 
ON public.cotacao_respostas_fornecedor(protocolo);

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.cotacao_respostas_fornecedor.protocolo IS 'Protocolo de certificação digital no formato XXXX-XXXX-XXXX-XXXX';