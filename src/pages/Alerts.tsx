import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function Alerts() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Histórico de Alertas</h2>
        <p className="text-slate-500">Acompanhe as mudanças significativas no ranking dos seus produtos.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Produto</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>BSR Antes</TableHead>
                <TableHead>BSR Depois</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead className="max-w-xs">Insight</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts?.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="pl-6">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900 line-clamp-1">{alert.product_name}</p>
                      <p className="text-xs text-slate-500 font-mono">{alert.asin}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </TableCell>
                  <TableCell>#{alert.rank_before.toLocaleString()}</TableCell>
                  <TableCell>#{alert.rank_after.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className={`flex items-center gap-1 font-bold ${
                      alert.direction === 'up' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {alert.direction === 'up' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                      {Math.abs(alert.variation_pct).toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm text-slate-600 italic line-clamp-2">
                      "{alert.insight}"
                    </p>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Badge variant="outline" className="cursor-pointer hover:bg-slate-100 gap-1" render={<Link to={`/products/${alert.asin}`} />}>
                      Ver Detalhes
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {alerts?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-400">
                    Nenhum alerta registrado até o momento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
