
CREATE TABLE public.propostas_cotacao_cientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_resposta_fornecedor_id UUID NOT NULL REFERENCES public.cotacao_respostas_fornecedor(id) ON DELETE CASCADE,
  usuario_ciente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data_ciencia TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cotacao_resposta_fornecedor_id)
);

ALTER TABLE public.propostas_cotacao_cientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver ciências" ON public.propostas_cotacao_cientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores podem inserir ciência" ON public.propostas_cotacao_cientes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND gestor = true)
  );
