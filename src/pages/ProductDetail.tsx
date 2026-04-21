import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, TrendingDown, TrendingUp, Calendar, Info, Download, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getInsight, calculateVariation } from '@/lib/insights';
import { getCategoryName } from '@/lib/categoryMap';

const useIsDark = () => {
  const [isDark, setIsDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
};

export default function ProductDetail() {
  const { asin } = useParams<{ asin: string }>();
  const [chartDays, setChartDays] = useState(14);
  const isDark = useIsDark();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', asin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          bsr_history (*)
        `)
        .eq('asin', asin)
        .single();
      
      if (error) throw error;
      
      // Sort history by date for the chart
      const sortedHistory = [...(data.bsr_history || [])].sort((a, b) => 
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );

      return { ...data, bsr_history: sortedHistory };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!product) return <div>Produto não encontrado.</div>;

  const history = product.bsr_history || [];
  const latest = history[history.length - 1] || { main_rank: 0, sub_rank: 0 };
  const previous = history[history.length - 2] || latest;
  const insight = getInsight(latest.main_rank, previous.main_rank);

  // Price stats from history
  const priceEntries = history.filter((h: any) => h.price != null);
  const currentPrice = priceEntries.length > 0 ? priceEntries[priceEntries.length - 1] : null;
  let minPriceEntry: any = null;
  let maxPriceEntry: any = null;
  for (const h of priceEntries) {
    const p = Number(h.price);
    if (!minPriceEntry || p < Number(minPriceEntry.price)) minPriceEntry = h;
    if (!maxPriceEntry || p > Number(maxPriceEntry.price)) maxPriceEntry = h;
  }

  const filteredHistory = chartDays === 0
    ? history
    : history.filter((h: any) => new Date(h.recorded_at).getTime() >= Date.now() - chartDays * 24 * 60 * 60 * 1000);

  const chartData = filteredHistory.map((h: any) => ({
    date: format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR }),
    main: h.main_rank,
    sub: h.sub_rank,
    price: h.price != null ? Number(h.price) : null,
    fullDate: format(new Date(h.recorded_at), 'PPP', { locale: ptBR }),
  }));

  const hasPrice = chartData.some(d => d.price != null);

  const formatBRL = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const exportCSV = () => {
    const rows = [['Data', 'BSR Principal', 'BSR Subcategoria', 'Preço', 'Variação %']];
    const sorted = [...history].reverse();
    sorted.forEach((h: any, i: number) => {
      const prev = sorted[i - 1] || h;
      const variation = i > 0 ? calculateVariation(h.main_rank, prev.main_rank).toFixed(2) : '';
      const price = h.price != null ? Number(h.price).toFixed(2) : '';
      rows.push([
        format(new Date(h.recorded_at), 'dd/MM/yyyy HH:mm'),
        String(h.main_rank),
        String(h.sub_rank),
        price,
        variation,
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bsr-${asin}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" className="h-9 w-9" render={<Link to="/" />}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-gray-100">{product.name}</h2>
            <p className="text-slate-500 dark:text-gray-400 font-mono">{product.asin}</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Histórico de BSR e Preço</CardTitle>
                  <CardDescription>Evolução do ranking (valores menores são melhores) e preço Buy Box</CardDescription>
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
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: hasPrice ? 80 : 60, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#f1f5f9'} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }}
                      dy={10}
                    />
                    <YAxis
                      yAxisId="left"
                      reversed
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#60a5fa' : '#2563eb' }}
                      label={{ value: 'BSR Principal', angle: -90, position: 'insideLeft', fill: isDark ? '#60a5fa' : '#2563eb', fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      reversed
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#34d399' : '#10b981' }}
                      label={{ value: 'BSR Sub', angle: 90, position: 'insideRight', fill: isDark ? '#34d399' : '#10b981', fontSize: 11, offset: hasPrice ? -20 : 0 }}
                    />
                    {hasPrice && (
                      <YAxis
                        yAxisId="price"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: isDark ? '#fbbf24' : '#f59e0b' }}
                        tickFormatter={(v: number) => `R$${v}`}
                        width={55}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: isDark ? '1px solid #374151' : '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        backgroundColor: isDark ? '#1f2937' : '#fff',
                        color: isDark ? '#e5e7eb' : '#1e293b',
                      }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                      formatter={(value: any, name: string) => {
                        if (name === 'Preço (R$)') return [formatBRL(Number(value)), name];
                        return [`#${Number(value).toLocaleString()}`, name];
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line
                      name="BSR Principal (eixo esq.)"
                      yAxisId="left"
                      type="monotone"
                      dataKey="main"
                      stroke={isDark ? '#60a5fa' : '#2563eb'}
                      strokeWidth={3}
                      dot={{ r: 4, fill: isDark ? '#60a5fa' : '#2563eb', strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                      name="BSR Subcategoria (eixo dir.)"
                      yAxisId="right"
                      type="monotone"
                      dataKey="sub"
                      stroke={isDark ? '#34d399' : '#10b981'}
                      strokeWidth={3}
                      dot={{ r: 4, fill: isDark ? '#34d399' : '#10b981', strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    {hasPrice && (
                      <Line
                        name="Preço (R$)"
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        stroke={isDark ? '#fbbf24' : '#f59e0b'}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={{ r: 3, fill: isDark ? '#fbbf24' : '#f59e0b', strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leituras Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>BSR Principal</TableHead>
                    <TableHead>BSR Sub</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...filteredHistory].reverse().map((h, i, arr) => {
                    const prev = arr[i + 1] || h;
                    const variation = calculateVariation(h.main_rank, prev.main_rank);
                    const isImproved = h.main_rank < prev.main_rank;

                    return (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">
                          {format(new Date(h.recorded_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell>#{h.main_rank.toLocaleString()}</TableCell>
                        <TableCell>#{h.sub_rank.toLocaleString()}</TableCell>
                        <TableCell>{h.price != null ? formatBRL(Number(h.price)) : '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className={`flex items-center justify-end gap-1 font-medium ${
                            isImproved ? 'text-emerald-600' : variation > 0 ? 'text-rose-600' : 'text-slate-600'
                          }`}>
                            {i < arr.length - 1 && (
                              <>
                                {isImproved ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                                {Math.abs(variation).toFixed(1)}%
                              </>
                            )}
                            {i === arr.length - 1 && '-'}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <Info className="h-5 w-5" />
                <CardTitle className="text-lg">Insight Atual</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 dark:text-gray-300 leading-relaxed italic font-medium">
                "{insight}"
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo do Produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500 dark:text-gray-400 text-sm">Categoria</span>
                <span className="font-medium text-sm dark:text-gray-200">{getCategoryName(product.main_category)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500 dark:text-gray-400 text-sm">Subcategoria</span>
                <span className="font-medium text-sm dark:text-gray-200">{getCategoryName(product.sub_category)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500 dark:text-gray-400 text-sm">Monitorado desde</span>
                <span className="font-medium text-sm dark:text-gray-200">{format(new Date(product.created_at), 'dd/MM/yyyy')}</span>
              </div>
            </CardContent>
          </Card>

          {priceEntries.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-500" />
                  <CardTitle>Histórico de Preço</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-slate-500 dark:text-gray-400 text-sm">Preço atual</span>
                  <span className="font-medium text-sm dark:text-gray-200">
                    {currentPrice ? formatBRL(Number(currentPrice.price)) : '-'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <div>
                    <span className="text-slate-500 dark:text-gray-400 text-sm">Menor preço registrado</span>
                    {minPriceEntry && (
                      <p className="text-[11px] text-slate-400 dark:text-gray-500">
                        {format(new Date(minPriceEntry.recorded_at), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                  <span className="font-medium text-sm text-emerald-600 dark:text-emerald-400">
                    {minPriceEntry ? formatBRL(Number(minPriceEntry.price)) : '-'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <div>
                    <span className="text-slate-500 dark:text-gray-400 text-sm">Maior preço registrado</span>
                    {maxPriceEntry && (
                      <p className="text-[11px] text-slate-400 dark:text-gray-500">
                        {format(new Date(maxPriceEntry.recorded_at), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                  <span className="font-medium text-sm text-rose-600 dark:text-rose-400">
                    {maxPriceEntry ? formatBRL(Number(maxPriceEntry.price)) : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
