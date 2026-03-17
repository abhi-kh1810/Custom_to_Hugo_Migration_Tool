import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Home from './pages/Home';
import CreateProject from './pages/CreateProject';
import ProjectDetail from './pages/ProjectDetail';
import FetchSite from './pages/FetchSite';
import DownloadHTTrack from './pages/DownloadHTTrack';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<CreateProject />} />
        <Route path="fetch" element={<FetchSite />} />
        <Route path="project/:id" element={<ProjectDetail />} />
        <Route path="download-from-httrack" element={<DownloadHTTrack />} />
      </Route>
    </Routes>
  );
}
