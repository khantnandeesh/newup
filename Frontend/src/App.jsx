import React from 'react'
import './App.css'
import FileUploader from './components/FileUploader'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
         
        </header>
        <main>
          <Routes>
            <Route path="/" element={<FileUploader />} />
            <Route path="/f/:id" element={<FileUploader />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
