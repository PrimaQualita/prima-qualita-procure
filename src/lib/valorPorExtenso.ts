// Converte número para valor monetário por extenso em português brasileiro
const unidades = ['', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function numeroPorExtenso(num: number): string {
  if (num === 0) return 'zero';
  if (num === 100) return 'cem';
  
  let extenso = '';
  
  // Bilhões
  if (num >= 1000000000) {
    const bilhoes = Math.floor(num / 1000000000);
    extenso += bilhoes === 1 ? 'um bilhao' : numeroPorExtenso(bilhoes) + ' bilhoes';
    num %= 1000000000;
    if (num > 0) extenso += ' ';
  }
  
  // Milhões
  if (num >= 1000000) {
    const milhoes = Math.floor(num / 1000000);
    extenso += milhoes === 1 ? 'um milhao' : numeroPorExtenso(milhoes) + ' milhoes';
    num %= 1000000;
    if (num > 0) extenso += ' ';
  }
  
  // Milhares
  if (num >= 1000) {
    const milhares = Math.floor(num / 1000);
    extenso += milhares === 1 ? 'mil' : numeroPorExtenso(milhares) + ' mil';
    num %= 1000;
    if (num > 0) {
      // Usar "e" se o restante for menor que 100 ou centenas exatas
      if (num < 100 || num % 100 === 0) {
        extenso += ' e ';
      } else {
        extenso += ' ';
      }
    }
  }
  
  // Centenas
  if (num >= 100) {
    if (num === 100) {
      extenso += 'cem';
      num = 0;
    } else {
      extenso += centenas[Math.floor(num / 100)];
      num %= 100;
      if (num > 0) extenso += ' e ';
    }
  }
  
  // Dezenas e unidades
  if (num >= 20) {
    extenso += dezenas[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) extenso += ' e ';
  } else if (num >= 10) {
    extenso += especiais[num - 10];
    num = 0;
  }
  
  // Unidades
  if (num > 0 && num < 10) {
    extenso += unidades[num];
  }
  
  return extenso.trim();
}

export function valorPorExtenso(valor: number): string {
  if (valor === 0) return 'zero reais';
  
  const parteInteira = Math.floor(valor);
  const centavos = Math.round((valor - parteInteira) * 100);
  
  let extenso = '';
  
  // Parte inteira
  if (parteInteira > 0) {
    if (parteInteira === 1) {
      extenso = 'um real';
    } else {
      extenso = numeroPorExtenso(parteInteira) + ' reais';
    }
  }
  
  // Centavos
  if (centavos > 0) {
    if (parteInteira > 0) {
      extenso += ' e ';
    }
    if (centavos === 1) {
      extenso += 'um centavo';
    } else {
      extenso += numeroPorExtenso(centavos) + ' centavos';
    }
  }
  
  return extenso;
}
