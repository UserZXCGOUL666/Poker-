import { ArrowDown, ArrowLeft, ArrowUp, Bell, CalendarPlus, CheckCircle2, ChevronRight, Coins, LayoutDashboard, LogOut, Medal, Plus, Save, Search, ShieldCheck, Spade, Trophy, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ErrorState, Loading } from '../components/Loading';
import { useAuth } from '../contexts/AuthContext';
import { api, post } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { PointTransaction, Season, Tournament, User } from '../types';

type AdminTab = 'overview' | 'points' | 'tournaments' | 'results' | 'seasons';
type AdminUser = Pick<User, 'id' | 'telegramId' | 'firstName' | 'lastName' | 'username' | 'role' | 'points'>;
type Overview = { players: number; tournaments: number; activeSeason: Season | null; recentTournaments: (Tournament & { _count: { results: number; notifications: number } })[] };
type TournamentDetails = Tournament & { results: { userId: string; place: number; points: number; user: AdminUser }[] };
type AdminPointTransaction = PointTransaction & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'username' | 'points'> };

const tabs = [
  { id: 'overview' as const, label: 'Обзор', icon: LayoutDashboard },
  { id: 'points' as const, label: 'Очки', icon: Coins },
  { id: 'tournaments' as const, label: 'Турниры', icon: CalendarPlus },
  { id: 'results' as const, label: 'Результаты', icon: Medal },
  { id: 'seasons' as const, label: 'Сезоны', icon: Trophy }
];

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overviewData, seasonsData, tournamentsData, usersData] = await Promise.all([
        api<Overview>('/admin/overview'), api<Season[]>('/admin/seasons'), api<Tournament[]>('/tournaments'), api<AdminUser[]>('/admin/users')
      ]);
      setOverview(overviewData); setSeasons(seasonsData); setTournaments(tournamentsData); setUsers(usersData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить админку'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function done(message: string) { setNotice(message); window.setTimeout(() => setNotice(null), 3500); void load(); }
  if (error) return <div className="admin-shell"><ErrorState message={error} /></div>;
  if (!overview) return <div className="admin-shell"><Loading label="Открываем админку…" /></div>;

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span><Spade size={21} fill="currentColor" /></span><div><strong>POKER CLUB</strong><small>Панель управления</small></div></div>
      <nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} />{label}</button>)}</nav>
      <div className="admin-user"><Avatar firstName={user!.firstName} lastName={user!.lastName} size="sm" /><div><strong>{user!.firstName}</strong><small>Администратор</small></div><Link to="/"><LogOut size={18} /></Link></div>
    </aside>
    <main className="admin-main">
      <header className="admin-mobile-head"><Link to="/"><ArrowLeft /></Link><strong>Управление клубом</strong><ShieldCheck /></header>
      <div className="admin-mobile-tabs">{tabs.map(({ id, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} /></button>)}</div>
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}</div>}
      {tab === 'overview' && <OverviewTab data={overview} onNavigate={setTab} onNotify={async (id) => { const r = await post<{ sentCount: number; failedCount: number }>(`/admin/tournaments/${id}/notify`); done(`Отправлено: ${r.sentCount}, ошибок: ${r.failedCount}`); }} />}
      {tab === 'points' && <PointsTab users={users} onDone={done} />}
      {tab === 'tournaments' && <TournamentsTab seasons={seasons} tournaments={tournaments} onDone={done} />}
      {tab === 'results' && <ResultsTab tournaments={tournaments} users={users} onDone={done} />}
      {tab === 'seasons' && <SeasonsTab seasons={seasons} onDone={done} />}
    </main>
  </div>;
}

function AdminHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="admin-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>;
}

