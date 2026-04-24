import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, TrendingDown, TrendingUp, Calendar, Info, Download, DollarSign, BarChart3, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { getInsight, calculateVariation } from '@/lib/insights';
import { getCategoryName } from '@/lib/categoryMap';

const ASIN_REGEX = /^B0[A-Z0-9]{8}$/;
const COMP_COLORS = ['#8b5cf6', '#ef4444', '#06b6d4'];
const COMP_COLORS_DARK = ['#a78bfa', '#f87171', '#22d3ee'];

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
  const queryClient = useQueryClient();

  // Competitor modal state
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [compAsin, setCompAsin] = useState('');
  const [compName, setCompName] = useState('');
  const [compError, setCompError] = useState('');

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

  // Competitors query
  const { data: competitors = [] } = useQuery({
    queryKey: ['competitors', asin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitors')
        .select(`*, competitor_history (*)`)
        .eq('parent_asin', asin)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        competitor_history: [...(c.competitor_history || [])].sort(
          (a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        ),
      }));
    },
  });

  // All products (for validation: can't add own product as competitor)
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products-asins'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('asin');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const addCompetitorMutation = useMutation({
    mutationFn: async (comp: { parent_asin: string; competitor_asin: string; name: string }) => {
      const { data, error } = await supabase.from('competitors').insert([comp]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', asin] });
      setIsCompModalOpen(false);
      setCompAsin('');
      setCompName('');
      setCompError('');
      toast.success('Concorrente adicionado!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar concorrente: ' + error.message);
    },
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (competitorId: string) => {
      const { error } = await supabase.from('competitors').delete().eq('id', competitorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', asin] });
      toast.success('Concorrente removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  const handleAddCompetitor = (e: React.FormEvent) => {
    e.preventDefault();
    setCompError('');
    if (!compAsin || !compName) return;

    if (!ASIN_REGEX.test(compAsin)) {
      setCompError('ASIN inválido. Deve começar com B0 e ter 10 caracteres.');
      return;
    }

    if (allProducts.some((p: any) => p.asin === compAsin)) {
      setCompError('Este ASIN é de um produto seu. Use a página de comparação.');
      return;
    }

    if (competitors.some((c: any) => c.competitor_asin === compAsin)) {
      setCompError('Este concorrente já está cadastrado para este produto.');
      return;
    }

    addCompetitorMutation.mutate({ parent_asin: asin!, competitor_asin: compAsin, name: compName });
  };

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

  // BSR averages by period (ignoring sub_rank = 0 / stockout)
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  const last7 = history.filter((h: any) => new Date(h.recorded_at).getTime() >= sevenDaysAgo && h.sub_rank > 0);
  const prev7 = history.filter((h: any) => {
    const t = new Date(h.recorded_at).getTime();
    return t >= fourteenDaysAgo && t < sevenDaysAgo && h.sub_rank > 0;
  });

  const avg7 = last7.length > 0 ? Math.round(last7.reduce((s: number, h: any) => s + h.sub_rank, 0) / last7.length) : null;
  const avgPrev7 = prev7.length > 0 ? Math.round(prev7.reduce((s: number, h: any) => s + h.sub_rank, 0) / prev7.length) : null;
  const avgVariation = avg7 != null && avgPrev7 != null && avgPrev7 !== 0
    ? ((avg7 - avgPrev7) / avgPrev7) * 100
    : null;

  // Price × BSR correlation: group by price bands
  const priceAndBsr = history.filter((h: any) => h.price != null && h.sub_rank > 0);
  const priceBands: { label: string; min: number; max: number; totalBsr: number; count: number; avg: number }[] = [];
  if (priceAndBsr.length >= 5) {
    const prices = priceAndBsr.map((h: any) => Number(h.price));
    const minP = Math.floor(Math.min(...prices) / 5) * 5;
    const maxP = Math.ceil(Math.max(...prices) / 5) * 5;
    for (let lo = minP; lo < maxP; lo += 5) {
      const hi = lo + 5;
      const inBand = priceAndBsr.filter((h: any) => Number(h.price) >= lo && Number(h.price) < hi);
      if (inBand.length > 0) {
        const totalBsr = inBand.reduce((s: number, h: any) => s + h.sub_rank, 0);
        priceBands.push({ label: `R$ ${lo}–${hi}`, min: lo, max: hi, totalBsr, count: inBand.length, avg: Math.round(totalBsr / inBand.length) });
      }
    }
  }
  const bestBandAvg = priceBands.length > 0 ? Math.min(...priceBands.map(b => b.avg)) : null;

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

          {/* Competitors section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-violet-500" />
                  <CardTitle>Concorrentes</CardTitle>
                </div>
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => setIsCompModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Concorrente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {competitors.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-gray-400 italic">
                  Nenhum concorrente cadastrado. Adicione para comparar BSR e preço.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {competitors.map((comp: any, idx: number) => {
                    const compHist = comp.competitor_history || [];
                    const compLatest = compHist[compHist.length - 1] || { main_rank: 0, sub_rank: 0, price: null };
                    const color = isDark ? COMP_COLORS_DARK[idx % COMP_COLORS_DARK.length] : COMP_COLORS[idx % COMP_COLORS.length];
                    return (
                      <div
                        key={comp.id}
                        className="rounded-lg border p-3 space-y-2 dark:border-gray-700"
                        style={{ borderLeftWidth: 3, borderLeftColor: color }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm dark:text-gray-200 line-clamp-1">{comp.name}</p>
                            <p className="text-xs text-slate-400 dark:text-gray-500 font-mono">{comp.competitor_asin}</p>
                          </div>
                          <button
                            onClick={() => removeCompetitorMutation.mutate(comp.id)}
                            className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-400 dark:text-gray-500">BSR Sub</span>
                            <p className="font-semibold dark:text-gray-200">
                              {compLatest.sub_rank > 0 ? `#${compLatest.sub_rank.toLocaleString()}` : 'Sem rank'}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-gray-500">BSR Principal</span>
                            <p className="font-semibold dark:text-gray-200">
                              {compLatest.main_rank > 0 ? `#${compLatest.main_rank.toLocaleString()}` : '-'}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 dark:text-gray-500">Preço</span>
                            <p className="font-semibold dark:text-gray-200">
                              {compLatest.price != null ? formatBRL(Number(compLatest.price)) : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Competitor modal */}
          <Dialog open={isCompModalOpen} onOpenChange={(open) => { setIsCompModalOpen(open); if (!open) setCompError(''); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Concorrente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddCompetitor} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="comp-asin">ASIN do Concorrente</Label>
                  <Input
                    id="comp-asin"
                    placeholder="Ex: B08N5WRWJ5"
                    value={compAsin}
                    onChange={(e) => { setCompAsin(e.target.value.toUpperCase()); setCompError(''); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-name">Nome do Concorrente</Label>
                  <Input
                    id="comp-name"
                    placeholder="Ex: Produto Concorrente X"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    required
                  />
                </div>
                {compError && (
                  <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{compError}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCompModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={addCompetitorMutation.isPending}>
                    {addCompetitorMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* BSR Comparison Chart */}
          {competitors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Seu Produto vs Concorrentes — BSR</CardTitle>
                <CardDescription>BSR Subcategoria (valores menores = melhor posição)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={(() => {
                        const dateMap = new Map<string, any>();
                        // Own product
                        filteredHistory.forEach((h: any) => {
                          const dk = format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR });
                          if (!dateMap.has(dk)) dateMap.set(dk, { date: dk });
                          dateMap.get(dk).own = h.sub_rank;
                        });
                        // Competitors
                        competitors.forEach((comp: any, idx: number) => {
                          const hist = (comp.competitor_history || []).filter((h: any) =>
                            chartDays === 0 || new Date(h.recorded_at).getTime() >= Date.now() - chartDays * 24 * 60 * 60 * 1000
                          );
                          hist.forEach((h: any) => {
                            const dk = format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR });
                            if (!dateMap.has(dk)) dateMap.set(dk, { date: dk });
                            dateMap.get(dk)[`c${idx}`] = h.sub_rank;
                          });
                        });
                        return Array.from(dateMap.values());
                      })()}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#f1f5f9'} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }} dy={10} />
                      <YAxis reversed axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: isDark ? '1px solid #374151' : '1px solid #e2e8f0',
                          backgroundColor: isDark ? '#1f2937' : '#fff',
                          color: isDark ? '#e5e7eb' : '#1e293b',
                        }}
                        formatter={(value: any, name: string) => [`#${Number(value).toLocaleString()}`, name]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Line
                        name={product.name.length > 30 ? product.name.slice(0, 28) + '...' : product.name}
                        dataKey="own"
                        type="monotone"
                        stroke={isDark ? '#60a5fa' : '#2563eb'}
                        strokeWidth={3}
                        dot={{ r: 3, fill: isDark ? '#60a5fa' : '#2563eb', strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                        connectNulls
                      />
                      {competitors.map((comp: any, idx: number) => (
                        <Line
                          key={comp.id}
                          name={comp.name.length > 30 ? comp.name.slice(0, 28) + '...' : comp.name}
                          dataKey={`c${idx}`}
                          type="monotone"
                          stroke={isDark ? COMP_COLORS_DARK[idx % COMP_COLORS_DARK.length] : COMP_COLORS[idx % COMP_COLORS.length]}
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          dot={{ r: 2, fill: isDark ? COMP_COLORS_DARK[idx % COMP_COLORS_DARK.length] : COMP_COLORS[idx % COMP_COLORS.length], strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Price Comparison Chart */}
          {competitors.length > 0 && (() => {
            const hasAnyPrice = filteredHistory.some((h: any) => h.price != null) ||
              competitors.some((c: any) => (c.competitor_history || []).some((h: any) => h.price != null));
            if (!hasAnyPrice) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle>Comparação de Preços</CardTitle>
                  <CardDescription>Preço Buy Box ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={(() => {
                          const dateMap = new Map<string, any>();
                          filteredHistory.forEach((h: any) => {
                            if (h.price == null) return;
                            const dk = format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR });
                            if (!dateMap.has(dk)) dateMap.set(dk, { date: dk });
                            dateMap.get(dk).own = Number(h.price);
                          });
                          competitors.forEach((comp: any, idx: number) => {
                            const hist = (comp.competitor_history || []).filter((h: any) =>
                              h.price != null && (chartDays === 0 || new Date(h.recorded_at).getTime() >= Date.now() - chartDays * 24 * 60 * 60 * 1000)
                            );
                            hist.forEach((h: any) => {
                              const dk = format(new Date(h.recorded_at), 'dd/MM', { locale: ptBR });
                              if (!dateMap.has(dk)) dateMap.set(dk, { date: dk });
                              dateMap.get(dk)[`c${idx}`] = Number(h.price);
                            });
                          });
                          return Array.from(dateMap.values());
                        })()}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#f1f5f9'} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#64748b' }} tickFormatter={(v: number) => `R$${v}`} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: isDark ? '1px solid #374151' : '1px solid #e2e8f0',
                            backgroundColor: isDark ? '#1f2937' : '#fff',
                            color: isDark ? '#e5e7eb' : '#1e293b',
                          }}
                          formatter={(value: any, name: string) => [formatBRL(Number(value)), name]}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Line
                          name={product.name.length > 30 ? product.name.slice(0, 28) + '...' : product.name}
                          dataKey="own"
                          type="monotone"
                          stroke={isDark ? '#60a5fa' : '#2563eb'}
                          strokeWidth={3}
                          dot={{ r: 3, fill: isDark ? '#60a5fa' : '#2563eb', strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                          connectNulls
                        />
                        {competitors.map((comp: any, idx: number) => (
                          <Line
                            key={comp.id}
                            name={comp.name.length > 30 ? comp.name.slice(0, 28) + '...' : comp.name}
                            dataKey={`c${idx}`}
                            type="monotone"
                            stroke={isDark ? COMP_COLORS_DARK[idx % COMP_COLORS_DARK.length] : COMP_COLORS[idx % COMP_COLORS.length]}
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            dot={{ r: 2, fill: isDark ? COMP_COLORS_DARK[idx % COMP_COLORS_DARK.length] : COMP_COLORS[idx % COMP_COLORS.length], strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
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
              {avg7 != null && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500 dark:text-gray-400 text-sm">BSR médio últimos 7 dias</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm dark:text-gray-200">#{avg7.toLocaleString()}</span>
                    {avgVariation != null && (
                      <span className={`flex items-center gap-0.5 text-xs font-semibold ${
                        avgVariation < 0 ? 'text-emerald-600 dark:text-emerald-400' : avgVariation > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                      }`}>
                        {avgVariation < 0 ? <TrendingDown className="h-3 w-3" /> : avgVariation > 0 ? <TrendingUp className="h-3 w-3" /> : null}
                        {Math.abs(avgVariation).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              )}
              {avgPrev7 != null && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-slate-500 dark:text-gray-400 text-sm">BSR médio 7 dias anteriores</span>
                  <span className="font-medium text-sm dark:text-gray-200">#{avgPrev7.toLocaleString()}</span>
                </div>
              )}
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-violet-500" />
                <CardTitle>Análise Preço × BSR</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {priceAndBsr.length < 5 ? (
                <p className="text-sm text-slate-500 dark:text-gray-400 italic">
                  Aguardando mais dados para análise ({priceAndBsr.length}/5 leituras com preço e rank)
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faixa de Preço</TableHead>
                      <TableHead>BSR Médio</TableHead>
                      <TableHead className="text-right">Leituras</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceBands.map((band) => (
                      <TableRow key={band.label} className={band.avg === bestBandAvg ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}>
                        <TableCell className="font-medium text-sm">{band.label}</TableCell>
                        <TableCell className={`text-sm ${band.avg === bestBandAvg ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                          #{band.avg.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-500 dark:text-gray-400">{band.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
