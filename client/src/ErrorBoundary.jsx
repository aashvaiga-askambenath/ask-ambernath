import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="page error-boundary" role="alert">
      <div className="card">
        <h1>This page needs another moment.</h1>
        <p>Something interrupted the page from loading. Refresh to give it another try.</p>
        <button className="primary-btn" onClick={() => window.location.reload()}>Refresh the page</button>
      </div>
    </main>;
  }
}
