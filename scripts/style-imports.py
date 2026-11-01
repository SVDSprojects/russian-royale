from pathlib import Path
for game in ['jeopardy','roulette']:
 for file in Path('src/games',game).glob('*'):
  if file.suffix in ['.tsx','.css']:
   s=file.read_text(encoding='utf-8').replace('rr-brand','rr-module-brand').replace('rr-footer','rr-module-footer')
   s=s.replace('Позовите ещё одного игрока: откройте эту комнату в другом профиле браузера.', 'Позовите друга: пусть откроет эту игру и выберет ваш сервер и комнату.')
   file.write_text(s,encoding='utf-8')
 p=Path('src/games',game,'styles.css')
 with p.open('a',encoding='utf-8') as f:f.write(f'''\n.rr-game-{game} {{ border-radius: 24px; font-family: 'Manrope Variable', sans-serif; }}
.rr-game-{game} .rr-top {{ flex-wrap: wrap; gap: 16px; }}
.rr-game-{game} .rr-top-actions {{ flex-shrink: 0; }}
.rr-game-{game} .rr-quiet {{ white-space: nowrap; min-width: 80px; }}
.rr-game-{game} .rr-cover {{ object-fit: contain; }}
''')
