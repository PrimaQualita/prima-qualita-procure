-- Adicionar novo valor 'contratacao' ao enum status_processo
ALTER TYPE status_processo ADD VALUE IF NOT EXISTS 'contratacao';