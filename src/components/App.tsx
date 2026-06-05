import { useState } from 'react';
import CyberSpace from './CyberSpace';
import PortfolioMain from './PortfolioMain';

export default function App() {
  const [entered, setEntered] = useState(false);
  return entered
    ? <PortfolioMain />
    : <CyberSpace onDiveComplete={() => setEntered(true)} />;
}
