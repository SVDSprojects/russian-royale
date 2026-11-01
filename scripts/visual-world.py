from pathlib import Path
p=Path('src/student/dashboard.tsx');s=p.read_text(encoding='utf-8');s="import { RoyaleHero } from './RoyaleHero';\nimport { GameArt } from './GameArt';\n"+s
start=s.index('      <ArcadeCards />');end=s.index('      <div className="rr-stats-grid">',start)
s=s[:start]+'      <RoyaleHero />\n'+s[end:]
s=s.replace('  return (\n    <>\n      <PageHeader', '  return (\n    <div className="rr-discovery">\n      <PageHeader',1)
end=s.index('\nfunction Stat(');head=s[:end];pos=head.rfind('    </>');head=head[:pos]+head[pos:].replace('    </>','    </div>',1);s=head+s[end:]
start=s.index('      <div className="rr-section-heading rr-game-heading">');end=s.index('      <section className="rr-community-strip">',start)
games=s[start:end].replace('gameModes.slice(0, 4)','gameModes.filter((g) => g.available)').replace('ОДИН ЯЗЫК. РАЗНЫЕ ПРАВИЛА ИГРЫ.','СОБИРАЕМСЯ ВМЕСТЕ').replace('Выбери свой режим','Вечер с друзьями')
s=s[:start]+s[end:];idx=s.index('      <div className="rr-dashboard-columns">');s=s[:idx]+games+'''      <div className="rr-section-heading royale-solo-heading"><div><span className="rr-eyebrow">ПЯТЬ СПОСОБОВ СТАТЬ СИЛЬНЕЕ</span><h2>Твой личный рекорд</h2></div><span className="royale-section-note">Один игрок. Много открытий.</span></div>
      <ArcadeCards />
'''+s[idx:]
s=s.replace('        <Icon size={52} strokeWidth={1.35} />\n        <div className="rr-game-art-circle" />','        <GameArt kind={game.icon} />')
s=s.replace('<span /> Доступно','<span /> Можно играть')
s=s.replace('  return (\n    <>\n      <PageHeader\n        eyebrow="ТВОЯ ИГРОВАЯ БИБЛИОТЕКА"', '  return (\n    <div className="rr-discovery rr-catalog-discovery">\n      <PageHeader\n        eyebrow="ТВОЯ ИГРОВАЯ БИБЛИОТЕКА"')
start=s.index('export function Games()');end=s.index('export function ProfilePage()');chunk=s[start:end];pos=chunk.rfind('</>');chunk=chunk[:pos]+chunk[pos:].replace('</>','</div>',1);s=s[:start]+chunk+s[end:]
# Multiplayer comes first in the catalogue.
s=s.replace('      {showSolo && soloCount > 0 && <ArcadeCards search={query} />}\n','')
pos=s.index('      {!soloCount && !shownMultiplayer.length');s=s[:pos]+'''      {showSolo && soloCount > 0 && <><div className="rr-section-heading royale-solo-heading"><div><span className="rr-eyebrow">В СВОЁМ ТЕМПЕ</span><h2>Соло приключения</h2></div></div><ArcadeCards search={query} /></>}
'''+s[pos:]
p.write_text(s,encoding='utf-8')
p=Path('src/student/StudentApp.tsx');s=p.read_text(encoding='utf-8');s="import { RoyaleWorld } from './RoyaleHero';\n"+s;s=s.replace("import '../royale-refresh.css';","import '../royale-refresh.css';\nimport '../royale-world.css';")
s=s.replace('className="rr-welcome"','className="rr-welcome rr-world-welcome"').replace('        <SpyArt />','        <RoyaleWorld eager/>');p.write_text(s,encoding='utf-8')
