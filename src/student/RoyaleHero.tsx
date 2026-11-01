import { ArrowUpRight, Sparkles, Users, Zap } from 'lucide-react';
import { go } from './common';

export function RoyaleWorld({ eager = false }: { eager?: boolean }) {
  return (
    <div className="royale-world" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/assets/world/royale-island-small.webp" />
        <img
          src="/assets/world/royale-island.webp"
          alt=""
          width="1536"
          height="1024"
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
        />
      </picture>
      <span className="royale-world-spark spark-one">✦</span>
      <span className="royale-world-spark spark-two">✦</span>
      <span className="royale-world-token token-one">А</span>
      <span className="royale-world-token token-two">Я</span>
    </div>
  );
}

export function RoyaleHero() {
  return (
    <section className="royale-hero" aria-labelledby="royale-hero-title">
      <div className="royale-hero-copy">
        <span className="royale-kicker">
          <span /> КЛУБ ЯЗЫКОВЫХ ИГР
        </span>
        <h2 id="royale-hero-title">
          Большая игра.
          <br />
          <span>Твои правила.</span>
        </h2>
        <p>
          Собери друзей. Раскрой шпиона. Покори острова знаний. Здесь русский язык становится приключением.
        </p>
        <div className="royale-hero-actions">
          <button className="royale-primary" onClick={() => go('games/jeopardy')}>
            Начать приключение <ArrowUpRight size={21} />
          </button>
          <button className="royale-text-link" onClick={() => go('arcade/practice')}>
            Сначала разминка <Zap size={16} />
          </button>
        </div>
        <div className="royale-hero-meta">
          <span>
            <Users size={15} /> Вместе с друзьями
          </span>
          <span>
            <Sparkles size={15} /> В своём темпе
          </span>
        </div>
      </div>
      <RoyaleWorld eager />
      <div className="royale-world-caption">
        <span className="royale-mini-orbit" /> ТВОЙ МИР ЗНАНИЙ <ArrowUpRight size={14} />
      </div>
    </section>
  );
}
