// Validação de Senha Forte
export interface ValidacaoSenha {
  valida: boolean;
  temMinimo8: boolean;
  temMaiuscula: boolean;
  temMinuscula: boolean;
  temNumero: boolean;
  temEspecial: boolean;
}

export function validarSenhaForte(senha: string): ValidacaoSenha {
  const resultado: ValidacaoSenha = {
    valida: false,
    temMinimo8: senha.length >= 8,
    temMaiuscula: /[A-Z]/.test(senha),
    temMinuscula: /[a-z]/.test(senha),
    temNumero: /[0-9]/.test(senha),
    temEspecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha),
  };

  resultado.valida =
    resultado.temMinimo8 &&
    resultado.temMaiuscula &&
    resultado.temMinuscula &&
    resultado.temNumero &&
    resultado.temEspecial;

  return resultado;
}

// Validação de CPF
export function validarCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  cpf = cpf.replace(/[^\d]/g, '');

  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false;

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cpf)) return false;

  // Validação do primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;

  // Validação do segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(10))) return false;

  return true;
}

// Validação de CNPJ
export function validarCNPJ(cnpj: string): boolean {
  // Remove caracteres não numéricos
  cnpj = cnpj.replace(/[^\d]/g, '');

  // Verifica se tem 14 dígitos
  if (cnpj.length !== 14) return false;

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cnpj)) return false;

  // Validação do primeiro dígito verificador
  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;

  // Validação do segundo dígito verificador
  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(1))) return false;

  return true;
}

// Formatação de CPF
export function formatarCPF(cpf: string): string {
  cpf = cpf.replace(/[^\d]/g, '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Formatação de CNPJ
export function formatarCNPJ(cnpj: string): string {
  cnpj = cnpj.replace(/[^\d]/g, '');
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Máscara de CPF para input
export function mascaraCPF(value: string): string {
  value = value.replace(/\D/g, '');
  value = value.replace(/(\d{3})(\d)/, '$1.$2');
  value = value.replace(/(\d{3})(\d)/, '$1.$2');
  value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return value.slice(0, 14);
}

// Máscara de CNPJ para input
export function mascaraCNPJ(value: string): string {
  value = value.replace(/\D/g, '');
  value = value.replace(/^(\d{2})(\d)/, '$1.$2');
  value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
  value = value.replace(/(\d{4})(\d)/, '$1-$2');
  return value.slice(0, 18);
}

// Validação de Telefone
export function validarTelefone(telefone: string): boolean {
  const telefoneLimpo = telefone.replace(/\D/g, '');
  // Aceita telefone fixo (10 dígitos: DDD + 8 dígitos) ou celular (11 dígitos: DDD + 9 dígitos)
  return telefoneLimpo.length === 10 || telefoneLimpo.length === 11;
}

// Máscara de Telefone para input
export function mascaraTelefone(value: string): string {
  value = value.replace(/\D/g, '');
  
  if (value.length <= 10) {
    // Formato telefone fixo: (XX) XXXX-XXXX
    value = value.replace(/^(\d{2})(\d)/, '($1) $2');
    value = value.replace(/(\d{4})(\d)/, '$1-$2');
    return value.slice(0, 14); // (XX) XXXX-XXXX
  } else {
    // Formato celular: (XX) XXXXX-XXXX
    value = value.replace(/^(\d{2})(\d)/, '($1) $2');
    value = value.replace(/(\d{5})(\d)/, '$1-$2');
    return value.slice(0, 15); // (XX) XXXXX-XXXX
  }
}
