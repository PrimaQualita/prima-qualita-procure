ALTER TABLE public.contratos_terceiros
  DROP CONSTRAINT contratos_terceiros_processo_para_contratar_id_fkey;

ALTER TABLE public.contratos_terceiros
  ADD CONSTRAINT contratos_terceiros_processo_para_contratar_id_fkey
  FOREIGN KEY (processo_para_contratar_id)
  REFERENCES public.processos_para_contratar(id)
  ON DELETE SET NULL;