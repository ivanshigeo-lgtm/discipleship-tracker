'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  name?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`ErrorBoundary [${this.props.name || 'unnamed'}]:`, error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold text-red-400">
              Error in {this.props.name || 'component'}
            </p>
            <p className="mt-1 text-red-300/80">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
        )
      )
    }

    return this.props.children
  }
}
