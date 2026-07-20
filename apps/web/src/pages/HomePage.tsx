import { Armchair, ArrowRight, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { DailyEngagement } from '../components/DailyEngagement';
import { ErrorState, Loading } from '../components/Loading';
import { api, apiAssetUrl } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { HomeData } from '../types';

export function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<HomeData>('/home').then(setData).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const target = Math.ceil((data.user.points + 1) / 500) * 500;
  const progress = Math.min(100, Math.max(8, data.user.points / target * 100));
  const next = data.nextTournament ? tournamentDate(data.nextTournament.startsAt) : null;

  return <div className="page home-page">
    <p className="season-line">{data.season?.name ?? 'Новый сезон'} · Неделя {data.week}</p>

    <section className={`rating-hero ${data.branding?.hasRatingBanner ? 'rating-hero-custom' : ''}`} style={data.branding?.hasRatingBanner ? { backgroundImage: `linear-gradient(90deg, rgba(5, 37, 88, .94), rgba(7, 61, 145, .58)), url(${apiAssetUrl(`/branding/rating-banner?v=${encodeURIComponent(data.branding.updatedAt ?? '')}`)})` } : undefined}>
      <div className="rating-watermark">♠</div>
      <div className="rating-top">
        <div><span>Ваш рейтинг</span><div className="rank-number">#{data.user.rank}<small>из {data.user.totalUsers}</small></div></div>
        <div className="league-badge">Серебро II</div>
      </div>
      <div className="rating-points"><strong>{points(data.user.points)} PTS</strong><span>{points(target)} PTS</span></div>
      <div className="progress"><i style={{ width: `${progress}%` }} /></div>
    </section>

    {data.nextSeating && <section className="my-seat-card card"><span><Armchair /></span><div><small>ВАША РАССАДКА · {data.nextSeating.tournament.title}</small><strong>Стол №{data.nextSeating.table.number} <i>·</i> Место №{data.nextSeating.seatNumber}</strong></div><Link to="/games"><ChevronRight /></Link></section>}

    <DailyEngagement />

    <div className="section-title"><h2>Следующая игра</h2><Link to="/games">Все игры</Link></div>
    {data.nextTournament && next ? (
      <Link to="/games" className="next-game card">
        <div className="date-tile"><strong>{next.day}</strong><span>{next.month}</span></div>
        <div className="game-copy"><h3>{data.nextTournament.title}</h3><p>{next.time} · {data.nextTournament.participantCount} участников</p></div>
        <span className="circle-action"><ArrowRight size={23} /></span>
      </Link>
    ) : <div className="empty-card card">Ближайшие игры скоро появятся</div>}

    <div className="section-title"><h2>Ваши результаты</h2></div>
    <div className="stats-grid">
      <div className="stat-card card"><span>Очки за неделю</span><strong className={data.weeklyPoints >= 0 ? 'blue' : 'negative'}>{data.weeklyPoints > 0 ? '+' : ''}{points(data.weeklyPoints)}</strong></div>
      <div className="stat-card card"><span>В финале</span><strong>{data.finalTables}/{data.gamesPlayed}</strong></div>
    </div>

    <div className="section-title"><h2>Лидеры сезона</h2><Link to="/rating">Рейтинг</Link></div>
    <div className="leader-list">
      {data.leaders.map((leader, index) => (
        <div className="leader-row" key={leader.id}>
          <span className="place">{String(index + 1).padStart(2, '0')}</span>
          <Avatar firstName={leader.firstName} lastName={leader.lastName} photoUrl={leader.photoUrl} size="sm" />
          <strong>{leader.username || `${leader.firstName} ${leader.lastName ?? ''}`}</strong>
          <b>{points(leader.points)}</b>
        </div>
      ))}
    </div>
    <Link to="/rating" className="mobile-more">Полный рейтинг <ChevronRight size={17} /></Link>
  </div>;
}
