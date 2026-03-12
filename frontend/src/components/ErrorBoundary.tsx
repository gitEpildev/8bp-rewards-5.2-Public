import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches uncaught errors in the tree and shows a friendly message instead of a blank screen.
 * Logs errors for debugging.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('ErrorBoundary caught an error', {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-[40vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-4 p-6 rounded-2xl bg-gray-100 dark:bg-background-dark-tertiary border border-gray-200 dark:border-white/10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We've been notified. Please try refreshing the page or come back later.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
