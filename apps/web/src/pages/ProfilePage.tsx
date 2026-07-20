import {
  Award, CalendarCheck, CheckCircle2, ChevronRight, Coins, Copy, Crown, Flame, Gift, History,
  Medal, Phone, Send, ShieldCheck, Spade, Trophy, UserPlus, Users, Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ErrorState, Loading } from '../components/Loading';
import { api } from '../lib/api';
import { points, tournamentDate } from '../lib/format';
import type { ClubXpTransaction, PointTransaction, ReferralInfo, Tournament, User } from '../types';

type ProfileTab = 'overview' | 'history' | 'rewards' | 'friends';
type Profile = User & {
  rank: number;
  createdAt: string;
  referralCode: string | null;
  results: { id: string; place: number; points: number; isFinalTable: boolean; tournament: Tournament }[];
  pointTransactions: PointTransaction[];
  clubXpTransactions: ClubXpTransaction[];
  achievements: { id: string; unlockedAt: string; xpAwarded: number; achievement: { id: string; key: string; title: string; description: string; icon: string; xpReward: number } }[];
  registrations: { id: string; status: string; tournament: Tournament }[];
  referralsSent: ReferralInfo['referrals'];
  hasPhoneNumber: boolean;
  phoneNumberMasked: string | null;
  phoneSharedAt: string | null;
  stats: { gamesPlayed: number; wins: number; finalTables: number; finalTableRate: number; bestPlace: number | null; currentStreak: number; bestStreak: number };
};

