import { fetchJson } from './http.js';
import { config } from './config.js';

export const LEVELS = [
  { key: 'fast', label: '⚡ Быстрая', minutes: 15 },
  { key: 'medium', label: '🔥 Заморочиться', minutes: 45 },
  { key: 'gourmet', label: '👨‍🍳 Ресторанный', minutes: 90 },
];

export const MODES = [
  { key: 'own', label: 'Из того, что есть' },
  { key: 'suggest', label: 'Предложи докупить' },
];

function matchProduct(productNames, key) {
  const k = String(key).toLowerCase().trim();
  if (k.length < 3) return false;
  return productNames.some((name) => {
    const n = String(name).toLowerCase();
    return n.includes(k) || k.includes(n);
  });
}

function extractJson(text) {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : t;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ---------- локальный подбор по базе ---------- */

export function generateLocal(products, mode, level) {
  const names = products.map((p) => p.name);
  const filtered = LOCAL_RECIPES.filter((r) => !level || r.level === level);
  const scored = filtered
    .map((r) => {
      const have = r.ingredients.filter((i) => matchProduct(names, i));
      const missing = r.ingredients.filter((i) => !matchProduct(names, i));
      return { ...r, have, missing, score: have.length };
    })
    .filter((r) => r.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    ai: false,
    mode,
    level,
    recipes: scored.map((r) => ({
      name: r.name,
      minutes: r.minutes,
      level: r.level,
      levelLabel: r.levelLabel,
      description: r.description,
      have: r.have,
      missing: r.missing,
      shopping: mode === 'suggest' ? r.missing : [],
      steps: r.steps || [],
      matchedCount: r.score,
    })),
    note: 'Рецепты подобраны по локальной базе. Впиши AI_API_KEY в server/.env — тогда рецепты будет составлять нейросеть.',
  };
}

/* ---------- ИИ через OpenRouter / OpenAI-совместимый API ---------- */

async function generateWithAI(products, mode, level) {
  const productList = products.map((p) => ({
    name: p.name,
    brand: p.brand || '',
    quantity: p.quantity || 1,
    category: p.category || '',
  }));
  const modeDesc =
    mode === 'own'
      ? 'только из того, что есть в холодильнике (ничего докупать нельзя)'
      : 'можно предложить докупить недостающие продукты';
  const levelDesc = LEVELS.find((l) => l.key === level)?.label || level;

  const prompt = `Ты — шеф-повар. Составь рецепты из продуктов пользователя.
Продукты в холодильнике:
${JSON.stringify(productList, null, 1)}

Режим: ${modeDesc}
Уровень сложности: ${levelDesc}

Верни ТОЛЬКО валидный JSON без markdown и пояснений в формате:
{"recipes":[{"name":"...","minutes":15,"level":"fast","ingredients":[{"name":"...","have":true,"needed":"100 г"}],"steps":["1. ...","2. ..."],"shopping":["недостающие продукты"]}]}

Требования:
- 4-6 рецептов.
- Режим own: только имеющиеся продукты, поле shopping пустое.
- Уровни: fast — до 15 минут, medium — 30–60 минут, gourmet — сложные ресторанные блюда 60+ минут.
- minutes — реальное время приготовления в минутах.
- Для каждого ингредиента have=true, если он есть в холодильнике, иначе false.
- shopping — список конкретных продуктов, которые нужно докупить (пустой в режиме own).
- steps — 3–6 понятных шагов приготовления.`;

  const { json, text } = await fetchJson(`${config.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.aiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: config.aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 5000,
    },
    timeoutMs: 90000,
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('ИИ не вернул ответ' + (json?.error ? `: ${json.error.message || ''}` : ''));

  const parsed = extractJson(content);
  if (!parsed?.recipes?.length) {
    throw new Error('ИИ вернул невалидный JSON. Ответ: ' + text.slice(0, 200));
  }

  return {
    ai: true,
    model: config.aiModel,
    mode,
    level,
    recipes: parsed.recipes.slice(0, 6).map((r) => ({
      name: r.name,
      minutes: Number(r.minutes) || 30,
      level: r.level || level,
      levelLabel: LEVELS.find((l) => l.key === (r.level || level))?.label || r.level,
      description: '',
      have: (r.ingredients || []).filter((i) => i.have).map((i) => i.name),
      missing: (r.ingredients || []).filter((i) => !i.have).map((i) => i.name),
      shopping: (r.shopping || (r.ingredients || []).filter((i) => !i.have).map((i) => i.name) || []),
      steps: r.steps || [],
      matchedCount: (r.ingredients || []).filter((i) => i.have).length,
    })),
    note: '',
  };
}

/* ---------- главная функция ---------- */

export async function generateRecipes(products, mode, level) {
  if (config.aiApiKey) {
    try {
      return await generateWithAI(products, mode, level);
    } catch (e) {
      console.warn('[recipes] ИИ не сработал, фолбэк на локальную базу:', e.message);
    }
  }
  return generateLocal(products, mode, level);
}

/* ---------- локальная база рецептов (фолбэк, если ИИ не настроен) ---------- */

const LOCAL_RECIPES = [
  {
    id: 1,
    name: 'Омлет с сыром',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Пышный омлет с тянущимся сыром — идеальный быстрый завтрак.',
    ingredients: ['яйц', 'молок', 'сыр'],
    steps: ['Взбей яйца с молоком и щепоткой соли.', 'Вылей на разогретую сковороду с маслом.', 'Посыпь тёртым сыром и накрой крышкой.', 'Готовь 3–4 минуты на слабом огне.'],
  },
  {
    id: 2,
    name: 'Сырники из творога',
    level: 'fast',
    minutes: 20,
    levelLabel: '⚡ Быстрая',
    description: 'Классические сырники — хрустящие снаружи, нежные внутри.',
    ingredients: ['творог', 'яйц', 'мук', 'сахар'],
    steps: ['Смешай творог, яйцо, муку и сахар.', 'Слепи лепёшки, обваляй в муке.', 'Обжарь на масле по 3 минуты с каждой стороны.'],
  },
  {
    id: 3,
    name: 'Овсяная каша с бананом',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Сытная и полезная каша на молоке.',
    ingredients: ['овсянк', 'молок', 'банан', 'сахар'],
    steps: ['Вскипяти молоко.', 'Засыпь овсянку, вари 5 минут.', 'Добавь нарезанный банан и сахар по вкусу.'],
  },
  {
    id: 4,
    name: 'Тост с авокадо и яйцом',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Модный завтрак из простых продуктов.',
    ingredients: ['хлеб', 'авокад', 'яйц', 'лимон'],
    steps: ['Поджарь хлеб до хруста.', 'Разомни авокадо с лимонным соком и солью.', 'Свари яйцо пашот или пожарь глазунью.', 'Выложи авокадо на тост, сверху яйцо.'],
  },
  {
    id: 5,
    name: 'Паста с чесноком и маслом',
    level: 'fast',
    minutes: 15,
    levelLabel: '⚡ Быстрая',
    description: 'Минималистичная, но ароматная паста alio e olio.',
    ingredients: ['макарон', 'паст', 'чеснок', 'масл', 'сыр'],
    steps: ['Отвари макароны до al dente.', 'На сковороде обжарь нарезанный чеснок в масле.', 'Смешай пасту с чесночным маслом.', 'Посыпь тёртым сыром.'],
  },
  {
    id: 6,
    name: 'Греческий салат',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Свежий салат с фетой и оливковым маслом.',
    ingredients: ['огурец', 'помидор', 'сыр', 'оливк', 'перец', 'лук'],
    steps: ['Нарежь крупными кусками огурцы и помидоры.', 'Добавь кольца лука и кубики сыра.', 'Заправь оливковым маслом, посоли и поперчи.'],
  },
  {
    id: 7,
    name: 'Творог с мёдом и орехами',
    level: 'fast',
    minutes: 5,
    levelLabel: '⚡ Быстрая',
    description: 'Полезный перекус за минуту.',
    ingredients: ['творог', 'мёд', 'мед', 'орех'],
    steps: ['Выложи творог в тарелку.', 'Полей мёдом и посыпь орехами.'],
  },
  {
    id: 8,
    name: 'Горячие бутерброды',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Хрустящие бутерброды с сыром и колбасой.',
    ingredients: ['хлеб', 'сыр', 'колбас'],
    steps: ['На хлеб выложи ломтики колбасы и сыра.', 'Обжарь на сковороде под крышкой до расплавления сыра.'],
  },
  {
    id: 9,
    name: 'Банановый смузи',
    level: 'fast',
    minutes: 5,
    levelLabel: '⚡ Быстрая',
    description: 'Густой питательный напиток.',
    ingredients: ['банан', 'молок', 'кефир', 'мёд', 'мед'],
    steps: ['Взбей в блендере банан с молоком или кефиром.', 'Добавь мёд по вкусу и ещё раз взбей.'],
  },
  {
    id: 10,
    name: 'Яичница с помидорами',
    level: 'fast',
    minutes: 10,
    levelLabel: '⚡ Быстрая',
    description: 'Сочная яичница по-деревенски.',
    ingredients: ['яйц', 'помидор', 'лук'],
    steps: ['Обжарь нарезанный лук и помидоры.', 'Вбей яйца, посоли и поперчи.', 'Готовь под крышкой 5 минут.'],
  },
  {
    id: 11,
    name: 'Сырный суп с курицей',
    level: 'medium',
    minutes: 40,
    levelLabel: '🔥 Заморочиться',
    description: 'Нежный сливочный суп с плавленым сыром и курицей.',
    ingredients: ['куриц', 'курин', 'картофел', 'картошк', 'лук', 'морков', 'сыр', 'чеснок'],
    steps: ['Отвари курицу, вынь и нарежь.', 'В бульон добавь картофель, лук и морковь.', 'Вари 15 минут, добавь плавленый сыр.', 'Пробей блендером, верни курицу, посоли и поперчи.'],
  },
  {
    id: 12,
    name: 'Паста болоньезе',
    level: 'medium',
    minutes: 45,
    levelLabel: '🔥 Заморочиться',
    description: 'Классическая итальянская паста с мясным соусом.',
    ingredients: ['макарон', 'паст', 'фарш', 'помидор', 'томат', 'лук', 'чеснок', 'масл'],
    steps: ['Обжарь лук и чеснок, добавь фарш.', 'Туши 15 минут, добавь помидоры и томатную пасту.', 'Потуши ещё 15 минут на медленном огне.', 'Смешай с отваренной пастой и посыпь сыром.'],
  },
  {
    id: 13,
    name: 'Курица, запечённая с овощами',
    level: 'medium',
    minutes: 60,
    levelLabel: '🔥 Заморочиться',
    description: 'Сочная курица с картофелем и морковью из духовки.',
    ingredients: ['куриц', 'курин', 'картофел', 'картошк', 'морков', 'лук', 'чеснок', 'масл'],
    steps: ['Натри курицу солью, перцем и чесноком.', 'Выложи вокруг нарезанные овощи.', 'Запекай при 200°C 45–50 минут до румяности.'],
  },
  {
    id: 14,
    name: 'Плов с курицей',
    level: 'medium',
    minutes: 60,
    levelLabel: '🔥 Заморочиться',
    description: 'Ароматный домашний плов с курицей.',
    ingredients: ['рис', 'куриц', 'курин', 'морков', 'лук', 'чеснок', 'масл'],
    steps: ['Обжарь курицу до золотистости, добавь лук и морковь.', 'Всыпь рис, залей кипятком.', 'Туши под крышкой 25–30 минут.', 'Добавь чеснок, дай настояться 10 минут.'],
  },
  {
    id: 15,
    name: 'Гречка с грибами и луком',
    level: 'medium',
    minutes: 30,
    levelLabel: '🔥 Заморочиться',
    description: 'Сытная гречка с жареными грибами.',
    ingredients: ['гречк', 'гриб', 'лук', 'масл'],
    steps: ['Обжарь лук с грибами до золотистости.', 'Всыпь промытую гречку, залей водой 1:2.', 'Туши 20 минут под крышкой.'],
  },
  {
    id: 16,
    name: 'Ленивые голубцы',
    level: 'medium',
    minutes: 50,
    levelLabel: '🔥 Заморочиться',
    description: 'Вкус голубцов без возни с листьями капусты.',
    ingredients: ['фарш', 'капуст', 'рис', 'лук', 'морков', 'томат', 'чеснок'],
    steps: ['Смешай фарш, рис, капусту, лук и специи.', 'Сформируй котлетки и обжарь.', 'Залей соусом из томатной пасты и воды.', 'Туши 30 минут.'],
  },
  {
    id: 17,
    name: 'Шакшука',
    level: 'medium',
    minutes: 25,
    levelLabel: '🔥 Заморочиться',
    description: 'Яйца, запечённые в томатном соусе с перцем.',
    ingredients: ['яйц', 'помидор', 'томат', 'перец', 'лук', 'чеснок', 'масл'],
    steps: ['Обжарь лук, чеснок и перец.', 'Добавь помидоры, туши 10 минут до густоты.', 'Сделай углубления и вбей яйца.', 'Накрой крышкой на 5 минут.'],
  },
  {
    id: 18,
    name: 'Картофельная запеканка с мясом',
    level: 'medium',
    minutes: 60,
    levelLabel: '🔥 Заморочиться',
    description: 'Сытная запеканка из картофеля и фарша.',
    ingredients: ['картофел', 'картошк', 'фарш', 'лук', 'сыр', 'молок', 'яйц'],
    steps: ['Свари картофель и разомни с молоком и яйцом.', 'Обжарь фарш с луком.', 'Слоями выложи в форму: картофель, фарш, картофель.', 'Посыпь сыром, запекай 25 минут при 200°C.'],
  },
  {
    id: 19,
    name: 'Запечённые сырники',
    level: 'medium',
    minutes: 35,
    levelLabel: '🔥 Заморочиться',
    description: 'Лёгкие сырники из духовки, как в детстве.',
    ingredients: ['творог', 'яйц', 'мук', 'сахар'],
    steps: ['Смешай творог, яйца, муку и сахар.', 'Слепи шарики и выложи на пергамент.', 'Запекай 25 минут при 180°C.'],
  },
  {
    id: 20,
    name: 'Рыба под овощным маринадом',
    level: 'medium',
    minutes: 45,
    levelLabel: '🔥 Заморочиться',
    description: 'Рыба, запечённая с морковью и луком в томате.',
    ingredients: ['рыб', 'морков', 'лук', 'томат', 'масл'],
    steps: ['Обжарь морковь и лук, добавь томатную пасту.', 'Выложи рыбу в форму, сверху овощи.', 'Запекай 25 минут при 190°C.'],
  },
  {
    id: 21,
    name: 'Ризотто с грибами',
    level: 'gourmet',
    minutes: 50,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Кремовое итальянское ризотто со сливками и пармезаном.',
    ingredients: ['рис', 'гриб', 'лук', 'сыр', 'сливк', 'масл'],
    steps: ['Обжарь лук и грибы в масле.', 'Добавь рис, обжарь до прозрачности.', 'Постепенно подливай бульон, помешивая 20 минут.', 'Вмешай сливки и сыр, дай настояться 5 минут.'],
  },
  {
    id: 22,
    name: 'Утиная грудка с апельсиновым соусом',
    level: 'gourmet',
    minutes: 70,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Ресторанное блюдо с хрустящей кожицей и глазурью.',
    ingredients: ['утк', 'апельсин', 'мёд', 'мед', 'соев', 'масл'],
    steps: ['Надрежь кожицу утки, посоли и обжарь кожей вниз 7 минут.', 'Запекай 20 минут при 180°C.', 'Смешай сок апельсина, мёд и соевый соус, увари вдвое.', 'Полей соусом нарезку и дай отдохнуть 5 минут.'],
  },
  {
    id: 23,
    name: 'Стейк с соусом бер-блан',
    level: 'gourmet',
    minutes: 40,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Идеальный стейк с классическим сливочным соусом.',
    ingredients: ['говядин', 'говяж', 'сливк', 'масл', 'лук', 'лимон'],
    steps: ['Доведи стейк до комнатной температуры, посоли.', 'Обжарь по 3–4 минуты с каждой стороны.', 'Для соуса: упари лук с вином, добавь сливки и масло.', 'Полей стейк соусом и дай отдохнуть 5 минут.'],
  },
  {
    id: 24,
    name: 'Лосось в сливочном соусе с укропом',
    level: 'gourmet',
    minutes: 35,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Нежный лосось в сливочном соусе — просто и элегантно.',
    ingredients: ['лосос', 'сливк', 'лимон', 'укроп', 'масл', 'чеснок'],
    steps: ['Обжарь филе лосося по 3 минуты с каждой стороны.', 'В сотейнике смешай сливки, чеснок и укроп.', 'Прогрей соус 5 минут, добавь лимонный сок.', 'Выложи лосось в соус, прогревай 2 минуты.'],
  },
  {
    id: 25,
    name: 'Лазанья с мясным соусом',
    level: 'gourmet',
    minutes: 90,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Многослойная итальянская лазанья с бешамелем.',
    ingredients: ['фарш', 'помидор', 'томат', 'сыр', 'молок', 'мук', 'масл', 'лук', 'чеснок'],
    steps: ['Обжарь фарш с луком и чесноком, добавь томаты, туши 20 минут.', 'Приготовь бешамель: масло, мука, молоко.', 'Слои: листы лазаньи, мясо, бешамель, сыр.', 'Запекай 40 минут при 190°C, дай постоять 10 минут.'],
  },
  {
    id: 26,
    name: 'Крем-брюле',
    level: 'gourmet',
    minutes: 60,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Французский десерт с карамельной корочкой.',
    ingredients: ['сливк', 'яйц', 'сахар', 'молок'],
    steps: ['Нагрей сливки, не доводя до кипения.', 'Взбей желтки с сахаром, влей сливки.', 'Разлей по формам, запекай на водяной бане 40 минут при 150°C.', 'Остуди и посыпь сахаром, карамелизуй горелкой.'],
  },
  {
    id: 27,
    name: 'Тартар из лосося',
    level: 'gourmet',
    minutes: 20,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Свежий холодный стартер на аперитив.',
    ingredients: ['лосос', 'лук', 'лимон', 'масл', 'хлеб'],
    steps: ['Нарежь лосось мелкими кубиками.', 'Смешай с луком-шалот, лимонным соком и маслом.', 'Приправь солью и перцем, выложи кольцом.', 'Подавай с тостами.'],
  },
  {
    id: 28,
    name: 'Томлёная говядина с овощами',
    level: 'gourmet',
    minutes: 120,
    levelLabel: '👨‍🍳 Ресторанный',
    description: 'Нежнейшая говядина, томлённая в вине с овощами.',
    ingredients: ['говядин', 'говяж', 'морков', 'лук', 'чеснок', 'томат'],
    steps: ['Обжарь куски говядины до корочки.', 'Добавь овощи, вино и томаты.', 'Туши под крышкой 1,5–2 часа на медленном огне.', 'Подавай с овощным соусом из той же кастрюли.'],
  },
];



