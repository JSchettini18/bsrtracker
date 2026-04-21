import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus, Pencil, Trash2, Search, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getInsight, calculateVariation } from '@/lib/insights';

const ASIN_REGEX = /^B0[A-Z0-9]{8}$/;

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAsin, setNewAsin] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  // Edit modal state
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editName, setEditName] = useState('');

  // Delete confirmation state
  const [deleteProduct, setDeleteProduct] = useState<any>(null);

  const { data: products, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      console.log('[Dashboard] Fetching products from Supabase...');
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          bsr_history (*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Dashboard] Supabase query error:', error);
        throw error;
      }

      console.log('[Dashboard] Products fetched:', data?.length ?? 0);
      return data;
    },
    staleTime: 0,
  });

  const addProductMutation = useMutation({
    mutationFn: async (product: { asin: string; name: string }) => {
      const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsAddOpen(false);
      setNewAsin('');
      setNewName('');
      setAddError('');
      toast.success('Produto adicionado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar produto: ' + error.message);
    },
  });

  const editProductMutation = useMutation({
    mutationFn: async ({ asin, name }: { asin: string; name: string }) => {
      const { error } = await supabase
        .from('products')
        .update({ name })
        .eq('asin', asin);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditProduct(null);
      toast.success('Produto atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (asin: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('asin', asin);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteProduct(null);
      toast.success('Produto removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newAsin || !newName) return;

    if (!ASIN_REGEX.test(newAsin)) {
      setAddError('ASIN inválido. Deve começar com B0 e ter 10 caracteres.');
      return;
    }

    const exists = products?.some((p: any) => p.asin === newAsin);
    if (exists) {
      setAddError('Este ASIN já está cadastrado.');
      return;
    }

    addProductMutation.mutate({ asin: newAsin, name: newName });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct || !editName.trim()) return;
    editProductMutation.mutate({ asin: editProduct.asin, name: editName.trim() });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <p className="text-rose-600 dark:text-rose-400 font-semibold">Erro ao carregar produtos</p>
          <p className="text-slate-500 dark:text-gray-400 text-sm font-mono">{(queryError as any)?.message ?? 'Erro desconhecido'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Dashboard</h2>
          <p className="text-slate-500 dark:text-gray-400">Acompanhe o desempenho dos seus produtos na Amazon.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setAddError(''); }}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="h-4 w-4" />
            Adicionar ASIN
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Novo Produto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddProduct} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="asin">ASIN</Label>
                <Input
                  id="asin"
                  placeholder="Ex: B08N5WRWJ5"
                  value={newAsin}
                  onChange={(e) => { setNewAsin(e.target.value.toUpperCase()); setAddError(''); }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Produto</Label>
                <Input
                  id="name"
                  placeholder="Ex: Apple MacBook Air M1"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              {addError && (
                <p className="text-sm text-rose-600 font-medium">{addError}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={addProductMutation.isPending}>
                  {addProductMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit modal */}
      <Dialog open={!!editProduct} onOpenChange={(open) => { if (!open) setEditProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>ASIN</Label>
              <Input value={editProduct?.asin ?? ''} disabled className="bg-slate-50 dark:bg-gray-800 font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editName">Nome do Produto</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditProduct(null)}>Cancelar</Button>
              <Button type="submit" disabled={editProductMutation.isPending}>
                {editProductMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog open={!!deleteProduct} onOpenChange={(open) => { if (!open) setDeleteProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Produto</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-slate-600 dark:text-gray-300">
              Tem certeza que deseja remover <span className="font-semibold">{deleteProduct?.name}</span> ({deleteProduct?.asin})?
            </p>
            <p className="text-sm text-rose-600 dark:text-rose-400">Todo o histórico de BSR e alertas deste produto serão apagados.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProduct(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteProductMutation.isPending}
              onClick={() => deleteProductMutation.mutate(deleteProduct?.asin)}
            >
              {deleteProductMutation.isPending ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products?.map((product) => {
          const history = (product.bsr_history || []).sort(
            (a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
          );
          const current = history[0] || { main_rank: 0, sub_rank: 0 };
          const previous = history[1] || { main_rank: 0, sub_rank: 0 };

          const variation = calculateVariation(current.sub_rank, previous.sub_rank);
          const isRankImproved = current.sub_rank < previous.sub_rank;
          const insight = getInsight(current.sub_rank, previous.sub_rank);

          // Trend badge: compare current vs 3-day-old reading
          const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
          const oldReading = history.find((h: any) => new Date(h.recorded_at).getTime() <= threeDaysAgo);
          let trend: 'up' | 'down' | 'stable' | null = null;
          if (oldReading && history.length >= 3) {
            const trendVar = calculateVariation(current.sub_rank, oldReading.sub_rank);
            if (trendVar < -5) trend = 'up';
            else if (trendVar > 5) trend = 'down';
            else trend = 'stable';
          }

          return (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-semibold line-clamp-1 dark:text-gray-100">{product.name}</CardTitle>
                      {trend === 'up' && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-[10px] px-1.5 py-0.5">
                          <TrendingUp className="h-3 w-3" />
                          Subindo
                        </Badge>
                      )}
                      {trend === 'down' && (
                        <Badge className="bg-rose-100 text-rose-700 border-rose-200 gap-1 text-[10px] px-1.5 py-0.5">
                          <TrendingDown className="h-3 w-3" />
                          Caindo
                        </Badge>
                      )}
                      {trend === 'stable' && (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 gap-1 text-[10px] px-1.5 py-0.5">
                          <Minus className="h-3 w-3" />
                          Estável
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-gray-400 font-mono">{product.asin}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditProduct(product); setEditName(product.name); }}
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteProduct(product)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" render={<Link to={`/products/${product.asin}`} />}>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">BSR Subcategoria</p>
                    <p className="text-2xl font-bold">#{current.sub_rank.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">Variação</p>
                    <div className={`flex items-center gap-1 font-semibold ${
                      isRankImproved ? 'text-emerald-600' : variation > 0 ? 'text-rose-600' : 'text-slate-600'
                    }`}>
                      {isRankImproved ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      {Math.abs(variation).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">BSR Principal</p>
                    <p className="text-sm font-medium">#{current.main_rank.toLocaleString()}</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-3 border border-slate-100 dark:border-gray-700">
                    <p className="text-[11px] text-slate-400 dark:text-gray-500 uppercase font-bold mb-1">Insight do Dia</p>
                    <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed italic">
                      "{insight}"
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!products || products.length === 0) && (
          <Card className="col-span-full py-12 flex flex-col items-center justify-center border-dashed dark:border-gray-700">
            <Package className="h-12 w-12 text-slate-300 dark:text-gray-600 mb-4" />
            <CardTitle className="text-slate-400 dark:text-gray-500">Nenhum produto rastreado</CardTitle>
            <p className="text-slate-400 dark:text-gray-500 text-sm mt-1">Clique em "Adicionar ASIN" para começar.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
