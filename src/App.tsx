import {HashRouter, Navigate, Outlet, Route, Routes, useLocation} from 'react-router-dom';
import {AuthProvider, useAuth} from './store/auth';
import {ServersProvider} from './store/servers';
import {Sidebar} from './components/Parts';
import Login from './pages/Login';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import Settings from './pages/Settings';
import Info from './pages/Info';
import Player from './pages/Player';
import LiveTv from './pages/LiveTv';

const Shell = () => {
  const {session, ready} = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="login"><img src="/logo.png" width={72} height={72} style={{borderRadius: 20}} alt="" /></div>;
  if (!session) return <Login />;
  const watching = loc.pathname === '/watch';
  return (
    <ServersProvider>
      {watching ? (
        <Outlet />
      ) : (
        <div className="shell">
          <Sidebar />
          <main className="main" key={loc.pathname}><Outlet /></main>
        </div>
      )}
    </ServersProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="library" element={<Library />} />
            <Route path="live" element={<LiveTv />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/:section" element={<Settings />} />
            <Route path="info" element={<Info />} />
            <Route path="watch" element={<Player />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
