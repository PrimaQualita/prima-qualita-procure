
-- Table to track "ciente" (acknowledgment) for process events by gestors
-- Similar pattern to propostas_cotacao_cientes
CREATE TABLE public.eventos_processo_cientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_evento TEXT NOT NULL, -- 'autorizacao_compra_direta', 'autorizacao_selecao', 'homologacao', 'resposta_compliance', 'resposta_contabilidade'
  referencia_id UUID NOT NULL, -- ID of the source record (autorizacao, analise_compliance, encaminhamento_contabilidade)
  usuario_ciente_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tipo_evento, referencia_id)
);

-- Enable RLS
ALTER TABLE public.eventos_processo_cientes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select
CREATE POLICY "Authenticated users can select eventos_processo_cientes"
ON public.eventos_processo_cientes
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert (validated by auth.uid())
CREATE POLICY "Authenticated users can insert eventos_processo_cientes"
ON public.eventos_processo_cientes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_ciente_id);
