import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed.error) {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.path})` : ''}`;
      }
    } catch {
      // Keep raw error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('TERRA Track Rider ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            paddingTop: 'calc(2rem + env(safe-area-inset-top))',
            paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
          }}
          className="flex min-h-screen w-full items-center justify-center bg-[#E6EBF2] px-4"
        >
          <main className="neu-raised-2 w-full max-w-md rounded-3xl p-6 text-center sm:p-8">
            <div className="neu-inset-sm mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[#DC2626]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold text-[#111827]">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1F2937] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="neu-teal mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-display text-sm font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reload application</span>
            </button>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
