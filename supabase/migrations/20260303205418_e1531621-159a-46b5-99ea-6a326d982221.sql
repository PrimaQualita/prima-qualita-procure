ALTER TABLE public.notificacoes_documentos_processo
ADD COLUMN IF NOT EXISTS status_notificacao text NOT NULL DEFAULT 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notificacoes_documentos_processo_status_check'
      AND conrelid = 'public.notificacoes_documentos_processo'::regclass
  ) THEN
    ALTER TABLE public.notificacoes_documentos_processo
    ADD CONSTRAINT notificacoes_documentos_processo_status_check
    CHECK (status_notificacao IN ('pendente', 'gerada', 'atendida_manual'));
  END IF;
END $$;

UPDATE public.notificacoes_documentos_processo
SET status_notificacao = CASE
  WHEN atendida = true THEN 'atendida_manual'
  ELSE 'pendente'
END
WHERE status_notificacao NOT IN ('pendente', 'gerada', 'atendida_manual')
   OR status_notificacao IS NULL
   OR (status_notificacao = 'pendente' AND atendida = true);

CREATE INDEX IF NOT EXISTS idx_notificacoes_documentos_status_destinatario
ON public.notificacoes_documentos_processo (destinatario_id, status_notificacao, created_at DESC);