import { KeyRound, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export function BrowserLoginPage() {
  const { loginWithBrowserCode } = useAuth();
  const [code, setCode] = useState('');
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ botUrl: string | null }>('/auth/browser/config').then((config) => setBotUrl(config.botUrl)).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    try { await loginWithBrowserCode(code); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось войти по коду'); }
    finally { setSaving(false); }
  }

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return <main className="browser-login-shell">
    <section className="browser-login-card">
      <header><span><KeyRound /></span><div><small>POKER CLUB</small><h1>Вход в браузере</h1><p>Без пароля — подтверждение происходит через ваш Telegram.</p></div></header>
      <ol><li><span>1</span><div><strong>Откройте Telegram-бота</strong><small>Нажмите кнопку ниже или отправьте боту команду <code>/login</code>.</small></div></li><li><span>2</span><div><strong>Получите одноразовый код</strong><small>Он действует 10 минут и срабатывает только один раз.</small></div></li><li><span>3</span><div><strong>Введите код здесь</strong><small>После входа браузерная сессия будет видна в разделе безопасности.</small></div></li></ol>
      {botUrl && <a className="browser-login-bot" href={botUrl} target="_blank" rel="noreferrer"><Send />Открыть Telegram-бота</a>}
      <form onSubmit={submit}><label>Код из Telegram<input autoFocus autoComplete="one-time-code" inputMode="text" value={normalizedCode} onChange={(event) => setCode(event.target.value)} placeholder="ABCD-EFGH" /></label>{error && <div className="form-error">{error}</div>}<button className="button primary wide" disabled={saving || normalizedCode.length !== 8}><ShieldCheck />{saving ? 'Проверяем…' : 'Войти'}</button></form>
      <footer><ShieldCheck />Код хранится только в виде хеша и уничтожается после использования.</footer>
    </section>
  </main>;
}
