import {useState, type FormEvent} from 'react';
import {supabase} from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setNote(''); setBusy(true);
    try {
      if (mode === 'in') {
        const {error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
        if (error) throw error;
      } else if (mode === 'up') {
        const {data, error} = await supabase.auth.signUp({email: email.trim(), password});
        if (error) throw error;
        if (!data.session) setNote('Check your email to confirm your account, then sign in.');
      } else {
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setNote('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <img className="logo" src="/logo.png" alt="" />
        <h1>{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Create account' : 'Reset password'}</h1>
        <div className="sub">{mode === 'forgot' ? 'We will email you a reset link' : 'Sign in to continue to Cinebox'}</div>
        <input className="field" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
        {mode !== 'forgot' && (
          <input className="field" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        )}
        {error && <div className="err">{error}</div>}
        {note && <div className="ok">{note}</div>}
        <button className="btn accent press" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign In' : mode === 'up' ? 'Sign Up' : 'Send link'}
        </button>
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 18}}>
          {mode === 'in' ? (
            <>
              <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot password?</button>
              <button type="button" className="link" onClick={() => setMode('up')}>Create account</button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => { setMode('in'); setError(''); setNote(''); }}>Back to sign in</button>
          )}
        </div>
      </form>
    </div>
  );
}
