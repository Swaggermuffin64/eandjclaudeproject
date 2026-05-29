import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Ingest from './pages/Ingest';
import Template from './pages/Template';
import Dossier from './pages/Dossier';
import Score from './pages/Score';
import Audit from './pages/Audit';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/ingest', label: '1. Ingest' },
  { path: '/template', label: '2. Template' },
  { path: '/dossier', label: '3. Dossier' },
  { path: '/score', label: '4. Score' },
  { path: '/audit', label: '5. Audit' },
];

export default function App() {
  return (
    <div className="flex h-screen">
      <nav className="w-56 bg-gray-900 text-gray-300 flex flex-col p-4 space-y-1">
        <h2 className="text-white font-bold text-lg mb-4">Research Pipeline</h2>
        {navItems.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto bg-gray-50 p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/template" element={<Template />} />
          <Route path="/dossier" element={<Dossier />} />
          <Route path="/score" element={<Score />} />
          <Route path="/audit" element={<Audit />} />
        </Routes>
      </main>
    </div>
  );
}
