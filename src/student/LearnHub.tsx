import { useState } from 'react';
import { BookOpen, GraduationCap, LibraryBig, Gift, LifeBuoy, Mail, Send } from 'lucide-react';
import { PageHeader, ErrorNotice } from './common';
import { ChallengeCards } from './ChallengesPage';
export function LearnHub() {
  return (
    <>
      <PageHeader
        eyebrow="НЕБОЛЬШОЙ ШАГ КАЖДЫЙ ДЕНЬ"
        title="Учиться в своём темпе"
        description="Правила, слова и короткие игры — выбери, что нужно сегодня."
      />
      <div className="sdvs-learn-grid">
        {[
          {
            href: 'lessons',
            name: 'Уроки',
            description: 'Понятные объяснения и практика по шагам.',
            icon: GraduationCap,
          },
          {
            href: 'rules',
            name: 'Справочник правил',
            description: 'Быстро найди правило и примеры.',
            icon: BookOpen,
          },
          {
            href: 'dictionary',
            name: 'Академический словарь',
            description: 'Значения, ударения и твои сохранённые слова.',
            icon: LibraryBig,
          },
          {
            href: 'collection',
            name: 'Коллекции и премиум',
            description: 'Пусть заработанный опыт станет частью профиля.',
            icon: Gift,
          },
        ].map((x) => (
          <a href={'#' + x.href} className="rr-panel sdvs-learn-card" key={x.href}>
            <x.icon size={29} />
            <h2>{x.name}</h2>
            <p>{x.description}</p>
          </a>
        ))}
      </div>
      <h2>Практика, которая увлекает</h2>
      <ChallengeCards />
    </>
  );
}
export function FeedbackPage() {
  const [category, setCategory] = useState('Ошибка'),
    [text, setText] = useState(''),
    [error, setError] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="МЫ НА СВЯЗИ"
        title="Обратная связь SDVS"
        description="Расскажи, что не работает или чего не хватает."
      />
      <form
        className="rr-panel rr-form sdvs-feedback"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length < 10) {
            setError('Опиши ситуацию хотя бы в десяти символах.');
            return;
          }
          setError('');
          window.location.href = `mailto:vbarsegan363@gmail.com?subject=${encodeURIComponent('[SDVS] ' + category)}&body=${encodeURIComponent(text.trim() + '\n\nСтраница: ' + location.href)}`;
        }}
      >
        <label>
          Тема
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {['Ошибка', 'Предложение', 'Проблема со входом'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Сообщение
          <textarea
            rows={6}
            minLength={10}
            maxLength={3000}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что произошло? На каком устройстве? Как повторить ошибку?"
          />
        </label>
        <ErrorNotice text={error} />
        <p>
          Кнопка откроет твою почту с готовым письмом. Для отправки нажми «Отправить» в почтовом приложении.
          Пароли и коды присылать не нужно.
        </p>
        <button className="rr-button primary">
          <Send size={17} />
          Подготовить письмо
        </button>
        <a href="mailto:vbarsegan363@gmail.com">
          <Mail size={16} /> vbarsegan363@gmail.com
        </a>
      </form>
    </>
  );
}

export function InstallPage() {
  return (
    <>
      <PageHeader
        eyebrow="РУССКИЙ ROYALE С ТОБОЙ"
        title="Добавь игру на телефон"
        description="Те же аккаунты и онлайн-игры, с быстрым доступом с главного экрана."
      />
      <div className="sdvs-learn-grid">
        <section className="rr-panel">
          <h2>Android · приложение 1.1</h2>
          <p>
            Скачай APK, открой файл и при запросе разреши установку из браузера или файлового менеджера.
            Android 8.0 и новее.
          </p>
          <a
            className="rr-button primary"
            href="https://drive.google.com/file/d/18n6j4flZIF5BCxhNwooxiqZep5S9g7wV/view"
            target="_blank"
            rel="noopener noreferrer"
          >
            Скачать APK
          </a>
          <p>
            Если приложение уже установлено, новая версия ставится поверх него. Вход и данные аккаунта
            сохраняются.
          </p>
        </section>
        <section className="rr-panel">
          <h2>iPhone · через Safari</h2>
          <ol>
            <li>Открой сайт в Safari.</li>
            <li>Нажми «Поделиться».</li>
            <li>Выбери «На экран “Домой”» и нажми «Добавить».</li>
          </ol>
          <p>На главном экране появится иконка Русского Royale.</p>
        </section>
      </div>
      <section className="rr-panel">
        <h2>Обновления без лишних действий</h2>
        <p>
          Игры и материалы загружаются с сайта. Для доступа нужен интернет. После обновления сайта закрой и
          снова открой приложение или обнови страницу; менять APK ради новых вопросов не нужно.
        </p>
        <p>Если меняется сама Android-оболочка, новая версия APK появляется по той же ссылке.</p>
      </section>
    </>
  );
}
