import AppRouter from './routes/AppRouter'
import './App.css'
import { AuthGate } from './auth/AuthGate'

function App() {
  return <AuthGate><AppRouter /></AuthGate>
}

export default App
