import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateVariation } from '@/lib/insights';
import { X } from 'lucide-react';

const COLORS = ['#2563eb', '#10b981', '#f59e0b'];
const COLORS_DARK = ['#60a5fa', '#34d399', '#fbbf24'];

const truncateName = (name: string) => {
  if (name.length <= 50) return name;
  return `${name.slice(0, 30)}...${name.slice(-15)}`;
};

const useIsDark = () => {
  const [isDark, setIsDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
};

export default function Compare() {
  const isDark = useIsDark();
  const [selectedAsins, setSelectedAsins] = useState<string[]>([]);
  const [chartDays, setChartDays] = useState(14);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, bsr_history (*)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const selected = (products || []).filter((p: any) => selectedAsins.includes(p.asin));

  const handleAdd = (asin: string) => {
    if (asin && !selectedAsins.includes(asin) && selectedAsins.length < 3) {
      setSelectedAsins([...selectedAsins, asin]);
    }
  };

  const handleRemove = (asin: string) => {
    setSelectedAsins(selectedAsins.filter(a => a !== asin));
  };

  // Build unified chart data: one entry per date with keys per product
  const now = Date.now();
  const cutoff = chartDays === 0 ? 0 : now - chartDays * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const dateMap = new Map<string, any>();
  selected.forEach((product: any, idx: number) => {
    const history = (product.bsr_history || [])
      .sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .filter((h: any) => chartDays === 0 || new Date(h.recorded_at).getTime() >= cutoff);

    history.forEach((h: any) => {
      const dateKey = format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR });
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey });
      }
      dateMap.get(dateKey)[`p${idx}`] = h.sub_rank;
    });
  });

  const chartData = Array.from(dateMap.values());

  // Metrics per selected product
  const metrics = selected.map((product: any) => {
    const history = (product.bsr_history || []).sort(
      (a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
    const current = history[0] || { sub_rank: 0, price: null };

    const last7 = history.filter((h: any) => new Date(h.recorded_at).getTime() >= sevenDaysAgo && h.sub_rank > 0);
    const avg7 = last7.length > 0 ? Math.round(last7.reduce((s: number, h: any) => s + h.sub_rank, 0) / last7.length) : null;

    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
    const prev7 = history.filter((h: any) => {
      const t = new Date(h.recorded_at).getTime();
      return t >= fourteenDaysAgo && t < sevenDaysAgo && h.sub_rank > 0;
    });
    const avgPrev7 = prev7.length > 0 ? Math.round(prev7.reduce((s: number, h: any) => s + h.sub_rank, 0) / prev7.length) : null;
    const variation7d = avg7 != null && avgPrev7 != null && avgPrev7 !== 0
      ? ((avg7 - avgPrev7) / avgPrev7) * 100
      : null;

    const priceEntries = history.filter((h: any) => h.price != null);
    let minPrice: number | null = null;
    for (const h of priceEntries) {
      const p = Number(h.price);
      if (minPrice === null || p < minPrice) minPrice = p;
    }

    return {
      name: product.name,
      asin: product.asin,
      currentBsr: current.sub_rank,
      avg7,
      variation7d,
      minPrice,
    };
  });

  const formatBRL = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const availableProducts = (products || []).filter((p: any) => !selectedAsins.includes(p.asin));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Comparação de Produtos</h2>
        <p className="text-slate-500 dark:text-gray-400">Compare o desempenho de até 3 produtos lado a lado.</p>
      </div>

      {/* Product selectors */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Produtos</CardTitle>
          <CardDescription>Escolha até 3 produtos para comparar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            {selected.map((p: any, idx: number) => (
              <div
                key={p.asin}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm dark:border-gray-700"
                style={{ borderLeftWidth: 3, borderLeftColor: isDark ? COLORS_DARK[idx] : COLORS[idx] }}
              >
                <span className="font-medium dark:text-gray-200" title={p.name}>{truncateName(p.name)}</span>
                <span className="text-slate-400 dark:text-gray-500 font-mono text-xs">{p.asin}</span>
                <button onClick={() => handleRemove(p.asin)} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {selectedAsins.length < 3 && availableProducts.length > 0 && (
              <Select onValueChange={handleAdd} value="">
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Adicionar produto..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p: any) => (
                    <SelectItem key={p.asin} value={p.asin}>
                      {p.name} ({p.asin})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {selected.length >= 2 && (
        <>
          {/* Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>BSR Subcategoria</CardTitle>
                  <CardDescription>Valores menores = melhor posição</CardDescription>
                </div>
                <div className="flex gap-1">
                  {[7, 14, 30].map(d => (
                    <Button
                      key={d}
                      variant={chartDays === d ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7 px-2.5"
                      onClick={() => setChartDays(d)}
                    >
                      {d}d
                    </Button>
                  ))}
                  <Button
                    variant={chartDays === 0 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-2.5"
                    onClick={() => setChartDays(0)}
                  >
                    Tudo
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#f1f5f9'} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }}
                      dy={10}
                    />
                    <YAxis
                      reversed
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: isDark ? '1px solid #374151' : '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        backgroundColor: isDark ? '#1f2937' : '#fff',
                        color: isDark ? '#e5e7eb' : '#1e293b',
                      }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                      formatter={(value: any, name: string) => [`#${Number(value).toLocaleString()}`, name]}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {selected.map((_: any, idx: number) => (
                      <Line
                        key={metrics[idx].asin}
                        name={truncateName(metrics[idx].name)}
                        dataKey={`p${idx}`}
                        type="monotone"
                        stroke={isDark ? COLORS_DARK[idx] : COLORS[idx]}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: isDark ? COLORS_DARK[idx] : COLORS[idx], strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Metrics table */}
          <Card>
            <CardHeader>
              <CardTitle>Métricas Comparativas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>BSR Atual</TableHead>
                    <TableHead>BSR Médio 7d</TableHead>
                    <TableHead>Variação 7d</TableHead>
                    <TableHead>Menor Preço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m, idx) => (
                    <TableRow key={m.asin}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isDark ? COLORS_DARK[idx] : COLORS[idx] }} />
                          <div>
                            <p className="font-medium text-sm dark:text-gray-200" title={m.name}>{truncateName(m.name)}</p>
                            <p className="text-xs text-slate-400 dark:text-gray-500 font-mono">{m.asin}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.currentBsr > 0 ? `#${m.currentBsr.toLocaleString()}` : 'Sem rank'}
                      </TableCell>
                      <TableCell>
                        {m.avg7 != null ? `#${m.avg7.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell>
                        {m.variation7d != null ? (
                          <span className={`font-semibold ${
                            m.variation7d < 0 ? 'text-emerald-600 dark:text-emerald-400' : m.variation7d > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                          }`}>
                            {m.variation7d < 0 ? '↑' : m.variation7d > 0 ? '↓' : '→'} {Math.abs(m.variation7d).toFixed(1)}%
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {m.minPrice != null ? formatBRL(m.minPrice) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {selected.length < 2 && (
        <Card className="py-12 flex flex-col items-center justify-center border-dashed dark:border-gray-700">
          <p className="text-slate-400 dark:text-gray-500 text-sm">Selecione pelo menos 2 produtos para comparar.</p>
        </Card>
      )}
    </div>
  );
}
