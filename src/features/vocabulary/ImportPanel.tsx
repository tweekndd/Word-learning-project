import { useMemo, useRef, useState } from 'react';
import { Button, Card, Field, Select, Spinner } from '@/components/ui';
import { useNotifications } from '@/app/Notifications';
import { parseCsv, type ParsedCsv } from './csv';
import { detectMapping, type CsvFieldKey, type FieldMapping } from './mapping';
import { applyImport, buildErrorReport, buildImportPreview, type DedupPolicy } from './importer';

const FIELD_LABELS: Record<CsvFieldKey, string> = {
  word: '单词（必需）',
  phonetic: '音标',
  meanings: '释义/翻译',
  tags: '标签',
  notes: '备注',
  source: '来源',
};

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const { notify } = useNotifications();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [policy, setPolicy] = useState<DedupPolicy>('skip');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const preview = useMemo(() => {
    if (!parsed || !mapping) return null;
    return buildImportPreview(parsed, mapping);
  }, [parsed, mapping]);

  const onFile = async (file: File) => {
    const text = await file.text();
    const result = parseCsv(text);
    if (result.headers.length === 0) {
      notify('error', '无法识别 CSV 表头', '请确认文件为逗号分隔且包含表头行。');
      return;
    }
    setParsed(result);
    setFileName(file.name);
    setMapping(detectMapping(result.headers));
  };

  const apply = async () => {
    if (!preview || !mapping) return;
    if (!mapping.word) {
      notify('error', '未映射单词列', '请为“单词”选择一列。');
      return;
    }
    if (preview.validCount === 0) {
      notify('warning', '没有可导入的有效行', `共 ${preview.errorCount} 行错误。`);
      return;
    }
    setApplying(true);
    setProgress({ done: 0, total: preview.items.length });
    try {
      const result = await applyImport(preview, {
        policy,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      notify(
        'success',
        '导入完成',
        `新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}。`,
      );
      reset();
      onImported();
    } catch (err) {
      notify('error', '导入失败，已回滚', err instanceof Error ? err.message : '未知错误');
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const reset = () => {
    setParsed(null);
    setMapping(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadErrors = () => {
    if (!preview) return;
    const csv = buildErrorReport(preview);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">导入 CSV 词库</h2>
        <span className="text-xs text-content-muted">支持 UTF-8 / BOM、引号、多行字段</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
        className="block w-full text-sm"
        aria-label="选择 CSV 文件"
      />

      {parsed && mapping && preview && (
        <div className="space-y-3">
          <p className="text-xs text-content-muted">
            文件：{fileName} · 共 {preview.totalRows} 行，有效 {preview.validCount}，文件内重复{' '}
            {preview.duplicateInFileCount}，错误 {preview.errorCount}
          </p>

          <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <legend className="sr-only">列映射</legend>
            {(Object.keys(FIELD_LABELS) as CsvFieldKey[]).map((key) => (
              <Field key={key} label={FIELD_LABELS[key]}>
                <Select
                  value={mapping[key] ?? ''}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: e.target.value === '' ? null : e.target.value })
                  }
                >
                  <option value="">（不使用）</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </fieldset>

          <Field label="重复词处理策略">
            <Select value={policy} onChange={(e) => setPolicy(e.target.value as DedupPolicy)}>
              <option value="skip">跳过重复项</option>
              <option value="update-user-fields">更新用户自有字段（释义/备注/标签）</option>
              <option value="import-as-new">作为独立词条导入</option>
            </Select>
          </Field>

          {preview.errors.length > 0 && (
            <div className="max-h-40 overflow-auto rounded border border-line p-2 text-xs">
              <p className="mb-1 font-medium text-danger">错误（{preview.errors.length}）</p>
              <ul className="space-y-0.5">
                {preview.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    第 {e.rowNumber} 行 · {e.field}：{e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={applying} onClick={apply}>
              {applying ? '导入中…' : '确认导入'}
            </Button>
            <Button variant="ghost" disabled={applying} onClick={reset}>
              取消
            </Button>
            {preview.errors.length > 0 && (
              <Button variant="secondary" size="sm" onClick={downloadErrors}>
                下载错误报告
              </Button>
            )}
            {progress && (
              <Spinner label={`${progress.done} / ${progress.total}`} />
            )}
          </div>
          <p className="text-[11px] text-content-muted">
            导入是事务性的：任何失败都会整体回滚，已有词典缓存与学习状态不会被清空。
          </p>
        </div>
      )}
    </Card>
  );
}