const xpSourceLabel: Record<ClubXpTransaction['source'], string> = {
  DAILY_HAND: 'Раздача дня', REFERRAL_INVITER: 'Приглашение друга', REFERRAL_INVITEE: 'Первое посещение',
  ACHIEVEMENT: 'Достижение', ADMIN_ADJUSTMENT: 'Администратор', REVERSAL: 'Отмена операции'
};

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  useEffect(() => { api<Profile>('/profile').then((value) => setProfile(normalizeProfile(value))).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    if (tab === 'friends' && !referral) api<ReferralInfo>('/loyalty/referral').then(setReferral).catch((e: Error) => setShareMessage(e.message));
  }, [tab, referral]);
  if (error) return <ErrorState message={error} />;
  if (!profile) return <Loading />;

  function requestPhone() {
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.requestContact) { setPhoneMessage('Передать номер можно только внутри Telegram Mini App.'); return; }
    setPhoneMessage(null);
    telegram.requestContact((shared) => {
      if (!shared) { setPhoneMessage('Номер не был передан. Вы сможете сделать это позже.'); return; }
      setPhoneMessage('Контакт отправлен боту. Telegram пришлёт подтверждение после сохранения.');
      window.setTimeout(() => {
        void api<Profile>('/profile').then((next) => { const normalized = normalizeProfile(next); setProfile(normalized); if (normalized.hasPhoneNumber) setPhoneMessage('Номер сохранён и виден только администраторам клуба.'); });
      }, 1800);
    });
  }

  async function shareReferral() {
    if (!referral) return;
    const url = referral.shareLink ?? referral.fallbackMiniAppUrl;
    const text = `Присоединяйся к Poker Club. После первого посещения мы оба получим Club XP: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Poker Club', text, url });
      else { await navigator.clipboard.writeText(text); setShareMessage('Приглашение скопировано'); }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(text); setShareMessage('Приглашение скопировано'); }
      catch { setShareMessage('Не удалось открыть отправку. Скопируйте ссылку вручную.'); }
    }
  }

  return <div className="page profile-page">
    <section className="profile-hero">
      <Avatar firstName={profile.firstName} lastName={profile.lastName} photoUrl={profile.photoUrl} size="lg" />
      <h1>{profile.firstName} {profile.lastName}</h1><p>@{profile.username || 'player'}</p>
      {profile.role === 'ADMIN' && <span className="admin-pill"><ShieldCheck size={14} /> Администратор</span>}
    </section>
    <div className="profile-stats">
      <div><Trophy size={20} /><strong>#{profile.rank}</strong><span>в рейтинге</span></div>
      <div><Spade size={20} /><strong>{points(profile.points)}</strong><span>Rating PTS</span></div>
      <div><Coins size={20} /><strong>{points(profile.clubXp)}</strong><span>Club XP</span></div>
    </div>
    <nav className="profile-tabs">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Medal />Обзор</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History />История</button>
      <button className={tab === 'rewards' ? 'active' : ''} onClick={() => setTab('rewards')}><Gift />Награды</button>
      <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}><Users />Друзья</button>
    </nav>

    {tab === 'overview' && <>
      <div className="profile-metrics">
        <article><strong>{profile.stats.gamesPlayed}</strong><span>игр</span></article>
        <article><strong>{profile.stats.wins}</strong><span>побед</span></article>
        <article><strong>{profile.stats.finalTableRate}%</strong><span>финалов</span></article>
        <article><strong>{profile.stats.bestPlace ? `#${profile.stats.bestPlace}` : '—'}</strong><span>лучшее место</span></article>
      </div>
      <section className="streak-card card"><span><Flame /></span><div><small>ТЕКУЩАЯ СЕРИЯ</small><strong>{profile.stats.currentStreak} посещения</strong><p>Личный рекорд: {profile.stats.bestStreak}</p></div></section>
      {profile.registrations.length > 0 && <><div className="section-title"><h2>Предстоящие игры</h2><Link to="/games">Все игры</Link></div><div className="upcoming-profile-list card">{profile.registrations.map((registration) => <Link to="/games" key={registration.id}><CalendarCheck /><div><strong>{registration.tournament.title}</strong><span>{tournamentDate(registration.tournament.startsAt).full}</span></div><ChevronRight /></Link>)}</div></>}
      <div className="telegram-id card"><span>Ваш Telegram ID</span><code>{profile.telegramId}</code></div>
      <section className={`phone-share-card card ${profile.hasPhoneNumber ? 'saved' : ''}`}><span>{profile.hasPhoneNumber ? <CheckCircle2 /> : <Phone />}</span><div><strong>{profile.hasPhoneNumber ? 'Номер передан' : 'Оставить номер организаторам'}</strong><small>{profile.hasPhoneNumber ? `${profile.phoneNumberMasked} · доступен только администраторам` : 'Добровольно — для связи по турнирам и подаркам'}</small></div>{!profile.hasPhoneNumber && <button onClick={requestPhone}>Поделиться</button>}</section>
      {phoneMessage && <div className="phone-share-message">{phoneMessage}</div>}
      {profile.role === 'ADMIN' && <Link className="admin-entry card" to="/admin"><span><ShieldCheck /><span><strong>Управление клубом</strong><small>Турниры, игроки и программа лояльности</small></span></span><ChevronRight /></Link>}
    </>}

    {tab === 'history' && <>
      <div className="section-title"><h2>История Rating PTS</h2></div>
      <div className="points-history card">{profile.pointTransactions.map((entry) => <div className="point-history-row" key={entry.id}><span className={entry.amount > 0 ? 'point-plus' : 'point-minus'}>{entry.amount > 0 ? '+' : ''}{points(entry.amount)}</span><div><strong>{entry.reason}</strong><span>{tournamentDate(entry.createdAt).full} · {entry.createdBy.firstName}</span></div><small>{points(entry.balanceAfter)} PTS</small></div>)}{!profile.pointTransactions.length && <div className="empty-inline">Начислений в этом сезоне пока нет</div>}</div>
      <div className="section-title"><h2>Игры</h2></div>
      <div className="history-list card">{profile.results.map((result) => <div className="history-row" key={result.id}><span className="history-icon"><CalendarCheck size={19} /></span><div><strong>{result.tournament.title}</strong><span>{tournamentDate(result.tournament.startsAt).full}{result.isFinalTable ? ' · финальный стол' : ''}</span></div><div><strong>#{result.place}</strong><span>место</span></div></div>)}{!profile.results.length && <div className="empty-inline">История игр пока пуста</div>}</div>
    </>}

    {tab === 'rewards' && <>
      <section className="xp-balance-card"><span><Coins /></span><div><small>БОНУСНЫЙ БАЛАНС</small><strong>{points(profile.clubXp)} Club XP</strong><p>Не влияет на турнирный рейтинг</p></div></section>
      <div className="section-title"><h2>Достижения</h2><span>{profile.achievements.length}</span></div>
      <div className="achievement-grid">{profile.achievements.map((entry) => <article key={entry.id}><span>{entry.achievement.icon === 'crown' ? <Crown /> : entry.achievement.icon === 'flame' ? <Flame /> : entry.achievement.icon === 'zap' ? <Zap /> : <Award />}</span><div><strong>{entry.achievement.title}</strong><p>{entry.achievement.description}</p><small>+{entry.xpAwarded} XP · {tournamentDate(entry.unlockedAt).full}</small></div></article>)}{!profile.achievements.length && <div className="empty-inline card">Первое достижение появится после посещения турнира</div>}</div>
      <div className="section-title"><h2>История Club XP</h2></div>
      <div className="xp-history card">{profile.clubXpTransactions.map((entry) => <div key={entry.id}><span className={entry.amount > 0 ? 'positive' : 'negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</span><div><strong>{entry.reason}</strong><small>{xpSourceLabel[entry.source]} · {tournamentDate(entry.createdAt).full}</small></div><em>{entry.balanceAfter} XP</em></div>)}{!profile.clubXpTransactions.length && <div className="empty-inline">Бонусных операций пока нет</div>}</div>
    </>}

    {tab === 'friends' && <>
      <section className="referral-hero"><span><UserPlus /></span><h2>Приглашайте друзей</h2><p>Награда начислится только после первого подтверждённого посещения друга.</p>{referral ? <><div><small>ВАШ КОД</small><strong>{referral.referralCode}</strong><button onClick={() => void navigator.clipboard.writeText(referral.referralCode)} aria-label="Скопировать код"><Copy /></button></div><button className="referral-share" onClick={() => void shareReferral()}><Send />Поделиться приглашением</button><small>Вы получите +{referral.rewardXp} XP, друг — +{referral.inviteeRewardXp} XP</small></> : <span className="mini-loader">Готовим ссылку…</span>}</section>
      {shareMessage && <div className="phone-share-message">{shareMessage}</div>}
      <div className="section-title"><h2>Приглашённые</h2><span>{referral?.referrals.length ?? profile.referralsSent.length}</span></div>
      <div className="referral-list card">{(referral?.referrals ?? profile.referralsSent).map((item) => <article key={item.id}><Avatar firstName={item.invitedUser.firstName} lastName={item.invitedUser.lastName} photoUrl={item.invitedUser.photoUrl} size="sm" /><div><strong>{item.invitedUser.username ? `@${item.invitedUser.username}` : `${item.invitedUser.firstName} ${item.invitedUser.lastName ?? ''}`}</strong><small>{item.status === 'REWARDED' ? `Посещение подтверждено · +${item.inviterXp} XP` : item.status === 'REJECTED' ? 'Приглашение отклонено' : 'Ожидаем первое посещение'}</small></div><span className={`referral-status ${item.status.toLowerCase()}`}>{item.status === 'REWARDED' ? <CheckCircle2 /> : item.status === 'PENDING' ? '…' : '×'}</span></article>)}{(referral?.referrals ?? profile.referralsSent).length === 0 && <div className="empty-inline">Приглашённых игроков пока нет</div>}</div>
    </>}
  </div>;
}

function normalizeProfile(value: Profile): Profile {
  const results = value.results ?? [];
  const wins = results.filter((item) => item.place === 1).length;
  const finalTables = results.filter((item) => item.isFinalTable).length;
  return {
    ...value,
    clubXp: Number.isFinite(value.clubXp) ? value.clubXp : 0,
    clubXpTransactions: value.clubXpTransactions ?? [],
    achievements: value.achievements ?? [],
    registrations: value.registrations ?? [],
    referralsSent: value.referralsSent ?? [],
    stats: value.stats || {
      gamesPlayed: results.length,
      wins,
      finalTables,
      finalTableRate: results.length ? Math.round(finalTables / results.length * 100) : 0,
      bestPlace: results.length ? Math.min(...results.map((item) => item.place)) : null,
      currentStreak: 0,
      bestStreak: 0
    }
  };
}
