import { useEffect, useState } from 'react';
import CyberSpace from './CyberSpace';
import PortfolioMain from './PortfolioMain';

export default function App() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    console.log('%c[CONNEXION ÉTABLIE] %cTiens, un·e curieux·se ! Bon réflexe.', 'color:#00b9ff;font-weight:bold;font-size:13px;', 'color:#ddeeff;font-size:13px;');
    console.log('%cPuisque tu inspectes le code, on est sur la même longueur d\'onde.', 'color:#aaddff;font-size:12px;');
    console.log('%cSi tu cherches une alternante qui adore configurer des clusters Proxmox,\noptimiser des shaders et durcir des LXC Linux sans jamais s\'arrêter d\'apprendre,\n je serais ravie d\'en discuter !', 'color:#aaddff;font-size:12px;');
    console.log('%c→ coline.derycke@gmail.com', 'color:#00b9ff;font-weight:bold;font-size:12px;');
  }, []);

  return entered
    ? <PortfolioMain onBack={() => setEntered(false)} />
    : <CyberSpace onDiveComplete={() => setEntered(true)} />;
}
