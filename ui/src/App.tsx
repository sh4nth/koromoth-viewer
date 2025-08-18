import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ImageList from "./components/ImageList";
import ImageDetail from "./components/ImageDetail";

function App() {
  return (
    <Router>
      <div className="container mt-4">
        <Routes>
          <Route path="/" element={<ImageList />} />
          <Route path="/image/:imageKey" element={<ImageDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
