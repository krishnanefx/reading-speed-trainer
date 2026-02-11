import React from 'react';

interface ViewErrorBoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
}

export class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ViewErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="view-loader" role="alert">
          This section failed to load. Try switching tabs and returning.
        </div>
      );
    }
    return this.props.children;
  }
}