function OverviewTab({ data, onNavigate, onNotify }: { data: Overview; onNavigate: (tab: AdminTab) => void; onNotify: (id: string) => Promise<void> }) {
  const [sending, setSending] = useState<string | null>(null);
  return <div className="admin-view">
    <AdminHeading eyebrow="ПАНЕЛЬ УПРАВЛЕНИЯ" title="Добрый день!" text="Краткая сводка по Poker Club" />
    <div className="admin-stat-grid">
      <div><span><Users /></span><p>Игроков</p><strong>{data.players}</strong></div>
      <div><span><CalendarPlus /></span><p>Турниров</p><strong>{data.tournaments}</strong></div>
      <div><span><Trophy /></span><p>Активный сезон</p><strong>{data.activeSeason?.name ?? '—'}</strong></div>
    </div>
    <section className="admin-section">
      <div className="admin-section-title"><div><h2>Последние турниры</h2><p>Управление играми и уведомлениями</p></div><button className="button ghost" onClick={() => onNavigate('tournaments')}>Все турниры <ChevronRight size={16} /></button></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Турнир</th><th>Дата</th><th>Статус</th><th>Результаты</th><th /></tr></thead><tbody>
        {data.recentTournaments.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.season?.name}</small></td><td>{tournamentDate(item.startsAt).full}</td><td><Status value={item.status} /></td><td>{item._count.results || '—'}</td><td>{item.status === 'UPCOMING' && <button className="icon-button" title="Отправить уведомление" disabled={sending === item.id} onClick={async () => { setSending(item.id); try { await onNotify(item.id); } finally { setSending(null); } }}><Bell size={17} /></button>}</td></tr>)}
      </tbody></table></div>
    </section>
    <button className="scoring-summary" onClick={() => onNavigate('points')}><span><Coins /></span><div><h3>Ручное управление очками</h3><p>Каждое изменение записывается в защищённый журнал с причиной и именем администратора</p></div><strong>Начислить <ChevronRight size={15} /></strong></button>
  </div>;
}

