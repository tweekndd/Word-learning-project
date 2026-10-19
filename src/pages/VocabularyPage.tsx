import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner, TextArea, TextInput } from '@/components/ui';
import { useNotifications } from '@/app/Notifications';
import { db } from '@/db/database';
import { shortTermTaskRepo, vocabularyRepo } from '@/db/repositories';
import type { Vocabulary } from '@/types/domain';
import { ImportPanel } from '@/features/vocabulary/ImportPanel';

export function VocabularyPage() {
  const { notify } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Vocabulary[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showSuspended, setShowSuspended] = useState(false);
  const [editing, setEditing] = useState<Vocabulary | null>(null);
  const [deleting, setDeleting] = useState<Vocabulary | null>(null);
  const [deleteHistory, setDeleteHistory] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await vocabularyRepo.list({
        search,
        tag: tagFilter || undefined,
        includeSuspended: showSuspended,
      });
      const allTags = await vocabularyRepo.allTags();
      if (!cancelled) {
        setRows(list);
        setTags(allTags);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, tagFilter, showSuspended, reloadKey]);

  const total = useMemo(() => rows.length, [rows]);

  const toggleSuspend = async (v: Vocabulary) => {
    if (v.suspendedAt) {
      await vocabularyRepo.resume(v.id);
      notify('info', `已恢复「${v.word}」`);
    } else {
      await vocabularyRepo.suspend(v.id);
      await shortTermTaskRepo.cancelPendingForVocabulary(v.id);
      notify('info', `已暂停「${v.word}」，其未执行任务已取消`);
    }
    reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const v = deleting;
    await db.transaction('rw', [db.vocabulary, db.learningStates, db.reviewLogs, db.shortTermTasks, db.dictionaryEntries], async () => {
      await shortTermTaskRepo.cancelPendingForVocabulary(v.id);
      if (deleteHistory) {
        await Promise.all([
          db.learningStates.delete(v.id),
          db.reviewLogs.where('vocabularyId').equals(v.id).delete(),
          db.shortTermTasks.where('vocabularyId').equals(v.id).delete(),
          db.dictionaryEntries.where('vocabularyId').equals(v.id).delete(),
          db.vocabulary.delete(v.id),
        ]);
      } else {
        await vocabularyRepo.softDelete(v.id);
      }
    });
    notify('success', deleteHistory ? `已彻底删除「${v.word}」及其历史` : `已删除「${v.word}」（保留历史记录）`);
    setDeleting(null);
    setDeleteHistory(false);
    reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">词库</h1>
        <span className="text-xs text-content-muted">共 {total} 条</span>
      </div>

      <ImportPanel onImported={reload} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Field label="搜索" htmlFor="vocab-search">
            <TextInput
              id="vocab-search"
              type="search"
              value={search}
              placeholder="搜索单词 / 备注 / 释义"
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <Field label="标签">
          <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">全部</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-1 pb-2 text-sm">
          <input
            type="checkbox"
            checked={showSuspended}
            onChange={(e) => setShowSuspended(e.target.checked)}
          />
          包含已暂停
        </label>
      </div>

      {loading ? (
        <Spinner label="加载词库…" />
      ) : rows.length === 0 ? (
        <EmptyState title="词库为空" description="使用上方导入面板添加你的 CSV 词库。" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-content-muted">
              <tr>
                <th className="p-2">单词</th>
                <th className="p-2">释义</th>
                <th className="p-2">标签</th>
                <th className="p-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 500).map((v) => (
                <tr key={v.id} className={v.suspendedAt ? 'opacity-60' : ''}>
                  <td className="p-2 align-top">
                    <span className="font-medium">{v.word}</span>
                    {v.suspendedAt && (
                      <Badge tone="warning" title="已暂停">
                        暂停
                      </Badge>
                    )}
                    {v.source && <span className="ml-1 text-[10px] text-content-muted">{v.source}</span>}
                  </td>
                  <td className="max-w-[20rem] p-2 align-top text-content-muted">
                    <span className="line-clamp-2 break-words">{v.userMeanings ?? '—'}</span>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {v.tags.slice(0, 4).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" onClick={() => setEditing(v)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleSuspend(v)}>
                        {v.suspendedAt ? '恢复' : '暂停'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleting(v)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && (
            <p className="p-2 text-xs text-content-muted">仅显示前 500 条，请使用搜索缩小范围。</p>
          )}
        </Card>
      )}

      <EditModal
        vocabulary={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <Modal
        open={deleting !== null}
        title="删除词条"
        onClose={() => {
          setDeleting(null);
          setDeleteHistory(false);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleting(null);
                setDeleteHistory(false);
              }}
            >
              取消
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm">
          确定删除「{deleting?.word}」吗？默认仅软删除词条并保留学习历史，便于日后恢复。
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deleteHistory}
            onChange={(e) => setDeleteHistory(e.target.checked)}
          />
          同时删除该词的学习记录与词典缓存（不可恢复）
        </label>
      </Modal>
    </div>
  );
}

function EditModal({
  vocabulary,
  onClose,
  onSaved,
}: {
  vocabulary: Vocabulary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotifications();
  const [meanings, setMeanings] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsText, setTagsText] = useState('');

  useEffect(() => {
    if (vocabulary) {
      setMeanings(vocabulary.userMeanings ?? '');
      setNotes(vocabulary.notes ?? '');
      setTagsText(vocabulary.tags.join(', '));
    }
  }, [vocabulary]);

  const save = async () => {
    if (!vocabulary) return;
    const tags = tagsText
      .split(/[,\uFF0C;；]/)
      .map((t) => t.trim())
      .filter(Boolean);
    await vocabularyRepo.update(vocabulary.id, {
      userMeanings: meanings.trim() || undefined,
      notes: notes.trim() || undefined,
      tags,
    });
    notify('success', `已保存「${vocabulary.word}」`);
    onSaved();
  };

  return (
    <Modal
      open={vocabulary !== null}
      title={`编辑「${vocabulary?.word ?? ''}」`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="我的释义" hint="与词典来源数据分开保存，刷新词典不会覆盖。">
          <TextArea rows={3} value={meanings} onChange={(e) => setMeanings(e.target.value)} />
        </Field>
        <Field label="标签" hint="用逗号分隔">
          <TextInput value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </Field>
        <Field label="备注">
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
