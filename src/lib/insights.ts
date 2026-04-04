export const getInsight = (current: number, previous: number) => {
  if (current > previous) {
    return "Ranking caiu — considere reduzir o preço para recuperar posição";
  } else if (current < previous) {
    return "Ranking melhorou — avalie aumentar o preço ou reduzir desconto";
  }
  return "Ranking estável — continue monitorando";
};

export const calculateVariation = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};
