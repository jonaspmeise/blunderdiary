import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { loadLastUsername, saveLastUsername } from '../storage';

export function Setup({ onImport }: { readonly onImport: (username: string) => Promise<void> }) {
  const [username, setUsername] = useState(loadLastUsername);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await onImport(username);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <main className="setup-page">
      <section className="setup-panel">
        <div className="brand">
          blunder <span>diary</span>
        </div>
        <h1>Find the move.</h1>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="username">Chess.com handle</label>
          <div className="handle-input">
            <input
              id="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                saveLastUsername(event.target.value);
              }}
              placeholder="username"
              autoComplete="username"
            />
            <button
              className="primary icon-command"
              type="submit"
              disabled={!username.trim() || isLoading}
              aria-label="Import games"
            >
              {isLoading ? <span className="spinner" /> : <ArrowRight size={19} />}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </section>
    </main>
  );
}
