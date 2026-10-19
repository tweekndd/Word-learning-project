import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log only non-sensitive diagnostics. Never include user data.
    console.error('[WordPocket] 渲染错误:', error.message, info.componentStack?.slice(0, 200));
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-line bg-surface-raised p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">界面出现错误</h1>
          <p className="mb-4 text-sm text-content-muted">
            已捕获异常，你的数据仍保存在本地。可尝试重新加载页面。
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-accent px-4 py-2 text-sm text-accent-fg"
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="rounded border border-line px-4 py-2 text-sm"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }
}
