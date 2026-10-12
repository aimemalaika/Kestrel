import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  label?: string
  onReset?: () => void
}
interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    // Surface for diagnostics without crashing the tree.
    console.error('Kestrel: component error contained by boundary', error)
  }

  private reset = (): void => {
    this.props.onReset?.()
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    const label = this.props.label ?? 'This area'
    return (
      <div
        role="alert"
        className="m-4 rounded-md border border-zinc-800 bg-[#161b27] p-4 text-sm text-zinc-300"
      >
        <p className="font-semibold text-zinc-100">{label} hit an error.</p>
        <p className="mt-1 text-zinc-400">
          The rest of Kestrel is still working. You can retry without reloading.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-500 break-all">{this.state.error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
