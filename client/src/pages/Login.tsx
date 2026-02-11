import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setError('');
    setLoading(true);
    try {
      await login(password);
    } catch {
      setError('Invalid password');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg0)',
      backgroundImage: 'radial-gradient(ellipse at 50% 40%, rgba(52,211,153,0.04) 0%, transparent 60%)',
    }}>
      <form
        onSubmit={handleSubmit}
        className="glass-static"
        style={{
          width: 360,
          padding: '40px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          animation: shake ? 'shake 0.4s ease' : undefined,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* PokeBall icon */}
          <div style={{
            width: 48, height: 48, borderRadius: 48,
            border: '3px solid var(--tMax)',
            position: 'relative',
            background: 'linear-gradient(180deg, var(--red) 50%, #fff 50%)',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 14, height: 14, borderRadius: 14,
              background: 'var(--bg0)',
              border: '3px solid var(--tMax)',
              zIndex: 1,
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: 0, right: 0,
              height: 3, background: 'var(--tMax)',
              transform: 'translateY(-50%)',
            }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--tMax)', letterSpacing: -1 }}>
            Poke<span style={{ color: 'var(--red)' }}>Snipe</span>
          </h1>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: 'var(--tMut)',
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}>
            No BS Arbitrage
          </span>
        </div>

        {/* Password input */}
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%',
            height: 48,
            background: 'var(--glass)',
            border: `1px solid ${error ? 'var(--red)' : 'var(--brd)'}`,
            borderRadius: 8,
            padding: '0 16px',
            color: 'var(--tMax)',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 500, marginTop: -12 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            height: 48,
            background: 'var(--glass)',
            border: '1px solid var(--brd)',
            borderRadius: 8,
            color: 'var(--tMax)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            transition: 'all 0.15s',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'ENTERING...' : 'ENTER'}
        </button>

        {/* Footer */}
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          color: 'var(--tMut)',
          textTransform: 'uppercase',
          letterSpacing: 2.5,
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          PRIVATE DASHBOARD · PASSWORD PROTECTED
        </span>
      </form>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
