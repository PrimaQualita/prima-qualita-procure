-- Adicionar política RLS para permitir acesso público à verificação de planilhas consolidadas
CREATE POLICY "Public can verify planilhas by protocolo"
ON public.planilhas_consolidadas
FOR SELECT
USING (true);