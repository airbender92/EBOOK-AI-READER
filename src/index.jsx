/**
 * React Application Entry Point
 * Mounts the root App component into the DOM.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
