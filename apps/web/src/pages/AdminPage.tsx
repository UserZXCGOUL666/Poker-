import {
  ArrowDown, ArrowLeft, ArrowUp, Bell, CalendarDays, CalendarPlus, CheckCircle2, ChevronRight,
  CircleAlert, Coins, Copy, Edit3, KeyRound, LayoutDashboard, LogOut, Medal, MonitorSmartphone,
  MoreHorizontal, Plus, Save, Search, Settings, ShieldCheck, ShieldOff, Spade, Trash2, Trophy,
  UserRound, Users, X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ErrorState, Loading } from '../components/Loading';
import { useAuth } from '../contexts/AuthContext';
import { api, post } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { PointTransaction, Season, Tournament, User } from '../types';

type AdminSection = 'overview' | 'players' | 'tournaments' | 'access' | 'settings' | 'more';
type AdminIntentKind = 'points' | 'newTournament' | 'results' | 'invite' | 'openTournament';
type AdminIntent = { kind: AdminIntentKind; nonce: number; targetId?: string } | null;
type AdminUser = Pick<User, 'id' | 'telegramId' | 'firstName' | 'lastName' | 'username' | 'role' | 'points'> & {
  _count?: { results: number; browserSessions: number };
};
type BrowserSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  user?: Pick<AdminUser, 'id' | 'telegramId' | 'firstName' | 'lastName' | 'username'>;
};
type BrowserInviteResult = { url: string; expiresAt: string; user: AdminUser };
type AdminUserDetails = AdminUser & {
  photoUrl: string | null;
  createdAt: string;
  pointTransactions: PointTransaction[];
  results: { id: string; place: number; createdAt: string; tournament: Pick<Tournament, 'id' | 'title' | 'startsAt' | 'status'> }[];
  browserSessions: BrowserSession[];
};
type AdminPointTransaction = PointTransaction & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'username'> };
type Overview = {
  players: number;
  tournaments: number;
  activeBrowserSessions: number;
  activeSeason: Season | null;
  nextTournament: Tournament | null;
  recentTournaments: (Tournament & { _count: { results: number; notifications: number } })[];
  recentPointTransactions: AdminPointTransaction[];
};
type TournamentDetails = Tournament & {
  description: string | null;
  season: Season;
  results: { userId: string; place: number; points: number; user: Pick<AdminUser, 'id' | 'firstName' | 'lastName' | 'username'> }[];
};

const desktopSections = [
  { id: 'overview' as const, label: 'Обзор', icon: LayoutDashboard },
  { id: 'players' as const, label: 'Игроки', icon: Users },
  { id: 'tournaments' as const, label: 'Турниры', icon: CalendarDays },
  { id: 'access' as const, label: 'Доступ', icon: KeyRound },
  { id: 'settings' as const, label: 'Настройки', icon: Settings }
];
const mobileSections = [
  { id: 'overview' as const, label: 'Обзор', icon: LayoutDashboard },
  { id: 'players' as const, label: 'Игроки', icon: Users },
  { id: 'tournaments' as const, label: 'Турниры', icon: CalendarDays },
  { id: 'more' as const, label: 'Ещё', icon: MoreHorizontal }
];
const sectionTitles: Record<AdminSection, string> = {
  overview: 'Обзор клуба', players: 'Игроки', tournaments: 'Турниры', access: 'Безопасность', settings: 'Настройки', more: 'Ещё'
};

export function AdminPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');
  const [intent, setIntent] = useState<AdminIntent>(null);
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
      setOverview(overviewData);
      setSeasons(seasonsData);
      setTournaments(tournamentsData);
      setUsers(usersData);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить админку');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function navigate(next: AdminSection, kind?: AdminIntentKind, targetId?: string) {
    setSection(next);
    setIntent(kind ? { kind, targetId, nonce: Date.now() } : null);
  }
  function done(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
    void load();
  }

  if (error) return <div className="admin-shell"><ErrorState message={error} /></div>;
  if (!overview) return <div className="admin-shell"><Loading label="Открываем админку…" /></div>;

  const moreActive = section === 'more' || section === 'access' || section === 'settings';
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span><Spade size={21} fill="currentColor" /></span><div><strong>POKER CLUB</strong><small>Панель управления</small></div></div>
      <small className="admin-nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</small>
      <nav>{desktopSections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}</button>)}</nav>
      <div className="admin-user"><Avatar firstName={user!.firstName} lastName={user!.lastName} size="sm" /><div><strong>{user!.firstName}</strong><small>Администратор</small></div><Link to="/" aria-label="Вернуться в приложение"><LogOut size={18} /></Link></div>
    </aside>
    <main className="admin-main">
      <header className="admin-mobile-head"><Link to="/"><ArrowLeft /></Link><strong>{sectionTitles[section]}</strong><ShieldCheck /></header>
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}</div>}
      {section === 'overview' && <OverviewTab data={overview} onNavigate={navigate} />}
      {section === 'players' && <PlayersTab users={users} intent={intent} onDone={done} />}
      {section === 'tournaments' && <TournamentsTab seasons={seasons} tournaments={tournaments} users={users} intent={intent} onDone={done} />}
      {section === 'access' && <AccessTab users={users} onDone={done} />}
      {section === 'settings' && <SettingsTab seasons={seasons} onDone={done} />}
      {section === 'more' && <MoreTab onNavigate={navigate} />}
      <nav className="admin-mobile-tabs">{mobileSections.map(({ id, label, icon: Icon }) => {
        const active = id === 'more' ? moreActive : section === id;
        return <button key={id} className={active ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>;
      })}</nav>
    </main>
  </div>;
}

