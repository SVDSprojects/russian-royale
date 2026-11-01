import { transaction, type DB } from './storage';
import { id, iso } from './core';

// Versioned, additive content: applied once, never restores an editor's deletions.
export const expansion = [
  [
    '-ТСЯ и -ТЬСЯ',
    'Задайте вопрос к глаголу: что делать? — -ться; что делает? — -тся.',
    [
      'Он учи_ в школе.|тся',
      'Нужно учи_ каждый день.|ться',
      'Она стреми_ к победе.|тся',
      'Можно ошиба_ и пробовать снова.|ться',
    ],
    ['тся', 'ться'],
  ],
  [
    'Приставки на З и С',
    'В приставках без-/бес-, раз-/рас-, из-/ис- перед звонкими согласными и гласными пишется З, перед глухими — С. Приставка С- не изменяется: сделать, сбить.',
    ['Бе_вкусный|з', 'Ра_писать|с', 'И_бежать|з', 'Бе_шумный|с'],
    ['з', 'с'],
  ],
  [
    'Приставки ПРЕ- и ПРИ-',
    'ПРИ- обозначает приближение, присоединение, близость или неполноту действия. ПРЕ- может означать «очень» или быть близкой по смыслу к ПЕРЕ-. В неясных случаях проверяйте слово по словарю.',
    ['Пр_ехать в город|и', 'Пр_клеить лист|и', 'Пр_открыть окно|и', 'Пр_красный — очень красивый|е'],
    ['е', 'и'],
  ],
  [
    'Разделительные Ъ и Ь',
    'Ъ пишется после приставки на согласную перед Е, Ё, Ю, Я: подъезд. Разделительный Ь встречается внутри слова перед Е, Ё, Ю, Я, И: семья, соловьи. Есть и особые случаи Ъ в сложных и заимствованных словах.',
    ['Под_езд|ъ', 'Об_явление|ъ', 'Сем_я|ь', 'Солов_и|ь'],
    ['ъ', 'ь'],
  ],
  [
    'Проверяемые безударные гласные',
    'Подберите форму или родственное слово, в котором нужная гласная стоит под ударением: вода — воды. Значение корня должно сохраняться. Этот способ не применяют к корням с чередованием.',
    ['В_да (во́ды)|о', 'Л_са (лес)|е', 'Тр_ва (тра́вы)|а', 'М_ря (мо́ре)|о'],
    ['а', 'о', 'е', 'и'],
  ],
  [
    'Корни -ЛАГ- и -ЛОЖ-',
    'В безударном корне перед Г пишется А, перед Ж — О: предлагать, предложить. Исключение: полог. Сначала убедитесь, что перед вами именно этот чередующийся корень.',
    ['Предл_гать|а', 'Изл_жение|о', 'Пол_гать|а', 'Прил_жить|о'],
    ['а', 'о'],
  ],
  [
    'Корни -РАСТ-, -РАЩ- и -РОС-',
    'Без ударения перед СТ и Щ пишется А, перед С — О. Запомните исключения: росток, ростовщик, Ростов, Ростислав, отрасль и соответствующие производные.',
    ['Выр_стить|а', 'Выр_щенный|а', 'Выр_сли|о', 'Р_сток|о'],
    ['а', 'о'],
  ],
  [
    'Корни -КАС- и -КОС-',
    'Если непосредственно после корня есть суффикс -А-, пишется КАС: касаться. Если этого суффикса нет — КОС: коснуться. Правило относится к корню со значением прикосновения.',
    ['К_саться|а', 'К_снуться|о', 'Прик_сновение|о', 'Прик_саться|а'],
    ['а', 'о'],
  ],
  [
    'Корни -ГАР- и -ГОР-',
    'В этом чередующемся корне без ударения пишется О: гореть. Под ударением пишется слышимая А: загар. Исключения с безударной А: выгарки, изгарь, пригарь; есть словарные варианты отдельных производных.',
    ['Заг_реть|о', 'Заг_р (под ударением)|а', 'Г_рение|о', 'Уг_реть|о'],
    ['а', 'о'],
  ],
] as const;

export function addContentPack(db: DB) {
  const key = 'rules-expansion-2026-10-v1';
  if (db.prepare('SELECT 1 FROM seed_metadata WHERE key=?').get(key)) return;
  transaction(db, () => {
    let category = db.prepare('SELECT id FROM categories WHERE name=?').get('Орфография')?.id;
    if (!category) {
      category = id();
      db.prepare('INSERT INTO categories VALUES(?,?)').run(category, 'Орфография');
    }
    for (const [title, explanation, tasks, options] of expansion) {
      const rule = id(),
        time = iso();
      db.prepare(
        'INSERT INTO rules(id,title,category_id,summary,explanation,examples,mistakes,difficulty,games,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        rule,
        title,
        category,
        explanation.split('. ')[0] + '.',
        explanation,
        JSON.stringify(
          tasks.map((t) => {
            const [word, answer] = t.split('|');
            return word.replace('_', answer);
          }),
        ),
        JSON.stringify(['Определите часть слова и условие правила, прежде чем выбирать букву.']),
        2,
        '["spy"]',
        1,
        time,
        time,
      );
      const exercises = tasks.map((task) => {
        const [prompt, answer] = task.split('|'),
          eid = id();
        db.prepare(
          'INSERT INTO exercises(id,rule_id,type,prompt,options,answer,explanation,difficulty,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        ).run(
          eid,
          rule,
          'choice',
          prompt,
          JSON.stringify(options),
          answer,
          `${prompt.replace('_', answer)}. ${explanation}`,
          2,
          1,
          time,
          time,
        );
        return { id: id(), type: 'exercise', exerciseId: eid, emotion: 'explaining' };
      });
      const blocks = [
        { id: id(), type: 'explanation', text: explanation, emotion: 'explaining' },
        ...exercises,
        {
          id: id(),
          type: 'result',
          text: 'Тема пройдена! Попробуйте узнать её в игре «Шпион».',
          emotion: 'happy',
        },
      ];
      db.prepare(
        'INSERT INTO lessons(id,rule_id,title,published,blocks,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      ).run(id(), rule, title, 1, JSON.stringify(blocks), time, time);
    }
    db.prepare('INSERT INTO seed_metadata VALUES(?,?)').run(key, iso());
  });
}
