import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SpotifyAuth from './components/SpotifyAuth.tsx';
import StartScreen from './components/StartScreen.tsx';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<SpotifyAuth />} />
          <Route path="/callback" element={<StartScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;