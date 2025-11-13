-- Add protocolo column to planilhas_consolidadas
ALTER TABLE public.planilhas_consolidadas 
ADD COLUMN IF NOT EXISTS protocolo TEXT UNIQUE;