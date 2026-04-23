// App.js
// Root client component: initializes axios auth header and defines app routes (React Router).

import React, { useEffect } from "react";
import axios from "axios";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import AreaList from "./AreaList";
import EditArea from "./EditArea";
import Login from "./Login";

function App() {
  useEffect(() => {
    // On app load: read JWT from localStorage and set/remove the global Authorization header.
    const token = localStorage.getItem("shade_token");
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }

    // Optional: set a global API base URL if your server runs on a fixed address/port.
    // axios.defaults.baseURL = "http://localhost:5000";
  }, []);

  return (
    <Router>
      <Routes>
        {/* Default route: login screen */}
        <Route path="/" element={<Login />} />

        {/* Main screen: areas list (shown after successful login) */}
        <Route path="/areaList" element={<AreaList />} />

        {/* Edit screen: loads a specific area by its :name URL param */}
        <Route path="/edit/:name" element={<EditArea />} />
      </Routes>
    </Router>
  );
}

export default App;
