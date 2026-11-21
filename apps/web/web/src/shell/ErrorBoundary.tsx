import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Catches a crash in any page so the person sees a way forward and not a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Stays in the browser console for a developer; nothing is sent anywhere.
    console.error('The page crashed', error.message, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground" role="alert">
        <h2 className="text-lg font-semibold text-destructive">Something went wrong on this page</h2>
        <p className="max-w-[46ch]">Your work elsewhere is safe. Reload the page to try again. If it keeps happening, tell an admin what you were doing.</p>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    );
  }
}
