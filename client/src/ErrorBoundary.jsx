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
        <h1>We hit a problem</h1>
        <p>The page could not be displayed. Reload to try again.</p>
        <button className="primary-btn" onClick={() => window.location.reload()}>Reload Ask Ambernath</button>
      </div>
    </main>;
  }
}
