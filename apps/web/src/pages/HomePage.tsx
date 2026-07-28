import { Armchair, Check, ChevronRight, ListOrdered, UserCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { DailyEngagement } from '../components/DailyEngagement';
import { ErrorState, Loading } from '../components/Loading';
import { api, apiAssetUrl, post } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { HomeData } from '../types';

export function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registrationMessage, setRegistrationMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<HomeData>('/home'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить главную');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const target = Math.ceil((data.user.points + 1) / 500) * 500;
  const progress = Math.min(100, Math.max(8, data.user.points / target * 100));
  const next = data.nextTournament ? tournamentDate(data.nextTournament.startsAt) : null;
  const activeRegistration = data.nextTournament?.registration && data.nextTournament.registration.status !== 'CANCELLED'
    ? data.nextTournament.registration
    : null;
  const registrationAvailable = Boolean(data.nextTournament
    && !data.nextTournament.registrationClosed
    && (!data.nextTournament.registrationDeadline || new Date(data.nextTournament.registrationDeadline) > new Date()));

  async function registerForNextTournament() {
    if (!data?.nextTournament || activeRegistration || !registrationAvailable || savingRegistration) return;
    setSavingRegistration(true);
    setRegistrationMessage(null);
    try {
      const result = await post<{ registration: { status: string } }>(`/tournaments/${data.nextTournament.id}/registration`);
      setRegistrationMessage({
        kind: 'success',
        text: result.registration.status === 'WAITLISTED' ? 'Вы добавлены в лист ожидания' : 'Место на турнире подтверждено'
      });
      await load();
    } catch (cause) {
      setRegistrationMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Не удалось записаться на турнир' });
    } finally {
      setSavingRegistration(false);
    }
  }

  const resultsBlock = <section className="home-results-block">
    <div className="section-title"><h2>Ваши результаты</h2></div>
    <div className="stats-grid">
      <div className="stat-card card"><span>Очки за неделю</span><strong className={data.weeklyPoints >= 0 ? 'blue' : 'negative'}>{data.weeklyPoints > 0 ? '+' : ''}{points(data.weeklyPoints)}</strong></div>
      <div className="stat-card card"><span>В финале</span><strong>{data.finalTables}/{data.gamesPlayed}</strong></div>
    </div>
  </section>;

  return <div className="page home-page">
    <p className="season-line">{data.season?.name ?? 'Новый сезон'} · Неделя {data.week}</p>

    <section className={`rating-hero ${data.branding?.hasRatingBanner ? 'rating-hero-custom' : ''}`} style={data.branding?.hasRatingBanner ? { backgroundImage: `linear-gradient(90deg, rgba(var(--accent-rgb), .94), rgba(var(--accent-rgb), .58)), url(${apiAssetUrl(`/branding/rating-banner?v=${encodeURIComponent(data.branding.updatedAt ?? '')}`)})` } : undefined}>
      <div className="rating-watermark">♠</div>
      <div className="rating-top">
        <div><span>Ваш рейтинг</span><div className="rank-number">#{data.user.rank}<small>из {data.user.totalUsers}</small></div></div>
        <div className="league-badge">Серебро II</div>
      </div>
      <div className="rating-points"><strong>{points(data.user.points)} PTS</strong><span>{points(target)} PTS</span></div>
      <div className="progress"><i style={{ width: `${progress}%` }} /></div>
    </section>

    <div className="section-title"><h2>Ближайший турнир</h2><Link to="/games">Все турниры</Link></div>
    {data.nextTournament && next ? (
      <article className="next-game card">
        <Link to="/games" className="next-game-main">
          <div className="date-tile"><strong>{next.day}</strong><span>{next.month}</span></div>
          <div className="game-copy"><h3>{data.nextTournament.title}</h3><p>{next.time} · {data.nextTournament.participantCount} участников</p></div>
          <span className="circle-action"><ChevronRight size={23} /></span>
        </Link>
        <button
          className={`home-registration-button ${activeRegistration ? 'registered' : ''}`}
          disabled={savingRegistration || Boolean(activeRegistration) || !registrationAvailable}
          onClick={() => void registerForNextTournament()}
        >
          {activeRegistration?.status === 'WAITLISTED'
            ? <><ListOrdered />Вы в листе ожидания</>
            : activeRegistration
              ? <><Check />Вы участвуете</>
              : !registrationAvailable
                ? <><X />Регистрация закрыта</>
                : <><UserCheck />{savingRegistration ? 'Записываем…' : data.nextTournament.participantCount >= data.nextTournament.capacity ? 'Встать в очередь' : 'Зарегистрироваться'}</>}
        </button>
      </article>
    ) : <div className="empty-card card">Ближайшие игры скоро появятся</div>}
    {registrationMessage && <div className={`home-registration-message ${registrationMessage.kind}`}>{registrationMessage.kind === 'success' ? <Check /> : <X />}{registrationMessage.text}</div>}
    {data.nextSeating && <section className="my-seat-card card"><span><Armchair /></span><div><small>ВАША РАССАДКА · {data.nextSeating.tournament.title}</small><strong>Стол №{data.nextSeating.table.number} <i>·</i> Место №{data.nextSeating.seatNumber}</strong></div><Link to="/games"><ChevronRight /></Link></section>}

    <DailyEngagement between={resultsBlock} />

    <div className="section-title"><h2>Лидеры сезона</h2><Link to="/rating">Рейтинг</Link></div>
    <div className="leader-list">
      {data.leaders.map((leader, index) => (
        <div className="leader-row" key={leader.id}>
          <span className="place">{String(index + 1).padStart(2, '0')}</span>
          <Avatar firstName={leader.firstName} lastName={leader.lastName} photoUrl={leader.photoUrl} size="sm" />
          <strong>{leader.nickname || leader.username || `${leader.firstName} ${leader.lastName ?? ''}`}</strong>
          <b>{points(leader.points)}</b>
        </div>
      ))}
    </div>
    <Link to="/rating" className="mobile-more">Полный рейтинг <ChevronRight size={17} /></Link>
  </div>;
}
