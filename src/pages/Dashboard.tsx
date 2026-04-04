import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, ArrowDownRight, Search, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getInsight, calculateVariation } from '@/lib/insights';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAsin, setNewAsin] = useState('');
  const [newName, setNewName] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          bsr_history (
            main_rank,
            sub_rank,
            recorded_at
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
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
      toast.success('Produto adicionado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar produto: ' + error.message);
    },
  });

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsin || !newName) return;
    addProductMutation.mutate({ asin: newAsin, name: newName });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-slate-500">Acompanhe o desempenho dos seus produtos na Amazon.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
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
                  onChange={(e) => setNewAsin(e.target.value.toUpperCase())}
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
              <DialogFooter>
                <Button type="submit" disabled={addProductMutation.isPending}>
                  {addProductMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products?.map((product) => {
          const history = product.bsr_history || [];
          const current = history[0] || { main_rank: 0, sub_rank: 0 };
          const previous = history[1] || { main_rank: 0, sub_rank: 0 };
          
          const variation = calculateVariation(current.main_rank, previous.main_rank);
          const isRankImproved = current.main_rank < previous.main_rank;
          const insight = getInsight(current.main_rank, previous.main_rank);

          return (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold line-clamp-1">{product.name}</CardTitle>
                    <p className="text-sm text-slate-500 font-mono">{product.asin}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" render={<Link to={`/products/${product.asin}`} />}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 uppercase font-medium">BSR Principal</p>
                    <p className="text-2xl font-bold">#{current.main_rank.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 uppercase font-medium">Variação</p>
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
                    <p className="text-xs text-slate-500 uppercase font-medium">Subcategoria</p>
                    <p className="text-sm font-medium">#{current.sub_rank.toLocaleString()}</p>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[11px] text-slate-400 uppercase font-bold mb-1">Insight do Dia</p>
                    <p className="text-xs text-slate-600 leading-relaxed italic">
                      "{insight}"
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {products?.length === 0 && (
          <Card className="col-span-full py-12 flex flex-col items-center justify-center border-dashed">
            <Package className="h-12 w-12 text-slate-300 mb-4" />
            <CardTitle className="text-slate-400">Nenhum produto rastreado</CardTitle>
            <p className="text-slate-400 text-sm mt-1">Clique em "Adicionar ASIN" para começar.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
