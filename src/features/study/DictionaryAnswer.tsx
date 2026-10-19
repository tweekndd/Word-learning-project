import type { DictionaryEntryDto, DictionaryError } from '@/types/dictionary';
import type { Vocabulary } from '@/types/domain';
import { stripHtml } from '@/utils/sanitize';
import { isProbablyUrl } from '@/utils/text';
import { Badge } from '@/components/ui';

const SOURCE_LABEL: Record<string, string> = {
  mock: 'MOCK 数据（非真实词典内容）',
  collins: 'Collins（英文，无中文释义）',
  user: '用户输入',
  local: '本地词库',
};

export function DictionaryAnswer({
  entry,
  dictError,
  vocabulary,
}: {
  entry?: DictionaryEntryDto;
  dictError?: DictionaryError;
  vocabulary: Vocabulary;
}) {
  const userMeanings = vocabulary.userMeanings;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {entry && (
          <Badge tone={entry.source === 'mock' ? 'mock' : 'accent'}>
            {SOURCE_LABEL[entry.source] ?? entry.source}
          </Badge>
        )}
        {entry?.audioUrl && isProbablyUrl(entry.audioUrl) && (
          <audio controls preload="none" src={entry.audioUrl} className="h-8 max-w-full">
            <track kind="captions" />
          </audio>
        )}
      </div>

      {userMeanings && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">我的释义</h3>
          <p className="whitespace-pre-line break-words text-sm">{userMeanings}</p>
        </section>
      )}

      {entry?.chineseMeanings.length ? (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">中文释义（来源标注）</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {entry.chineseMeanings.map((m, i) => (
              <li key={i} className="break-words">
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">中文释义</h3>
          <p className="text-sm text-content-muted">
            {entry?.source === 'collins'
              ? '来源未提供中文释义。你可以在词库页自行补充。'
              : '暂无中文释义。'}
          </p>
        </section>
      )}

      {entry?.englishDefinition && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">英文释义</h3>
          <p className="break-words text-sm">{entry.englishDefinition}</p>
        </section>
      )}

      {entry?.examples && entry.examples.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">例句</h3>
          <ul className="space-y-1 text-sm">
            {entry.examples.slice(0, 5).map((ex, i) => (
              <li key={i} className="break-words">
                <span className="text-content">{ex.english}</span>
                {ex.chineseTranslation && (
                  <span className="block text-xs text-content-muted">{ex.chineseTranslation}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry?.rawHtml && !entry.englishDefinition && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-content-muted">词典内容</h3>
          <div
            className="break-words text-sm [&_a]:underline"
            // HTML is passed through stripHtml(), an allow-list stripper that
            // removes scripts, event handlers and javascript: URLs.
            dangerouslySetInnerHTML={{ __html: stripHtml(entry.rawHtml) }}
          />
        </section>
      )}

      {!entry && !dictError && <p className="text-sm text-content-muted">暂无词典内容。</p>}

      {dictError && (
        <p className="text-sm text-danger" role="alert">
          {dictError.kind === 'not-configured'
            ? '词典服务未配置，学习仍可继续。'
            : `词典提示：${dictError.message}（不影响继续学习）`}
        </p>
      )}

      {entry?.source === 'collins' && entry.licenseNote && (
        <p className="text-[11px] text-content-muted">{entry.licenseNote}</p>
      )}
      {entry?.sourceUrl && (
        <p className="text-[11px] text-content-muted">来源链接已被校验，不在应用内自动打开。</p>
      )}
    </div>
  );
}
