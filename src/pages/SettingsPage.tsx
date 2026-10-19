import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/app/AppProvider';
import { useNotifications } from '@/app/Notifications';
import { Badge, Button, Card, Field, Modal, Select, TextInput } from '@/components/ui';
import {
  backupFileName,
  buildBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type RestoreCounts,
} from '@/services/backup';
import {
  createCollinsKeyService,
  validateAccessKey,
  type CollinsKeyStatus,
  type CollinsKeyTestResult,
} from '@/services/dictionary';
import { validateIntervals } from '@/features/review/shortTerm';
import { db } from '@/db/database';
import type { LayoutMode, ThemeMode, WordOrder } from '@/types/domain';
import type { BackupFile } from '@/types/schemas';

export function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const { notify } = useNotifications();
  const importRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<{ backup: BackupFile; counts: RestoreCounts } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyStatus, setKeyStatus] = useState<CollinsKeyStatus | null>(null);
  const [keyTest, setKeyTest] = useState<CollinsKeyTestResult | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const keyService = useMemo(() => createCollinsKeyService(), []);

  const refreshKeyStatus = useCallback(async () => {
    setKeyStatus(await keyService.status());
  }, [keyService]);

  useEffect(() => {
    void refreshKeyStatus();
  }, [refreshKeyStatus]);

  const intervalsText = settings.shortTermIntervals.join(', ');
  const [intervalsDraft, setIntervalsDraft] = useState(intervalsText);
  const intervalCheck = validateIntervals(
    intervalsDraft
      .split(/[,\s]+/)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n)),
  );

  const saveIntervals = async () => {
    const parsed = intervalsDraft.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));
    const check = validateIntervals(parsed);
    if (!check.ok) {
      notify('error', '间隔设置无效', check.reason);
      return;
    }
    await updateSettings({ shortTermIntervals: parsed });
    notify('success', '已更新强化间隔');
  };

  const saveKey = async () => {
    const check = validateAccessKey(keyDraft);
    if (!check.ok) {
      notify('error', 'API Key 无效', check.reason);
      return;
    }
    setKeyBusy(true);
    try {
      await keyService.save(check.value);
      setKeyDraft('');
      setKeyTest(null);
      await refreshKeyStatus();
      notify('success', 'API Key 已保存', '现在可以点击「测试连接」。');
    } catch (err) {
      notify('error', '保存失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setKeyBusy(false);
    }
  };

  const testKey = async () => {
    setKeyBusy(true);
    try {
      const result = await keyService.test(settings.dictionaryProviderConfig.dictionaryCode);
      setKeyTest(result);
      if (result.ok) notify('success', '连接测试成功', '点击「应用」即可启用 Collins。');
      else notify('error', '连接测试失败', result.message);
    } finally {
      setKeyBusy(false);
    }
  };

  const clearKey = async () => {
    setKeyBusy(true);
    try {
      await keyService.clear();
      setKeyTest(null);
      await refreshKeyStatus();
      notify('success', '已清除本地保存的 API Key');
    } catch (err) {
      notify('error', '清除失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setKeyBusy(false);
    }
  };

  const applyCollins = async () => {
    await updateSettings({
      dictionaryProviderConfig: {
        ...settings.dictionaryProviderConfig,
        provider: 'collins',
      },
    });
    notify('success', '已应用 Collins Provider');
  };

  const exportData = async (includeCache: boolean) => {
    const backup = await buildBackup({ includeDictionaryCache: includeCache });
    const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    URL.revokeObjectURL(url);
    await db.meta.put({ key: 'lastBackupAt', value: Date.now() });
    notify('success', '已导出备份文件');
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok || !parsed.backup) {
      notify('error', '备份文件无效，未做任何修改', parsed.error);
      return;
    }
    const backup = parsed.backup;
    setPendingRestore({
      backup,
      counts: {
        vocabulary: backup.vocabulary.length,
        learningStates: backup.learningStates.length,
        reviewLogs: backup.reviewLogs.length,
        shortTermTasks: backup.shortTermTasks?.length ?? 0,
        dailySessions: backup.dailySessions.length,
        dictionaryEntries: backup.dictionaryCache?.length ?? 0,
      },
    });
    if (importRef.current) importRef.current.value = '';
  };

  const doRestore = async (mode: 'merge' | 'replace') => {
    if (!pendingRestore) return;
    try {
      const result = await restoreBackup(pendingRestore.backup, { mode });
      const autoBackup = buildBackupDownload(result.backupBeforeRestore);
      notify('success', `恢复完成（${mode === 'replace' ? '替换' : '合并'}）`, `已自动下载恢复前备份：${autoBackup}`);
      setPendingRestore(null);
      window.location.reload();
    } catch (err) {
      notify('error', '恢复失败，当前数据未改变', err instanceof Error ? err.message : '未知错误');
    }
  };

  const clearAll = async () => {
    await db.transaction(
      'rw',
      [db.vocabulary, db.learningStates, db.reviewLogs, db.shortTermTasks, db.dailySessions, db.dictionaryEntries],
      async () => {
        await Promise.all([
          db.vocabulary.clear(),
          db.learningStates.clear(),
          db.reviewLogs.clear(),
          db.shortTermTasks.clear(),
          db.dailySessions.clear(),
          db.dictionaryEntries.clear(),
        ]);
      },
    );
    setConfirmClear(false);
    notify('success', '已清空学习数据（设置已保留）');
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">设置</h1>

      <Section title="学习目标">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="每日新词上限"
            value={settings.dailyNewWordLimit}
            onChange={(v) => updateSettings({ dailyNewWordLimit: v })}
            min={0}
          />
          <NumberField
            label="每日复习上限（0=不限）"
            value={settings.dailyReviewLimit ?? 0}
            onChange={(v) => updateSettings({ dailyReviewLimit: v === 0 ? null : v })}
            min={0}
          />
          <NumberField
            label="每日目标"
            value={settings.dailyGoal}
            onChange={(v) => updateSettings({ dailyGoal: v })}
            min={0}
          />
          <NumberField
            label="每词每日额外强化上限"
            value={settings.maxExtraReviewsPerWord}
            onChange={(v) => updateSettings({ maxExtraReviewsPerWord: v })}
            min={0}
            max={100}
          />
          <Field label="单词出现顺序" hint="乱序为完全随机，无任何规律。">
            <Select
              value={settings.wordOrder}
              onChange={(e) => updateSettings({ wordOrder: e.target.value as WordOrder })}
            >
              <option value="sequential">按顺序（到期/导入顺序）</option>
              <option value="shuffle">乱序（随机）</option>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="当天强化间隔（分钟）">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextInput
              value={intervalsDraft}
              onChange={(e) => setIntervalsDraft(e.target.value)}
              aria-label="强化间隔"
            />
          </div>
          <Button variant="primary" onClick={saveIntervals} disabled={!intervalCheck.ok}>
            保存
          </Button>
        </div>
        {!intervalCheck.ok ? (
          <p className="mt-1 text-xs text-danger">{intervalCheck.reason}</p>
        ) : (
          <p className="mt-1 text-xs text-content-muted">
            默认 10, 30, 120, 240。首次尝试与提示后的第二次判断不计入强化次数。
          </p>
        )}
      </Section>

      <Section title="界面">
        <div className="grid grid-cols-2 gap-3">
          <Field label="主题">
            <Select
              value={settings.theme}
              onChange={(e) => updateSettings({ theme: e.target.value as ThemeMode })}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </Select>
          </Field>
          <Field label="布局模式">
            <Select
              value={settings.layoutMode}
              onChange={(e) => updateSettings({ layoutMode: e.target.value as LayoutMode })}
            >
              <option value="compact">紧凑（约 320×240）</option>
              <option value="standard">标准（约 600×450）</option>
              <option value="management">管理（宽屏）</option>
            </Select>
          </Field>
          <Field label={`字体缩放（${Math.round(settings.fontScale * 100)}%）`}>
            <input
              type="range"
              min={0.8}
              max={1.6}
              step={0.05}
              value={settings.fontScale}
              onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
              className="w-full"
            />
          </Field>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={settings.keyboardShortcutsEnabled}
              onChange={(e) => updateSettings({ keyboardShortcutsEnabled: e.target.checked })}
            />
            启用键盘快捷键
          </label>
        </div>
      </Section>

      <Section title="词典">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider" hint="Collins 需要本地代理与服务端密钥。">
            <Select
              value={settings.dictionaryProviderConfig.provider}
              onChange={(e) =>
                updateSettings({
                  dictionaryProviderConfig: {
                    ...settings.dictionaryProviderConfig,
                    provider: e.target.value as 'mock' | 'collins',
                  },
                })
              }
            >
              <option value="mock">Mock（开发/测试）</option>
              <option value="collins">Collins（通过本地代理）</option>
            </Select>
          </Field>
          <Field label="词典代码">
            <TextInput
              value={settings.dictionaryProviderConfig.dictionaryCode}
              onChange={(e) =>
                updateSettings({
                  dictionaryProviderConfig: {
                    ...settings.dictionaryProviderConfig,
                    dictionaryCode: e.target.value,
                  },
                })
              }
            />
          </Field>
        </div>
        <p className="text-xs text-content-muted">
          当前 Provider：<Badge tone={settings.dictionaryProviderConfig.provider === 'mock' ? 'mock' : 'accent'}>
            {settings.dictionaryProviderConfig.provider}
          </Badge>{' '}
          。查询词会发送给所配置的 Provider；Mock 不联网。
        </p>
      </Section>

      <Section title="Collins API Key">
        <Field
          label="Access Key"
          hint="仅在本地代理（npm run dev:all）运行时可用。密钥保存在服务端，不会写入浏览器、构建产物或备份文件。"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                type="password"
                value={keyDraft}
                autoComplete="off"
                aria-label="Collins API Key"
                placeholder="粘贴 Collins accessKey"
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={saveKey} disabled={keyBusy || !keyDraft.trim()}>
              保存
            </Button>
          </div>
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={testKey}
            disabled={keyBusy || !keyStatus?.configured}
          >
            测试连接
          </Button>
          <Button variant="success" onClick={applyCollins} disabled={!keyTest?.ok}>
            应用
          </Button>
          {keyStatus?.configured ? (
            <Button variant="ghost" onClick={clearKey} disabled={keyBusy}>
              清除
            </Button>
          ) : null}
          {!keyStatus ? (
            <Badge tone="neutral">检测中…</Badge>
          ) : !keyStatus.reachable ? (
            <Badge tone="danger">本地代理未连接</Badge>
          ) : keyTest?.ok ? (
            <Badge tone="success">测试通过</Badge>
          ) : keyTest && !keyTest.ok ? (
            <Badge tone="danger">测试失败</Badge>
          ) : keyStatus.configured ? (
            <Badge tone="accent">已保存（{keyStatus.source === 'env' ? '来自环境变量' : '来自设置'}）</Badge>
          ) : (
            <Badge tone="neutral">未配置</Badge>
          )}
        </div>
        {keyTest && !keyTest.ok ? (
          <p className="mt-2 text-xs text-danger">{keyTest.message}</p>
        ) : (
          <p className="mt-2 text-xs text-content-muted">
            保存后可测试连接；测试成功后才能「应用」。应用会把 Provider 切换为 Collins。
          </p>
        )}
      </Section>

      <Section title="数据备份与恢复">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => exportData(false)}>
            导出 JSON（不含词典缓存）
          </Button>
          <Button variant="secondary" onClick={() => exportData(true)}>
            导出 JSON（含词典缓存）
          </Button>
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            从 JSON 恢复
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
            }}
          />
        </div>
        <p className="mt-2 text-xs text-content-muted">
          浏览器存储可能被系统清理，建议定期备份。备份包含个人词库与学习历史，请妥善保管。
        </p>
      </Section>

      <Section title="高级 FSRS 参数">
        <button
          type="button"
          className="text-xs underline"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? '收起' : '展开'}
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              修改这些参数会影响长期排程，请了解其含义后再调整。
            </p>
            <Field label={`目标保留率（${settings.fsrsParameters.requestRetention}）`}>
              <input
                type="range"
                min={0.7}
                max={0.98}
                step={0.01}
                value={settings.fsrsParameters.requestRetention}
                onChange={(e) =>
                  updateSettings({
                    fsrsParameters: {
                      ...settings.fsrsParameters,
                      requestRetention: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </Field>
            <NumberField
              label="最大间隔（天）"
              value={settings.fsrsParameters.maximumInterval}
              min={1}
              max={36500}
              onChange={(v) =>
                updateSettings({
                  fsrsParameters: { ...settings.fsrsParameters, maximumInterval: v },
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.fsrsParameters.enableFuzz}
                onChange={(e) =>
                  updateSettings({
                    fsrsParameters: { ...settings.fsrsParameters, enableFuzz: e.target.checked },
                  })
                }
              />
              启用间隔随机抖动（会降低结果可复现性）
            </label>
          </div>
        )}
      </Section>

      <Section title="危险操作">
        <Button variant="danger" onClick={() => setConfirmClear(true)}>
          清空学习数据
        </Button>
        <p className="mt-2 text-xs text-content-muted">仅清空词库、学习状态与日志，保留设置。操作不可撤销。</p>
      </Section>

      <Modal
        open={pendingRestore !== null}
        title="确认恢复备份"
        onClose={() => setPendingRestore(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRestore(null)}>
              取消
            </Button>
            <Button variant="secondary" onClick={() => doRestore('merge')}>
              合并导入
            </Button>
            <Button variant="danger" onClick={() => doRestore('replace')}>
              完全替换
            </Button>
          </>
        }
      >
        <p className="text-sm">
          备份包含：词条 {pendingRestore?.counts.vocabulary} · 状态 {pendingRestore?.counts.learningStates} ·
          日志 {pendingRestore?.counts.reviewLogs} · 短时任务 {pendingRestore?.counts.shortTermTasks} · 词典缓存{' '}
          {pendingRestore?.counts.dictionaryEntries}。
        </p>
        <p className="mt-2 text-sm text-content-muted">
          恢复前会自动下载当前数据的临时备份。<strong>完全替换</strong>会清除现有数据。
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        title="清空学习数据"
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={clearAll}>
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm">将删除所有词条、学习状态、复习日志、短时任务与词典缓存。建议先导出备份。</p>
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <TextInput
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </Field>
  );
}

function buildBackupDownload(backup: BackupFile): string {
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name = `word-pocket-pre-restore-${Date.now()}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