function PointsTab({ users, onDone }: { users: AdminUser[]; onDone: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'award' | 'deduct'>('award');
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('Участие в турнире');
  const [history, setHistory] = useState<AdminPointTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const selected = users.find((user) => user.id === selectedId);
  const filteredUsers = users.filter((user) => `${user.firstName} ${user.lastName ?? ''} ${user.username ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const numericAmount = Math.max(0, Number(amount) || 0);
  const signedAmount = mode === 'award' ? numericAmount : -numericAmount;
  const projected = (selected?.points ?? 0) + signedAmount;

  const loadHistory = useCallback(async (userId: string) => {
    if (!userId) return setHistory([]);
    setLoadingHistory(true);
    try { setHistory(await api<AdminPointTransaction[]>(`/admin/points/history?userId=${encodeURIComponent(userId)}&take=30`)); }
    finally { setLoadingHistory(false); }
  }, []);
  useEffect(() => { void loadHistory(selectedId); }, [selectedId, loadHistory]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !numericAmount || projected < 0) return;
    setSaving(true); setFormError(null);
    try {
      await post('/admin/points', { userId: selected.id, amount: signedAmount, reason, idempotencyKey: requestKey });
      setRequestKey(crypto.randomUUID());
      await loadHistory(selected.id);
      onDone(`${signedAmount > 0 ? 'Начислено' : 'Списано'} ${points(Math.abs(signedAmount))} PTS`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Не удалось изменить баланс');
    } finally { setSaving(false); }
  }

  return <div className="admin-view">
    <AdminHeading eyebrow="БАЛАНС ИГРОКОВ" title="Управление очками" text="Выберите пользователя и сохраните начисление или списание в журнале" />
    <div className="points-admin-grid">
      <form className="points-form" onSubmit={submit}>
        <label className="player-search"><span>Поиск игрока</span><div><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или username" /></div></label>
        <label>Пользователь<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>{filteredUsers.map((user) => <option value={user.id} key={user.id}>{user.username ? `@${user.username}` : `${user.firstName} ${user.lastName ?? ''}`} — {points(user.points)} PTS</option>)}</select></label>
        {selected && <div className="selected-player"><Avatar firstName={selected.firstName} lastName={selected.lastName} size="md" /><div><strong>{selected.firstName} {selected.lastName}</strong><span>@{selected.username || 'player'}</span></div><b>{points(selected.points)}<small> PTS</small></b></div>}
        <div className="point-mode"><button type="button" className={mode === 'award' ? 'active award' : ''} onClick={() => setMode('award')}>+ Начислить</button><button type="button" className={mode === 'deduct' ? 'active deduct' : ''} onClick={() => setMode('deduct')}>− Списать</button></div>
        <label>Количество PTS<input type="number" min="1" max="100000" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label>Причина<input list="point-reasons" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={160} required /><datalist id="point-reasons"><option value="Участие в турнире" /><option value="Призовое место" /><option value="Бонус клуба" /><option value="Корректировка результата" /><option value="Нарушение регламента" /></datalist></label>
        <div className={`balance-preview ${projected < 0 ? 'invalid' : ''}`}><span>Баланс после операции</span><strong>{points(projected)} PTS</strong></div>
        {formError && <div className="form-error">{formError}</div>}
        <button className={`button wide ${mode === 'award' ? 'primary' : 'deduct-button'}`} disabled={saving || !selected || !numericAmount || projected < 0}><Save size={17} />{saving ? 'Сохраняем…' : mode === 'award' ? 'Начислить очки' : 'Списать очки'}</button>
      </form>
      <section className="point-audit"><div><h2>История операций</h2><p>{selected ? `Последние изменения: ${selected.firstName}` : 'Выберите игрока'}</p></div>
        {loadingHistory ? <Loading label="Загружаем журнал…" /> : <div className="audit-list">{history.map((entry) => <article key={entry.id}><span className={entry.amount > 0 ? 'award' : 'deduct'}>{entry.amount > 0 ? '+' : ''}{points(entry.amount)}</span><div><strong>{entry.reason}</strong><small>{tournamentDate(entry.createdAt).full} · {entry.createdBy.firstName} {entry.createdBy.lastName ?? ''}</small></div><b>{points(entry.balanceAfter)}</b></article>)}{!history.length && <div className="empty-result"><Coins /><strong>Операций пока нет</strong><p>Первое изменение появится здесь</p></div>}</div>}
      </section>
    </div>
  </div>;
}

function TournamentsTab({ seasons, tournaments, onDone }: { seasons: Season[]; tournaments: Tournament[]; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await post('/admin/tournaments', { seasonId: form.get('seasonId'), title: form.get('title'), description: form.get('description'), startsAt: new Date(String(form.get('startsAt'))).toISOString(), location: form.get('location'), capacity: Number(form.get('capacity')), participantCount: 0, status: 'UPCOMING' });
      setOpen(false); onDone('Турнир создан');
    } finally { setSaving(false); }
  }
  return <div className="admin-view">
    <div className="admin-title-row"><AdminHeading eyebrow="РАСПИСАНИЕ" title="Турниры" text="Создавайте игры и следите за их статусом" /><button className="button primary" onClick={() => setOpen(true)}><Plus size={18} /> Новый турнир</button></div>
    <div className="admin-cards-list">{tournaments.map((item) => <article key={item.id} className="admin-tournament-card"><div className="date-tile"><strong>{tournamentDate(item.startsAt).day}</strong><span>{tournamentDate(item.startsAt).month}</span></div><div><h3>{item.title}</h3><p>{tournamentDate(item.startsAt).time} · {item.location || 'Место не указано'}</p></div><Status value={item.status} /><span className="participants"><Users size={16} />{item.participantCount}/{item.capacity}</span></article>)}</div>
    {open && <Modal title="Новый турнир" onClose={() => setOpen(false)}><form className="admin-form" onSubmit={submit}>
      <label>Название<input name="title" required minLength={2} placeholder="Пятничный турнир" /></label>
      <div className="form-row"><label>Сезон<select name="seasonId" required defaultValue={seasons.find((s) => s.isActive)?.id}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}</option>)}</select></label><label>Дата и время<input name="startsAt" type="datetime-local" required /></label></div>
      <div className="form-row"><label>Место<input name="location" placeholder="Poker Club" /></label><label>Макс. игроков<input name="capacity" type="number" min="2" defaultValue="48" /></label></div>
      <label>Описание<textarea name="description" rows={3} placeholder="Краткое описание игры" /></label>
      <button className="button primary wide" disabled={saving}><Save size={18} />{saving ? 'Сохраняем…' : 'Создать турнир'}</button>
    </form></Modal>}
  </div>;
}

function ResultsTab({ tournaments, users, onDone }: { tournaments: Tournament[]; users: AdminUser[]; onDone: (message: string) => void }) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? '');
  const [entries, setEntries] = useState<AdminUser[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    api<TournamentDetails>(`/admin/tournaments/${tournamentId}`).then((details) => setEntries(details.results.map((item) => users.find((u) => u.id === item.userId) ?? item.user))).catch(() => setEntries([]));
  }, [tournamentId, users]);
  const available = useMemo(() => users.filter((user) => !entries.some((entry) => entry.id === user.id)), [users, entries]);
  function move(index: number, direction: -1 | 1) { const next = [...entries]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setEntries(next); }
  async function save() { setSaving(true); try { await post(`/admin/tournaments/${tournamentId}/results`, { results: entries.map((user, index) => ({ userId: user.id, place: index + 1 })) }, 'PUT'); onDone('Места игроков сохранены'); } finally { setSaving(false); } }
  return <div className="admin-view">
    <AdminHeading eyebrow="РЕЙТИНГ" title="Результаты турнира" text="Добавьте игроков и расположите их по занятым местам" />
    <section className="result-editor">
      <label className="select-tournament">Турнир<select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>{tournaments.map((item) => <option value={item.id} key={item.id}>{item.title} — {tournamentDate(item.startsAt).full}</option>)}</select></label>
      <div className="add-player"><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Выберите игрока</option>{available.map((user) => <option value={user.id} key={user.id}>{user.username || `${user.firstName} ${user.lastName ?? ''}`}</option>)}</select><button className="button secondary" disabled={!playerId} onClick={() => { const user = users.find((u) => u.id === playerId); if (user) setEntries([...entries, user]); setPlayerId(''); }}><Plus size={17} />Добавить</button></div>
      <div className="result-list">{entries.map((user, index) => <div className="result-row" key={user.id}><span className={`result-place ${index < 3 ? 'podium' : ''}`}>{index + 1}</span><Avatar firstName={user.firstName} lastName={user.lastName} size="sm" /><div><strong>{user.username || `${user.firstName} ${user.lastName ?? ''}`}</strong><small>Очки начисляются отдельно вручную</small></div><div className="row-actions"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp /></button><button onClick={() => move(index, 1)} disabled={index === entries.length - 1}><ArrowDown /></button><button className="danger" onClick={() => setEntries(entries.filter((entry) => entry.id !== user.id))}><X /></button></div></div>)}
      {!entries.length && <div className="empty-result"><Medal /><strong>Добавьте участников</strong><p>Первый в списке займёт первое место</p></div>}</div>
      <button className="button primary save-results" disabled={entries.length < 2 || saving} onClick={save}><Save size={18} />{saving ? 'Сохраняем…' : 'Сохранить места'}</button>
    </section>
  </div>;
}

function SeasonsTab({ seasons, onDone }: { seasons: Season[]; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await post('/admin/seasons', { name: form.get('name'), number: Number(form.get('number')), startsAt: new Date(String(form.get('startsAt'))).toISOString(), endsAt: new Date(String(form.get('endsAt'))).toISOString(), isActive: form.get('isActive') === 'on' });
    setOpen(false); onDone('Сезон создан');
  }
  return <div className="admin-view">
    <div className="admin-title-row"><AdminHeading eyebrow="ПЕРИОДЫ ЛИГИ" title="Сезоны" text="Управляйте периодами рейтинга" /><button className="button primary" onClick={() => setOpen(true)}><Plus size={18} /> Новый сезон</button></div>
    <div className="season-grid">{seasons.map((season) => <article className={`season-card ${season.isActive ? 'active' : ''}`} key={season.id}><div><span>{season.isActive ? 'АКТИВНЫЙ' : 'ЗАВЕРШЁН'}</span><h2>{season.name}</h2><p>{tournamentDate(season.startsAt).full} — {tournamentDate(season.endsAt).full}</p></div><strong>{season._count?.tournaments ?? 0}<small> турниров</small></strong></article>)}</div>
    {open && <Modal title="Новый сезон" onClose={() => setOpen(false)}><form className="admin-form" onSubmit={submit}><div className="form-row"><label>Название<input name="name" required placeholder="Сезон 05" /></label><label>Номер<input type="number" name="number" required min="1" /></label></div><div className="form-row"><label>Начало<input type="date" name="startsAt" required /></label><label>Окончание<input type="date" name="endsAt" required /></label></div><label className="checkbox"><input type="checkbox" name="isActive" />Сделать активным сезоном</label><button className="button primary wide"><Save size={18} />Создать сезон</button></form></Modal>}
  </div>;
}

function Status({ value }: { value: Tournament['status'] }) {
  const text = { UPCOMING: 'Скоро', ACTIVE: 'Идёт', FINISHED: 'Завершён', CANCELLED: 'Отменён' }[value];
  return <span className={`status status-${value.toLowerCase()}`}>{text}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X /></button></div>{children}</div></div>;
}