function AdminHeading({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: ReactNode }) {
  return <div className="admin-heading-row"><div className="admin-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{actions && <div className="admin-heading-actions">{actions}</div>}</div>;
}

function OverviewTab({ data, onNavigate }: { data: Overview; onNavigate: (section: AdminSection, kind?: AdminIntentKind, targetId?: string) => void }) {
  return <div className="admin-view">
    <AdminHeading eyebrow="ПАНЕЛЬ УПРАВЛЕНИЯ" title="Добрый день!" text="Всё важное по клубу на одном экране" />
    {!data.activeSeason && <div className="admin-alert"><CircleAlert /><div><strong>Нет активного сезона</strong><span>Создайте или активируйте сезон, прежде чем начислять очки.</span></div><button onClick={() => onNavigate('settings')}>Настроить</button></div>}
    <div className="admin-stat-grid admin-stat-grid-four">
      <div><span><Users /></span><p>Игроков</p><strong>{data.players}</strong></div>
      <div><span><CalendarDays /></span><p>Турниров</p><strong>{data.tournaments}</strong></div>
      <div><span><MonitorSmartphone /></span><p>Сессий в браузере</p><strong>{data.activeBrowserSessions}</strong></div>
      <div><span><Trophy /></span><p>Активный сезон</p><strong className="stat-text">{data.activeSeason?.name ?? 'Не выбран'}</strong></div>
    </div>
    <section className="quick-actions-section">
      <div className="admin-section-title"><div><h2>Быстрые действия</h2><p>Частые операции без поиска по меню</p></div></div>
      <div className="quick-actions-grid">
        <button onClick={() => onNavigate('players', 'points')}><span><Coins /></span><div><strong>Изменить очки</strong><small>Начислить или списать</small></div><ChevronRight /></button>
        <button onClick={() => onNavigate('tournaments', 'newTournament')}><span><CalendarPlus /></span><div><strong>Создать турнир</strong><small>Добавить игру в расписание</small></div><ChevronRight /></button>
        <button onClick={() => onNavigate('tournaments', 'results')}><span><Medal /></span><div><strong>Внести результаты</strong><small>Расставить игроков по местам</small></div><ChevronRight /></button>
        <button onClick={() => onNavigate('access', 'invite')}><span><KeyRound /></span><div><strong>Выдать доступ</strong><small>Создать браузерную ссылку</small></div><ChevronRight /></button>
      </div>
    </section>
    <div className="overview-columns">
      <section className="admin-section">
        <div className="admin-section-title"><div><h2>Турниры</h2><p>{data.nextTournament ? `Ближайший: ${tournamentDate(data.nextTournament.startsAt).full}` : 'Ближайших игр пока нет'}</p></div><button className="button ghost" onClick={() => onNavigate('tournaments')}>Все <ChevronRight size={15} /></button></div>
        <div className="overview-tournament-list">{data.recentTournaments.slice(0, 5).map((item) => <button key={item.id} onClick={() => onNavigate('tournaments', 'openTournament', item.id)}><div className="mini-date"><strong>{tournamentDate(item.startsAt).day}</strong><span>{tournamentDate(item.startsAt).month}</span></div><div><strong>{item.title}</strong><small>{item.location || 'Место не указано'} · {item._count.results} результатов</small></div><Status value={item.status} /><ChevronRight /></button>)}{!data.recentTournaments.length && <Empty icon={<CalendarDays />} title="Турниров пока нет" text="Создайте первую игру через быстрое действие" />}</div>
      </section>
      <section className="admin-section">
        <div className="admin-section-title"><div><h2>Последние операции</h2><p>Журнал ручного изменения баланса</p></div><button className="button ghost" onClick={() => onNavigate('players')}>Игроки <ChevronRight size={15} /></button></div>
        <div className="overview-points-list">{data.recentPointTransactions.map((entry) => <article key={entry.id}><span className={entry.amount > 0 ? 'award' : 'deduct'}>{entry.amount > 0 ? '+' : ''}{points(entry.amount)}</span><div><strong>{entry.user.username ? `@${entry.user.username}` : `${entry.user.firstName} ${entry.user.lastName ?? ''}`}</strong><small>{entry.reason} · {tournamentDate(entry.createdAt).full}</small></div><b>{points(entry.balanceAfter)}</b></article>)}{!data.recentPointTransactions.length && <Empty icon={<Coins />} title="Операций пока нет" text="Начисления появятся здесь" />}</div>
      </section>
    </div>
  </div>;
}

