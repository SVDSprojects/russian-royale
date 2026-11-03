import { useEffect, useRef, useState } from 'react';
import { Gift, Sparkles, Crown, Fingerprint, ArrowRight } from 'lucide-react';
import { api, useAuth } from '../api';
import { cases, gifts, profileEmojis, premiumPrice } from '../../shared/collection';
import { Dialog, ErrorNotice, Loading, PageHeader, go, json, message, useResource } from './common';
import { GiftArt, ProfileShowcase, type Appearance, type OwnedItem } from './Identity';
import { fighterGifts } from '../../shared/fighter-gifts';
type Shop = {
  balance: { earned: number; spent: number; available: number };
  inventory: OwnedItem[];
  appearance: Appearance;
};
export function CollectionPage() {
  const auth = useAuth(),
    resource = useResource<Shop>('/collection', true);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [catalogModel, setCatalogModel] = useState('khabib');
  const [reward, setReward] = useState<any>(null),
    [emoji, setEmoji] = useState(''),
    [featured, setFeatured] = useState<string[]>([]),
    [recipient, setRecipient] = useState('');
  const busyRef = useRef(false),
    pending = useRef<Record<string, string>>({});
  const a = resource.data?.appearance;
  useEffect(() => {
    if (a) {
      setEmoji(a.emoji);
      setFeatured(a.featured.map((i) => i.id));
    }
  }, [a?.emoji, JSON.stringify(a?.featured.map((i) => i.id))]);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await resource.reload();
      window.dispatchEvent(new Event('rr-live'));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const purchase = (product: string) =>
    run(async () => {
      const commandId = (pending.current[product] ||= crypto.randomUUID());
      const result = await api<{ reward: any }>('/collection/purchase', json('POST', { product, commandId }));
      delete pending.current[product];
      setReward(result.reward);
      await auth.refresh();
    });
  if (resource.loading) return <Loading />;
  const shop = resource.data;
  return (
    <div className="sdvs-collection-page">
      <PageHeader
        eyebrow="ТВОЙ ОПЫТ ОБРЕТАЕТ ФОРМУ"
        title="Коллекции SDVS"
        description="Играй и учись. Собирай вещи, в которых есть твой характер."
        action={
          <a className="rr-button secondary" href="#profile">
            Мой профиль
          </a>
        }
      />
      <ErrorNotice text={error || resource.error} />
      {notice && (
        <p className="rr-notice" role="status">
          {notice}
        </p>
      )}
      <section className="sdvs-wallet">
        <div>
          <span>ДОСТУПНО ДЛЯ ПОКУПОК</span>
          <strong>
            {(shop?.balance.available || 0).toLocaleString('ru')} <small>XP</small>
          </strong>
        </div>
        <p>
          Общий опыт: {shop?.balance.earned || 0} XP
          <br />
          Покупки не уменьшают уровень и достижения.
        </p>
        <Sparkles size={45} aria-hidden="true" />
      </section>
      <div className="sdvs-section-title">
        <h2>Открой свою находку</h2>
        <span>Без оплаты деньгами</span>
      </div>
      <div className="sdvs-case-grid">
        {cases.map((c, index) => (
          <article className={`sdvs-case case-${c.key}`} key={c.key}>
            <div className="sdvs-case-visual" aria-hidden="true">
              <span className="sdvs-case-halo" />
              {index === 2 ? (
                <Fingerprint size={75} strokeWidth={1.2} />
              ) : (
                <Gift size={75} strokeWidth={1.2} />
              )}
              <span className="sdvs-case-stars">✧ ✦ ✧</span>
            </div>
            <small>КОЛЛЕКЦИЯ {String(index + 1).padStart(2, '0')}</small>
            <h3>{c.name}</h3>
            <p>{c.description}</p>
            <button
              className="rr-button primary"
              disabled={busy || !shop || shop.balance.available < c.price}
              onClick={() => void purchase(c.key)}
            >
              Открыть · {c.price.toLocaleString('ru')} XP <ArrowRight size={16} />
            </button>
            {c.odds ? (
              <p className="sdvs-odds">
                Обычный {c.odds.common}% · Редкий {c.odds.rare}% · Легендарный {c.odds.legendary}%
              </p>
            ) : (
              <p className="sdvs-odds">Свободный уникальный номер · Применяется по желанию</p>
            )}
          </article>
        ))}
      </div>
      <p className="sdvs-fineprint">
        Один клик открывает кейс и списывает указанную цену. Результат выбирает сервер. Одинаковые модели
        могут повторяться: у каждой свой номер экземпляра. Предметы существуют внутри игры, не являются NFT и
        не обмениваются на деньги.
      </p>
      <section className="sdvs-premium-card">
        <div>
          <span className="sdvs-premium-label">
            <Crown size={18} /> SDVS PREMIUM
          </span>
          <h2>Больше твоего характера</h2>
          <p>
            Фон с эмодзи, сияющая звезда рядом с именем и до шести подарков в витрине. Обычный профиль тоже
            может выставить один подарок.
          </p>
          <p>30 дней · Продление добавляет 30 дней к оставшемуся сроку.</p>
          {a?.premium && <strong>Активен до {new Date(a.premiumUntil).toLocaleDateString('ru')}</strong>}
        </div>
        <button
          className="rr-button primary"
          disabled={busy || !shop || shop.balance.available < premiumPrice}
          onClick={() => void purchase('premium')}
        >
          {a?.premium ? 'Продлить' : 'Получить'} · 30 000 XP
        </button>
      </section>
      <h2>Знакомься с коллекцией</h2>
      <p>
        Пять бойцов, у каждого пять самостоятельных анимированных фонов. В кейсе выпадает конкретный вариант
        со своим номером.
      </p>
      <label className="sdvs-catalog-filter">
        Коллекция
        <select
          aria-label="Коллекция подарков"
          value={catalogModel}
          onChange={(e) => setCatalogModel(e.target.value)}
        >
          {Array.from(new Map(fighterGifts.map((g) => [g.model, g.modelName])).entries()).map(
            ([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ),
          )}
          <option value="classic">Первая коллекция</option>
        </select>
      </label>
      <div className="sdvs-catalog-grid">
        {gifts
          .filter((g) => ('model' in g ? g.model === catalogModel : catalogModel === 'classic'))
          .map((g) => (
            <article className="sdvs-gift-card" key={g.key}>
              <GiftArt itemKey={g.key} />
              <span className={`sdvs-rarity rarity-${g.rarity}`}>
                {{ common: 'Обычный', rare: 'Редкий', legendary: 'Легендарный' }[g.rarity]}
              </span>
              <h3>{g.name}</h3>
            </article>
          ))}
      </div>
      <div className="sdvs-section-title">
        <h2>Твои предметы</h2>
        <span>{shop?.inventory.length || 0} в коллекции</span>
      </div>
      {!shop?.inventory.length && (
        <div className="sdvs-empty-collection">
          <Gift size={34} />
          <h3>Здесь начнётся твоя коллекция</h3>
          <p>XP зарабатывается в уроках и играх. Первый кейс стоит 500 XP.</p>
          <a className="rr-button secondary" href="#learn">
            Пойти учиться
          </a>
        </div>
      )}
      <div className="sdvs-owned-grid">
        {shop?.inventory.map((item) => (
          <article className="sdvs-gift-card" key={item.id}>
            {item.kind === 'gift' ? (
              <GiftArt itemKey={item.reward} small />
            ) : (
              <div className="sdvs-id-art">#{item.reward}</div>
            )}
            <h3>
              {item.kind === 'gift' ? gifts.find((g) => g.key === item.reward)?.name : `ID ${item.reward}`}
            </h3>
            <small>Экземпляр #{item.serial}</small>
            {item.kind === 'gift' ? (
              <label className="sdvs-feature-checkbox">
                <input
                  type="checkbox"
                  checked={featured.includes(item.id)}
                  disabled={busy || (!featured.includes(item.id) && featured.length >= (a?.premium ? 6 : 1))}
                  onChange={(e) =>
                    setFeatured(
                      e.target.checked ? [...featured, item.id] : featured.filter((id) => id !== item.id),
                    )
                  }
                />{' '}
                В витрину
              </label>
            ) : (
              <button
                className="rr-button secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/collection/ids/' + item.reward + '/apply', json('POST'));
                    setNotice('Номер применён.');
                  })
                }
              >
                Применить номер
              </button>
            )}
            {item.kind === 'gift' && (
              <details className="sdvs-send-gift">
                <summary>Подарить другу</summary>
                <p>Предмет перейдёт другу и исчезнет из твоей коллекции.</p>
                <input
                  aria-label={`ID получателя подарка ${item.serial}`}
                  placeholder="ID друга"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  maxLength={100}
                />
                <button
                  className="rr-button secondary"
                  disabled={busy || !recipient.trim()}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        '/collection/gifts/' + item.id + '/send',
                        json('POST', { targetId: recipient.trim() }),
                      );
                      setNotice('Подарок передан другу.');
                    })
                  }
                >
                  Отправить подарок
                </button>
              </details>
            )}
          </article>
        ))}
      </div>
      <section className="rr-panel sdvs-appearance-form">
        <h2>Настрой свою витрину</h2>
        <p>Отметь подарки выше и сохрани оформление.</p>
        <fieldset disabled={!a?.premium || busy}>
          <legend>Эмодзи на фоне · Премиум</legend>
          <div className="sdvs-emoji-options">
            <button aria-label="Без эмодзи" aria-pressed={emoji === ''} onClick={() => setEmoji('')}>
              ∅
            </button>
            {profileEmojis.map((e) => (
              <button key={e} aria-label={`Фон ${e}`} aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          className="rr-button primary"
          disabled={busy || !shop}
          onClick={() =>
            void run(async () => {
              await api(
                '/collection/appearance',
                json('PATCH', { emoji: a?.premium ? emoji : '', featured }),
              );
              setNotice('Витрина сохранена.');
            })
          }
        >
          Сохранить оформление
        </button>
        {auth.user && <ProfileShowcase id={auth.user.id} />}
      </section>
      {reward && (
        <Dialog
          title={reward.kind === 'premium' ? 'Твой премиум активен' : 'Твоя находка!'}
          onClose={() => setReward(null)}
        >
          <div className="sdvs-reward-reveal">
            {reward.kind === 'gift' ? (
              <>
                <GiftArt itemKey={reward.reward} />
                <h2>{gifts.find((g) => g.key === reward.reward)?.name}</h2>
                <p>Экземпляр #{reward.serial}</p>
              </>
            ) : reward.kind === 'id' ? (
              <>
                <Fingerprint size={50} />
                <h2>#{reward.reward}</h2>
                <p>Номер сохранён в коллекции. Примени его, когда захочешь.</p>
              </>
            ) : (
              <>
                <Crown size={70} />
                <p>Оформление доступно до {new Date(reward.premiumUntil).toLocaleDateString('ru')}.</p>
              </>
            )}
            <button className="rr-button primary" onClick={() => setReward(null)}>
              Отлично
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
