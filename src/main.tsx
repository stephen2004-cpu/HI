import React from 'react';
import ReactDOM from 'react-dom/client';
import AccountApp from './AccountApp';
import PasswordRecovery from './PasswordRecovery';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-800.css';
import './styles.css';
import './interface.css';
import InterfaceFeedback from './InterfaceFeedback';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InterfaceFeedback />
    <PasswordRecovery>
      <AccountApp />
    </PasswordRecovery>
  </React.StrictMode>,
);
