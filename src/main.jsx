import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './workspace.css';
import './conversation-tools.css';
import './settings-controls.css';
import './workspace-refinement.css';

class ErrorBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error?<div className="fatal-error"><h1>界面遇到问题</h1><p>{String(this.state.error.message)}</p><button onClick={()=>location.reload()}>重新加载</button></div>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<div className="desktop-frame"><div className="window-dragbar" aria-hidden="true"><span/></div><div className="window-content"><ErrorBoundary><App/></ErrorBoundary></div></div>);
