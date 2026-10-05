/**
 * Cálculo de depreciação (método linear quotas constantes).
 * Vidas úteis padrão conforme DR 25/2009:
 *   432 Edifícios              : 50 anos  (2%)
 *   433 Equipamento básico     : 8 anos   (12.5%)  — desporto, insufláveis
 *   434 Equipamento transporte : 5 anos   (20%)
 *   435 Equip. administrativo  : 8 anos mobiliário / 3 anos TI
 */

export const VIDA_UTIL_PADRAO: Record<string, number> = {
  '432': 50,   // Edifícios
  '433': 8,    // Equipamento básico
  '434': 5,    // Equipamento transporte
  '435': 8,    // Equipamento administrativo (mobiliário por omissão)
};

/** Depreciação anual do item (ignora valor residual se não dado) */
export function depreciacaoAnual(custoAquisicao: number, anos: number, valorResidual = 0): number {
  if (!anos || anos <= 0) return 0;
  return Math.max(0, (custoAquisicao - valorResidual) / anos);
}

/** Depreciação acumulada à data de referência (full years lineares) */
export function depreciacaoAcumulada(opts: {
  custoAquisicao: number;
  anos: number;
  dataAquisicao: Date;
  dataReferencia: Date;
  valorResidual?: number;
  dataAbateReal?: Date | null;
}): number {
  const { custoAquisicao, anos, dataAquisicao, dataReferencia, valorResidual = 0, dataAbateReal } = opts;
  if (!anos || anos <= 0) return 0;
  const fim = dataAbateReal && dataAbateReal < dataReferencia ? dataAbateReal : dataReferencia;
  const diffMs = fim.getTime() - dataAquisicao.getTime();
  if (diffMs <= 0) return 0;
  const anosDecorridos = diffMs / (365.25 * 24 * 3600 * 1000);
  const depreciavel = custoAquisicao - valorResidual;
  const acumulada = Math.min(depreciavel, (depreciavel / anos) * anosDecorridos);
  return Math.max(0, acumulada);
}

/** Valor líquido contabilístico à data de referência */
export function valorLiquido(opts: {
  custoAquisicao: number;
  anos: number;
  dataAquisicao: Date;
  dataReferencia: Date;
  valorResidual?: number;
  dataAbateReal?: Date | null;
}): number {
  return opts.custoAquisicao - depreciacaoAcumulada(opts);
}
