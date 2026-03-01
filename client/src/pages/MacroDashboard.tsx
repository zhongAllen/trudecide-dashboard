import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface Snapshot {
  snapshot_month: string;
  region: string;
  dimension: string;
  timescale: string;
  status: string;
  score: number;
  config_version: number;
  updated_at: string;
}

export default function MacroDashboard() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('macro_wide_snapshot')
          .select('*')
          .order('snapshot_month', { ascending: false })
          .order('dimension', { ascending: true })
          .order('timescale', { ascending: true });

        if (error) {
          throw error;
        }

        setSnapshots(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshots();
  }, []);

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>宏观经济状态宽表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="ml-4 text-muted-foreground">正在加载数据...</p>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>快照月份</TableHead>
                  <TableHead>维度</TableHead>
                  <TableHead>时间尺度</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>分数</TableHead>
                  <TableHead>模型版本</TableHead>
                  <TableHead>更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snapshot, index) => (
                  <TableRow key={index}>
                    <TableCell>{snapshot.snapshot_month}</TableCell>
                    <TableCell>{snapshot.dimension}</TableCell>
                    <TableCell>{snapshot.timescale}</TableCell>
                    <TableCell>{snapshot.status}</TableCell>
                    <TableCell>{snapshot.score}</TableCell>
                    <TableCell>{snapshot.config_version}</TableCell>
                    <TableCell>{new Date(snapshot.updated_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