function PlayersTab({ users, intent, onDone }: { users: AdminUser[]; intent: AdminIntent; onDone: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? '');
  const [detail, setDetail] = useState<AdminUserDetails | null>(null);
  const [detailTab, setDetailTab] = useState<'balance' | 'history' | 'access'>('balance');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'award' | 'deduct'>('award');
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('Участие в турнире');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [invite, setInvite] = useState<BrowserInviteResult | null>(null);
  const detailRequest = useRef(0);

  const loadDetail = useCallback(async (userId: string, clear = false) => {
    if (!userId) return setDetail(null);
    const request = ++detailRequest.current;
    if (clear) setDetail(null);
    setLoading(true);
    try {
      const next = await api<AdminUserDetails>(`/admin/users/${encodeURIComponent(userId)}`);
      if (detailRequest.current === request) setDetail(next);
    } catch (cause) {
      if (detailRequest.current === request) setFormError(cause instanceof Error ? cause.message : 'Не удалось открыть карточку игрока');
    } finally {
      if (detailRequest.current === request) setLoading(false);
    }
  }, []);
  useEffect(() => { setInvite(null); setFormError(null); void loadDetail(selectedId, true); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (intent?.kind === 'points') setDetailTab('balance');
    if (intent?.kind === 'invite') setDetailTab('access');
  }, [intent?.nonce, intent?.kind]);

  const filtered = users.filter((item) => `${item.firstName} ${item.lastName ?? ''} ${item.username ?? ''} ${item.telegramId}`.toLowerCase().includes(query.toLowerCase()));
  const numericAmount = Math.max(0, Number(amount) || 0);
  const signedAmount = mode === 'award' ? numericAmount : -numericAmount;
  const projected = (detail?.points ?? 0) + signedAmount;

  async function changePoints(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !numericAmount || projected < 0) return;
    setSaving(true); setFormError(null);
    try {
      await post('/admin/points', { userId: detail.id, amount: signedAmount, reason, idempotencyKey: requestKey });
      setRequestKey(crypto.randomUUID());
      await loadDetail(detail.id);
      onDone(`${signedAmount > 0 ? 'Начислено' : 'Списано'} ${points(Math.abs(signedAmount))} PTS`);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось изменить баланс'); }
    finally { setSaving(false); }
  }

  async function createInvite() {
    if (!detail) return;
    setSaving(true); setFormError(null); setInvite(null);
    try {
      const result = await post<BrowserInviteResult>('/admin/browser-access/invites', { userId: detail.id });
      setInvite(result); onDone('Одноразовая ссылка создана на 30 минут');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось создать ссылку'); }
    finally { setSaving(false); }
  }
  async function revoke(sessionId: string) {
    setSaving(true); setFormError(null);
    try {
      await post(`/admin/browser-access/sessions/${sessionId}/revoke`);
      await loadDetail(selectedId); onDone('Браузерный доступ отозван');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось отозвать доступ'); }
    finally { setSaving(false); }
  }

  return <div className="admin-view">
    <AdminHeading eyebrow="УЧАСТНИКИ КЛУБА" title="Игроки" text="Баланс, история и доступ конкретного пользователя в одной карточке" />
    <div className="players-workspace">
      <aside className="players-panel">
        <div className="players-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, username или Telegram ID" /></div>
        <div className="players-count">Найдено: {filtered.length}</div>
        <div className="players-list">{filtered.map((item, index) => <button key={item.id} className={selectedId === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><span className="player-rank">#{users.indexOf(item) + 1 || index + 1}</span><Avatar firstName={item.firstName} lastName={item.lastName} size="sm" /><div><strong>{item.username ? `@${item.username}` : `${item.firstName} ${item.lastName ?? ''}`}</strong><small>ID {item.telegramId} · {item._count?.results ?? 0} игр</small></div><b>{points(item.points)}<small> PTS</small></b></button>)}{!filtered.length && <Empty icon={<Search />} title="Игроки не найдены" text="Попробуйте другой запрос" />}</div>
      </aside>
      <section className="player-detail">
        {formError && !detail && !loading && <div className="form-error">{formError}</div>}
        {loading && !detail ? <Loading label="Открываем карточку…" /> : detail ? <>
          <header className="player-detail-head"><Avatar firstName={detail.firstName} lastName={detail.lastName} photoUrl={detail.photoUrl} size="lg" /><div><span>{detail.role === 'ADMIN' ? 'АДМИНИСТРАТОР' : 'ИГРОК'}</span><h2>{detail.firstName} {detail.lastName ?? ''}</h2><p>@{detail.username || 'player'} · Telegram ID {detail.telegramId}</p></div><strong>{points(detail.points)}<small> PTS</small></strong></header>
          <div className="player-detail-tabs"><button className={detailTab === 'balance' ? 'active' : ''} onClick={() => setDetailTab('balance')}><Coins />Баланс</button><button className={detailTab === 'history' ? 'active' : ''} onClick={() => setDetailTab('history')}><Medal />История</button><button className={detailTab === 'access' ? 'active' : ''} onClick={() => setDetailTab('access')}><KeyRound />Доступ</button></div>
          {detailTab === 'balance' && <form className="player-points-editor" onSubmit={changePoints}>
            <div className="point-mode"><button type="button" className={mode === 'award' ? 'active award' : ''} onClick={() => setMode('award')}>+ Начислить</button><button type="button" className={mode === 'deduct' ? 'active deduct' : ''} onClick={() => setMode('deduct')}>− Списать</button></div>
            <div className="form-row"><label>Количество PTS<input type="number" min="1" max="100000" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Причина<input list="player-point-reasons" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={160} required /><datalist id="player-point-reasons"><option value="Участие в турнире" /><option value="Призовое место" /><option value="Бонус клуба" /><option value="Корректировка результата" /><option value="Нарушение регламента" /></datalist></label></div>
            <div className={`balance-preview ${projected < 0 ? 'invalid' : ''}`}><span>Баланс после операции</span><strong>{points(projected)} PTS</strong></div>
            {formError && <div className="form-error">{formError}</div>}
            <button className={`button wide ${mode === 'award' ? 'primary' : 'deduct-button'}`} disabled={saving || !numericAmount || projected < 0}><Save size={17} />{saving ? 'Сохраняем…' : mode === 'award' ? 'Начислить очки' : 'Списать очки'}</button>
          </form>}
          {detailTab === 'history' && <div className="player-history-grid"><section><h3>Операции с очками</h3><div className="compact-audit">{detail.pointTransactions.map((entry) => <article key={entry.id}><span className={entry.amount > 0 ? 'award' : 'deduct'}>{entry.amount > 0 ? '+' : ''}{points(entry.amount)}</span><div><strong>{entry.reason}</strong><small>{tournamentDate(entry.createdAt).full} · {entry.createdBy.firstName}</small></div><b>{points(entry.balanceAfter)}</b></article>)}{!detail.pointTransactions.length && <Empty icon={<Coins />} title="Операций нет" text="История пока пуста" />}</div></section><section><h3>Последние турниры</h3><div className="player-games-list">{detail.results.map((result) => <article key={result.id}><span>#{result.place}</span><div><strong>{result.tournament.title}</strong><small>{tournamentDate(result.tournament.startsAt).full}</small></div><Status value={result.tournament.status} /></article>)}{!detail.results.length && <Empty icon={<Medal />} title="Игр пока нет" text="Результаты появятся после турнира" />}</div></section></div>}
          {detailTab === 'access' && <div className="player-access-panel">
            <div className="personal-invite"><div><h3>Вход из обычного браузера</h3><p>Создайте одноразовую ссылку лично для этого игрока.</p></div><button className="button primary" onClick={() => void createInvite()} disabled={saving}><KeyRound size={16} />Создать ссылку</button></div>
            {formError && <div className="form-error">{formError}</div>}
            {invite && <InviteResult invite={invite} onCopied={onDone} />}
            <h3>Сессии пользователя</h3><SessionList sessions={detail.browserSessions} onRevoke={revoke} />
          </div>}
        </> : <Empty icon={<UserRound />} title="Выберите игрока" text="Карточка откроется справа" />}
      </section>
    </div>
  </div>;
}

function TournamentsTab({ seasons, tournaments, users, intent, onDone }: { seasons: Season[]; tournaments: Tournament[]; users: AdminUser[]; intent: AdminIntent; onDone: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | Tournament['status']>('ALL');
  const [selectedId, setSelectedId] = useState(tournaments.find((item) => item.status === 'UPCOMING')?.id ?? tournaments[0]?.id ?? '');
  const [detail, setDetail] = useState<TournamentDetails | null>(null);
  const [view, setView] = useState<'details' | 'results'>('details');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const detailRequest = useRef(0);

  const loadDetail = useCallback(async (id: string, clear = false) => {
    if (!id) return setDetail(null);
    const request = ++detailRequest.current;
    if (clear) setDetail(null);
    setLoadingDetail(true);
    try {
      const next = await api<TournamentDetails>(`/admin/tournaments/${id}`);
      if (detailRequest.current === request) setDetail(next);
    } catch (cause) {
      if (detailRequest.current === request) setFormError(cause instanceof Error ? cause.message : 'Не удалось открыть турнир');
    } finally {
      if (detailRequest.current === request) setLoadingDetail(false);
    }
  }, []);
  useEffect(() => { setFormError(null); void loadDetail(selectedId, true); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (intent?.kind === 'newTournament') { setFormError(null); setCreateOpen(true); }
    if (intent?.kind === 'results') setView('results');
    if (intent?.kind === 'openTournament' && intent.targetId) { setSelectedId(intent.targetId); setView('details'); }
  }, [intent?.nonce, intent?.kind, intent?.targetId]);

  const filtered = tournaments.filter((item) => (filter === 'ALL' || item.status === filter) && `${item.title} ${item.location ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      const created = await post<Tournament>('/admin/tournaments', tournamentPayload(form));
      setCreateOpen(false); setSelectedId(created.id); onDone('Турнир создан');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось создать турнир'); }
    finally { setSaving(false); }
  }
  async function updateTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    setSaving(true); setFormError(null);
    try {
      const updated = await post<TournamentDetails>(`/admin/tournaments/${detail.id}`, tournamentPayload(new FormData(event.currentTarget)), 'PATCH');
      setDetail({ ...detail, ...updated }); onDone('Изменения турнира сохранены');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось сохранить турнир'); }
    finally { setSaving(false); }
  }
  async function removeTournament() {
    if (!detail || !window.confirm(`Удалить пустой турнир «${detail.title}»? Это действие нельзя отменить.`)) return;
    try {
      await post(`/admin/tournaments/${detail.id}`, undefined, 'DELETE');
      const next = tournaments.find((item) => item.id !== detail.id);
      setSelectedId(next?.id ?? ''); setDetail(null); onDone('Турнир удалён');
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось удалить турнир'); }
  }
  async function notify() {
    if (!detail) return;
    setSaving(true);
    try { const result = await post<{ sentCount: number; failedCount: number }>(`/admin/tournaments/${detail.id}/notify`); onDone(`Отправлено: ${result.sentCount}, ошибок: ${result.failedCount}`); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Не удалось отправить уведомление'); }
    finally { setSaving(false); }
  }

  return <div className="admin-view">
    <AdminHeading eyebrow="ИГРОВОЙ КАЛЕНДАРЬ" title="Турниры" text="Расписание, параметры и результаты в едином рабочем пространстве" actions={<button className="button primary" onClick={() => { setFormError(null); setCreateOpen(true); }}><Plus size={17} />Новый турнир</button>} />
    <div className="tournament-workspace">
      <aside className="tournament-panel">
        <div className="players-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или место" /></div>
        <div className="compact-filter"><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>Все</button><button className={filter === 'UPCOMING' ? 'active' : ''} onClick={() => setFilter('UPCOMING')}>Скоро</button><button className={filter === 'FINISHED' ? 'active' : ''} onClick={() => setFilter('FINISHED')}>Готово</button></div>
        <div className="tournament-list">{filtered.map((item) => <button key={item.id} className={selectedId === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><div className="mini-date"><strong>{tournamentDate(item.startsAt).day}</strong><span>{tournamentDate(item.startsAt).month}</span></div><div><strong>{item.title}</strong><small>{tournamentDate(item.startsAt).time} · {item.location || 'Без места'}</small></div><Status value={item.status} /></button>)}{!filtered.length && <Empty icon={<Search />} title="Турниры не найдены" text="Измените поиск или фильтр" />}</div>
      </aside>
      <section className="tournament-detail">{formError && !detail && !loadingDetail && <div className="form-error">{formError}</div>}{loadingDetail && !detail ? <Loading label="Открываем турнир…" /> : detail ? <>
        <header className="tournament-detail-head"><div><Status value={detail.status} /><h2>{detail.title}</h2><p>{tournamentDate(detail.startsAt).full} · {detail.location || 'Место не указано'}</p></div><div><button className="button secondary" disabled={saving || detail.status !== 'UPCOMING'} onClick={() => void notify()}><Bell size={16} />Уведомить</button><button className="icon-button delete-tournament" title="Удалить пустой турнир" onClick={() => void removeTournament()}><Trash2 size={16} /></button></div></header>
        <div className="player-detail-tabs tournament-tabs"><button className={view === 'details' ? 'active' : ''} onClick={() => setView('details')}><Edit3 />Информация</button><button className={view === 'results' ? 'active' : ''} onClick={() => setView('results')}><Medal />Результаты <span>{detail.results.length}</span></button></div>
        {view === 'details' && <form key={detail.id} className="admin-form tournament-edit-form" onSubmit={updateTournament}>
          <label>Название<input name="title" required minLength={2} defaultValue={detail.title} /></label>
          <div className="form-row"><label>Сезон<select name="seasonId" required defaultValue={detail.seasonId}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}</option>)}</select></label><label>Дата и время<input name="startsAt" type="datetime-local" required defaultValue={dateTimeInput(detail.startsAt)} /></label></div>
          <div className="form-row"><label>Место<input name="location" defaultValue={detail.location ?? ''} /></label><label>Статус<select name="status" defaultValue={detail.status}><option value="UPCOMING">Скоро</option><option value="ACTIVE">Идёт</option><option value="FINISHED">Завершён</option><option value="CANCELLED">Отменён</option></select></label></div>
          <div className="form-row"><label>Максимум игроков<input name="capacity" type="number" min="2" max="1000" defaultValue={detail.capacity} /></label><label>Заявлено участников<input name="participantCount" type="number" min="0" max="1000" defaultValue={detail.participantCount} /></label></div>
          <label>Описание<textarea name="description" rows={4} defaultValue={detail.description ?? ''} /></label>
          {formError && <div className="form-error">{formError}</div>}
          <button className="button primary wide" disabled={saving}><Save size={17} />{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button>
        </form>}
        {view === 'results' && <ResultsEditor details={detail} users={users} onSaved={async () => { await loadDetail(detail.id); onDone('Места игроков сохранены'); }} />}
      </> : <Empty icon={<CalendarDays />} title="Выберите турнир" text="Информация откроется справа" />}</section>
    </div>
    {createOpen && <Modal title="Новый турнир" onClose={() => { setCreateOpen(false); setFormError(null); }}><form className="admin-form" onSubmit={createTournament}>
      <label>Название<input name="title" required minLength={2} placeholder="Пятничный турнир" /></label>
      <div className="form-row"><label>Сезон<select name="seasonId" required defaultValue={seasons.find((season) => season.isActive)?.id}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}</option>)}</select></label><label>Дата и время<input name="startsAt" type="datetime-local" required /></label></div>
      <div className="form-row"><label>Место<input name="location" placeholder="Poker Club" /></label><label>Максимум игроков<input name="capacity" type="number" min="2" defaultValue="48" /></label></div>
      <input type="hidden" name="participantCount" value="0" /><input type="hidden" name="status" value="UPCOMING" />
      <label>Описание<textarea name="description" rows={3} placeholder="Краткое описание игры" /></label>
      {formError && <div className="form-error">{formError}</div>}
      <button className="button primary wide" disabled={saving}><Save size={17} />{saving ? 'Сохраняем…' : 'Создать турнир'}</button>
    </form></Modal>}
  </div>;
}

function ResultsEditor({ details, users, onSaved }: { details: TournamentDetails; users: AdminUser[]; onSaved: () => Promise<void> }) {
  const [entries, setEntries] = useState<AdminUser[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setEntries(details.results.map((result) => users.find((user) => user.id === result.userId)).filter((user): user is AdminUser => Boolean(user))); }, [details.id, details.results, users]);
  const available = useMemo(() => users.filter((user) => !entries.some((entry) => entry.id === user.id)), [users, entries]);
  function move(index: number, direction: -1 | 1) { const next = [...entries]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setEntries(next); }
  async function save() {
    setSaving(true); setError(null);
    try { await post(`/admin/tournaments/${details.id}/results`, { results: entries.map((user, index) => ({ userId: user.id, place: index + 1 })) }, 'PUT'); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить результаты'); }
    finally { setSaving(false); }
  }
  return <div className="integrated-results">
    <div className="results-note"><CircleAlert size={17} /><span>Места и очки разделены: сохранение результатов не изменяет баланс игроков.</span></div>
    <div className="add-player"><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Выберите игрока</option>{available.map((user) => <option value={user.id} key={user.id}>{user.username ? `@${user.username}` : `${user.firstName} ${user.lastName ?? ''}`}</option>)}</select><button className="button secondary" disabled={!playerId} onClick={() => { const user = users.find((item) => item.id === playerId); if (user) setEntries([...entries, user]); setPlayerId(''); }}><Plus size={17} />Добавить</button></div>
    <div className="result-list">{entries.map((user, index) => <div className="result-row" key={user.id}><span className={`result-place ${index < 3 ? 'podium' : ''}`}>{index + 1}</span><Avatar firstName={user.firstName} lastName={user.lastName} size="sm" /><div><strong>{user.username ? `@${user.username}` : `${user.firstName} ${user.lastName ?? ''}`}</strong><small>Очки начисляются отдельно</small></div><div className="row-actions"><button onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp /></button><button onClick={() => move(index, 1)} disabled={index === entries.length - 1}><ArrowDown /></button><button className="danger" onClick={() => setEntries(entries.filter((entry) => entry.id !== user.id))}><X /></button></div></div>)}{!entries.length && <Empty icon={<Medal />} title="Добавьте участников" text="Первый в списке займёт первое место" />}</div>
    {error && <div className="form-error">{error}</div>}
    <button className="button primary save-results" disabled={entries.length < 2 || saving} onClick={() => void save()}><Save size={17} />{saving ? 'Сохраняем…' : 'Сохранить места'}</button>
  </div>;
}

function AccessTab({ users, onDone }: { users: AdminUser[]; onDone: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? '');
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [invite, setInvite] = useState<BrowserInviteResult | null>(null);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSessions = useCallback(async () => { try { setSessions(await api<BrowserSession[]>('/admin/browser-access/sessions')); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить сессии'); } }, []);
  useEffect(() => { void loadSessions(); }, [loadSessions]);
  const visible = sessions.filter((session) => {
    const active = isSessionActive(session);
    const name = `${session.user?.firstName ?? ''} ${session.user?.lastName ?? ''} ${session.user?.username ?? ''} ${session.user?.telegramId ?? ''}`.toLowerCase();
    return (showAll || active) && name.includes(query.toLowerCase());
  });
  async function createInvite() {
    if (!selectedId) return;
    setSaving(true); setError(null); setInvite(null);
    try { const result = await post<BrowserInviteResult>('/admin/browser-access/invites', { userId: selectedId }); setInvite(result); onDone('Одноразовая ссылка создана на 30 минут'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось создать ссылку'); }
    finally { setSaving(false); }
  }
  async function revoke(id: string) {
    setSaving(true); setError(null);
    try { await post(`/admin/browser-access/sessions/${id}/revoke`); await loadSessions(); onDone('Браузерный доступ отозван'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отозвать доступ'); }
    finally { setSaving(false); }
  }
  return <div className="admin-view">
    <AdminHeading eyebrow="БЕЗОПАСНОСТЬ" title="Доступ из браузера" text="Адресные приглашения и мгновенный отзыв активных сессий" />
    <div className="access-overview-grid">
      <section className="browser-invite-card"><div className="access-card-head"><span><KeyRound /></span><div><h2>Новое приглашение</h2><p>30 минут · одно использование</p></div></div><label>Пользователь<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setInvite(null); }}>{users.map((user) => <option value={user.id} key={user.id}>{user.username ? `@${user.username}` : `${user.firstName} ${user.lastName ?? ''}`} · ID {user.telegramId}</option>)}</select></label><button className="button primary wide" disabled={!selectedId || saving} onClick={() => void createInvite()}><KeyRound size={16} />{saving ? 'Создаём…' : 'Создать ссылку'}</button>{error && <div className="form-error">{error}</div>}{invite && <InviteResult invite={invite} onCopied={onDone} />}<p className="access-warning">Передавайте ссылку лично: первый открывший получит сессию выбранного пользователя.</p></section>
      <section className="security-summary"><span><MonitorSmartphone /></span><strong>{sessions.filter(isSessionActive).length}</strong><p>активных браузерных сессий</p><small>Каждая проверяется сервером при любом защищённом запросе.</small></section>
    </div>
    <section className="all-sessions-section"><div className="admin-section-title"><div><h2>Сессии пользователей</h2><p>Поиск и централизованный отзыв доступа</p></div><label className="show-all-toggle"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />Показывать завершённые</label></div><div className="players-search sessions-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, username или Telegram ID" /></div><div className="global-session-list">{visible.map((session) => <article key={session.id} className={isSessionActive(session) ? 'active' : ''}><Avatar firstName={session.user?.firstName ?? '?'} lastName={session.user?.lastName ?? null} size="sm" /><div><strong>{session.user?.username ? `@${session.user.username}` : `${session.user?.firstName ?? ''} ${session.user?.lastName ?? ''}`}</strong><small>ID {session.user?.telegramId} · создана {tournamentDate(session.createdAt).full}</small></div><span>{isSessionActive(session) ? `До ${tournamentDate(session.expiresAt).full}` : session.revokedAt ? 'Отозвана' : 'Истекла'}</span>{isSessionActive(session) && <button className="button revoke-button" onClick={() => void revoke(session.id)}><ShieldOff size={15} />Отозвать</button>}</article>)}{!visible.length && <Empty icon={<MonitorSmartphone />} title="Сессий не найдено" text="Измените фильтр или создайте приглашение" />}</div></section>
  </div>;
}

function SettingsTab({ seasons, onDone }: { seasons: Season[]; onDone: (message: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function openNew() { setEditing(null); setError(null); setModalOpen(true); }
  function openEdit(season: Season) { setEditing(season); setError(null); setModalOpen(true); }
  async function saveSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const isActive = form.get('isActive') === 'on';
    if (isActive && !editing?.isActive && !window.confirm('Активация нового сезона сбросит текущие балансы игроков до 0. История операций сохранится. Продолжить?')) return;
    if (!isActive && editing?.isActive && !window.confirm('Отключить активный сезон? До активации другого сезона начислять и списывать очки будет нельзя.')) return;
    setSaving(true); setError(null);
    const payload = { name: form.get('name'), number: Number(form.get('number')), startsAt: new Date(String(form.get('startsAt'))).toISOString(), endsAt: new Date(String(form.get('endsAt'))).toISOString(), isActive };
    try { await post(editing ? `/admin/seasons/${editing.id}` : '/admin/seasons', payload, editing ? 'PATCH' : 'POST'); setModalOpen(false); onDone(editing ? 'Сезон обновлён' : 'Сезон создан'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить сезон'); }
    finally { setSaving(false); }
  }
  async function activate(season: Season) {
    if (season.isActive || !window.confirm(`Активировать «${season.name}»? Текущие балансы игроков будут сброшены до 0, история сохранится.`)) return;
    try { await post(`/admin/seasons/${season.id}`, { isActive: true }, 'PATCH'); onDone(`${season.name} активирован`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось активировать сезон'); }
  }
  return <div className="admin-view">
    <AdminHeading eyebrow="ПАРАМЕТРЫ КЛУБА" title="Настройки" text="Сезоны и важные параметры работы приложения" actions={<button className="button primary" onClick={openNew}><Plus size={17} />Новый сезон</button>} />
    {error && <div className="form-error settings-error">{error}</div>}
    <section><div className="admin-section-title"><div><h2>Сезоны</h2><p>Периоды рейтинга и текущего баланса</p></div></div><div className="season-management-grid">{seasons.map((season) => <article className={season.isActive ? 'active' : ''} key={season.id}><div className="season-card-top"><span>{season.isActive ? 'АКТИВНЫЙ' : 'НЕАКТИВНЫЙ'}</span><button className="icon-button" onClick={() => openEdit(season)} title="Редактировать"><Edit3 size={15} /></button></div><h2>{season.name}</h2><p>{dateOnlyLabel(season.startsAt)} — {dateOnlyLabel(season.endsAt)}</p><div><strong>{season._count?.tournaments ?? 0}<small> турниров</small></strong>{!season.isActive && <button className="button secondary" onClick={() => void activate(season)}>Активировать</button>}</div></article>)}</div></section>
    <section className="owner-security-card"><span><ShieldCheck /></span><div><h3>Администраторы защищены через Render</h3><p>Главные Telegram ID задаются в <code>ADMIN_TELEGRAM_IDS</code>. Сервер проверяет whitelist при каждом запросе к админке и исправляет роль пользователя при входе.</p></div></section>
    {modalOpen && <Modal title={editing ? 'Редактировать сезон' : 'Новый сезон'} onClose={() => setModalOpen(false)}><form className="admin-form" onSubmit={saveSeason}><div className="form-row"><label>Название<input name="name" required minLength={2} defaultValue={editing?.name ?? ''} placeholder="Сезон 05" /></label><label>Номер<input type="number" name="number" required min="1" defaultValue={editing?.number ?? Math.max(0, ...seasons.map((season) => season.number)) + 1} /></label></div><div className="form-row"><label>Начало<input type="date" name="startsAt" required defaultValue={editing ? dateInput(editing.startsAt) : ''} /></label><label>Окончание<input type="date" name="endsAt" required defaultValue={editing ? dateInput(editing.endsAt) : ''} /></label></div><label className="checkbox"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? false} />Активный сезон</label>{!editing?.isActive && <div className="destructive-note"><CircleAlert size={16} /><span>Активация сбросит текущие балансы до 0. Журнал очков и прошлые сезоны сохранятся.</span></div>}{error && <div className="form-error">{error}</div>}<button className="button primary wide" disabled={saving}><Save size={17} />{saving ? 'Сохраняем…' : 'Сохранить сезон'}</button></form></Modal>}
  </div>;
}

function MoreTab({ onNavigate }: { onNavigate: (section: AdminSection) => void }) {
  return <div className="admin-view more-view"><AdminHeading eyebrow="УПРАВЛЕНИЕ" title="Ещё" text="Безопасность и параметры клуба" /><div className="more-menu-grid"><button onClick={() => onNavigate('access')}><span><KeyRound /></span><div><strong>Доступ из браузера</strong><small>Приглашения и активные сессии</small></div><ChevronRight /></button><button onClick={() => onNavigate('settings')}><span><Settings /></span><div><strong>Настройки</strong><small>Сезоны и параметры клуба</small></div><ChevronRight /></button><Link to="/"><span><LogOut /></span><div><strong>Вернуться в приложение</strong><small>Закрыть панель управления</small></div><ChevronRight /></Link></div></div>;
}

function InviteResult({ invite, onCopied }: { invite: BrowserInviteResult; onCopied: (message: string) => void }) {
  const [copyError, setCopyError] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(invite.url); setCopyError(false); onCopied('Ссылка скопирована'); } catch { setCopyError(true); } }
  return <div className="invite-result"><div><strong>Ссылка для {invite.user.firstName}</strong><small>Действует до {tournamentDate(invite.expiresAt).full} и сгорит после входа</small></div><textarea readOnly value={invite.url} rows={4} onFocus={(event) => event.currentTarget.select()} /><button className="button secondary wide" onClick={() => void copy()}><Copy size={16} />Скопировать ссылку</button>{copyError && <div className="form-error">Выделите ссылку и скопируйте её вручную.</div>}</div>;
}

function SessionList({ sessions, onRevoke }: { sessions: BrowserSession[]; onRevoke: (id: string) => Promise<void> }) {
  return <div className="personal-session-list">{sessions.map((session) => <article key={session.id} className={isSessionActive(session) ? 'active' : ''}><span><MonitorSmartphone /></span><div><strong>{isSessionActive(session) ? 'Активная сессия' : session.revokedAt ? 'Сессия отозвана' : 'Сессия истекла'}</strong><small>Создана {tournamentDate(session.createdAt).full} · до {tournamentDate(session.expiresAt).full}</small></div>{isSessionActive(session) && <button className="icon-button revoke-session" onClick={() => void onRevoke(session.id)} title="Отозвать" aria-label="Отозвать браузерную сессию"><ShieldOff size={16} /></button>}</article>)}{!sessions.length && <Empty icon={<MonitorSmartphone />} title="Сессий пока нет" text="Создайте одноразовую ссылку для входа" />}</div>;
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-result">{icon}<strong>{title}</strong><p>{text}</p></div>;
}

function Status({ value }: { value: Tournament['status'] }) {
  const text = { UPCOMING: 'Скоро', ACTIVE: 'Идёт', FINISHED: 'Завершён', CANCELLED: 'Отменён' }[value];
  return <span className={`status status-${value.toLowerCase()}`}>{text}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X /></button></div>{children}</div></div>;
}

function tournamentPayload(form: FormData) {
  return {
    seasonId: form.get('seasonId'),
    title: form.get('title'),
    description: form.get('description') || null,
    startsAt: new Date(String(form.get('startsAt'))).toISOString(),
    location: form.get('location') || null,
    capacity: Number(form.get('capacity')),
    participantCount: Number(form.get('participantCount')),
    status: form.get('status')
  };
}
function dateTimeInput(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function dateInput(value: string) { return new Date(value).toISOString().slice(0, 10); }
function dateOnlyLabel(value: string) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function isSessionActive(session: BrowserSession) { return !session.revokedAt && new Date(session.expiresAt) > new Date(); }
