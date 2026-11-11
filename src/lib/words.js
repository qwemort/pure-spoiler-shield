/*!
 * Pure Spoiler Shield — word lists and the matcher (pure functions; also used by the Node tests).
 *
 * How a block of text is judged:
 *   GAME   = the game is named (GTA 6 / GTA VI / Grand Theft Auto VI / ГТА 6 / #GTA6 …)
 *   UNIQUE = a name that only exists in this game (Jason Duval, Lucia Caminos, Leonida, Port Gellhorn …)
 *   COMMON = a name that is also an everyday word or name (Jason, Lucia, Cal, Vice City, Ambrosia …)
 *   SPOIL  = a spoiler word in 13 languages (ending, dies, final mission, leak, концовка, zakończenie, 结局 …)
 *   context = the page itself is about the game (watch page / post / thread title names it)
 *
 *   "Spoilers only"  : (GAME or UNIQUE or (COMMON and context)) and SPOIL
 *   "Everything"     : GAME or UNIQUE or (COMMON and context)
 *   Own words        : always
 *
 * The lists hold no real story spoilers: only the game's public names and general spoiler words.
 */
(function (g) {
  'use strict';
  const SS = g.SS || (g.SS = {});

  /** Lower case, accents removed, every non-letter/digit becomes one space. CJK stays as it is. */
  function plainNorm(s) {
    return ' ' + String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/([\p{L}\p{N}])[’'`´]s(?![\p{L}\p{N}])/gu, '$1 s').replace(/[’'`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }
  /**
   * Lower case, accents removed, every non-letter/digit becomes one space. CJK stays as it is.
   * 1.2: text to judge also gets the "decoded" forms of tricks people use to slip past filters, appended at the end
   * (the original words stay where they were, so episode numbers and phrases still work):
   *   "G T A 6", "G.T.A. 6" → gta6;  "3nding", "sp0iler" → ending, spoiler;  a Cyrillic letter inside a Latin word
   *   ("gtа" with a Russian а) and the other way round;  one typo in a strong spoiler word ("endin", "spolier").
   * plain = true: only the cleaning (word lists, own words, search box).
   */
  SS.normalize = function (s, plain) {
    const n = plainNorm(s);
    return plain ? n : n + decoded(n);
  };
  const CJK = /[぀-ヿ㐀-鿿가-힯ᄀ-ᇿ㄰-㆏]/;   // Hangul syllables become jamo after NFKD — those count as CJK too (Korean particles stick to words)

  // Cyrillic letters that look like Latin ones (and back): "gtа 6" typed with a Russian а, "спойлeр" with a Latin e
  const CYR2LAT = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's' };
  const LAT2CYR = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', y: 'у', x: 'х', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в', i: 'і' };
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
  // strong spoiler words that get one typo forgiven (≥5 letters, same first letter; "finale" is not here — "finals")
  const TYPO = ['ending', 'endings', 'spoiler', 'spoilers', 'leaked', 'betrayal', 'cutscene', 'epilogue', 'walkthrough', 'explained',
    'концовка', 'концовку', 'спойлер', 'спойлеры', 'кінцівка', 'спойлери', 'zakonczenie'];
  const TYPO_SET = new Set(TYPO);
  function oneEdit(a, b) {          // a ≠ b, true when one letter is changed, missing, extra or two neighbours are swapped
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1 || a[0] !== b[0]) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  const LAT = /[a-z]/, CYR = /[а-яёіїєґ]/;
  function decoded(n) {
    const toks = n.trim().split(' ');
    if (toks.length > 400) return '';                    // long texts: only the plain words (speed)
    const alt = []; let changed = false; let run = [];
    const flush = () => {
      if (run.length >= 3 && run.filter((x) => !/\d/.test(x)).length >= 2) { alt.push(run.join('')); changed = true; } else alt.push(...run);
      run = [];
    };
    for (const t of toks) {
      if (t.length === 1 && !CJK.test(t)) { run.push(t); continue; }
      flush();
      let x = t;
      if (t.length >= 2 && t.length <= 24 && !CJK.test(t)) {
        if (LAT.test(t) && CYR.test(t)) {                  // mixed alphabets inside one word → the alphabet most letters use
          const lat = (t.match(/[a-z]/g) || []).length, cyr = (t.match(/[а-яёіїєґ]/g) || []).length;
          x = lat >= cyr ? t.replace(/./g, (c) => CYR2LAT[c] || c) : t.replace(/./g, (c) => LAT2CYR[c] || c);
        }
        if (/[a-z]/.test(x) && /[013457]/.test(x) && !/^s\d|^e\d|^ep\d|^\d+[a-z]{1,2}$|^[a-z]{1,4}\d+$/.test(x)) {
          const l = x.replace(/[013457]/g, (c) => LEET[c]); if (/^[a-z]+$/.test(l) && l.length >= 4) x = l;
        }
        if (x.length >= 5 && x.length <= 12 && !TYPO_SET.has(x)) {
          for (const w of TYPO) if (oneEdit(x, w)) { x = w; break; }
        }
      }
      if (x !== t) changed = true;
      alt.push(x);
    }
    flush();
    return changed ? alt.join(' ') + ' ' : '';
  }

  function compile(list) {
    const words = []; const cjk = [];
    for (const raw of list) {
      const w = SS.normalize(raw, true).trim();
      if (!w) continue;
      if (CJK.test(w)) cjk.push(w); else words.push(w);
    }
    return { words: Array.from(new Set(words)), cjk: Array.from(new Set(cjk)) };
  }
  /** First matching entry, or ''. Latin/Cyrillic entries match whole words; CJK entries match anywhere. */
  function find(set, norm) {
    for (const w of set.words) if (norm.includes(' ' + w + ' ')) return w;
    for (const w of set.cjk) if (norm.includes(w)) return w;
    return '';
  }
  SS.compile = compile;
  SS.find = find;

  /* ------------------------------------------------------------------ the GTA VI set */
  const GAME = [
    'gta 6', 'gta6', 'gta vi', 'gtavi', 'gta 6s', 'gta6s', 'grand theft auto 6', 'grand theft auto vi',
    'гта 6', 'гта6', 'гта vi', 'гта 6го', 'гта 6ой', 'гта шесть', 'гта 6ку',
    'グランドセフトオート6', 'gta６', '侠盗猎车手6', '俠盜獵車手6', '그랜드 테프트 오토 6', '그타6', '그타 6'
  ];
  const UNIQUE = [
    'leonida', 'leonida keys', 'port gellhorn', 'grassrivers', 'mount kalaga',
    'jason duval', 'lucia caminos', 'cal hampton', 'boobie ike', 'dre quan priest', 'drequan priest',
    'real dimez', 'bae luxe', 'raul bautista', 'brian heder',
    'cyberleek', 'extended leek',
    'леонида', 'леоніда', 'люсия каминос', 'лусия каминос', 'люсія камінос', 'джейсон дюваль', 'джейсон дюваль',
    'порт гелхорн', 'порт геллхорн'
  ];
  const COMMON = [
    'jason', 'lucia', 'cal', 'boobie', 'raul', 'brian', 'roxy', 'dimez', 'vice city', 'ambrosia', 'little cuba',
    'ocean beach', 'rockstar', 'kortz', 'вайс сити', 'вайс-сити', 'вайс сіті', 'джейсон', 'люсия', 'лусия', 'люсія', 'рокстар'
  ];
  const SPOIL = [
    // English
    'ending', 'endings', 'ending explained', 'the end', 'final mission', 'last mission', 'final boss', 'final chapter',
    'finale', 'epilogue', 'post credits', 'credits scene', 'credits', 'secret ending', 'true ending', 'bad ending', 'good ending',
    'dies', 'died', 'death', 'dead', 'killed', 'kills', 'kill', 'murdered', 'betrays', 'betrayed', 'betrayal', 'traitor',
    'twist', 'plot twist', 'plot', 'story', 'storyline', 'full story', 'spoiler', 'spoilers', 'spoils',
    'cutscene', 'cutscenes', 'leak', 'leaks', 'leaked', 'leaker', 'story leak', 'gameplay leak', 'walkthrough', 'full game',
    'last scene', 'final scene', 'who dies', 'is dead', 'reveal', 'revealed', 'mission 1', 'chapter',
    // Русский
    'концовка', 'концовки', 'концовку', 'финал', 'финала', 'финальная миссия', 'последняя миссия', 'эпилог', 'титры',
    'умирает', 'умрет', 'умер', 'умерла', 'погибает', 'погиб', 'погибла', 'смерть', 'убил', 'убила', 'убили', 'убивают', 'убьют',
    'предательство', 'предал', 'предала', 'сюжет', 'сюжета', 'спойлер', 'спойлеры', 'спойлеров', 'слив', 'слили', 'утечка',
    'катсцена', 'катсцены', 'прохождение', 'чем закончится', 'чем закончилась', 'поворот',
    // Українська
    'кінцівка', 'кінцівки', 'кінцівку', 'фінал', 'фіналу', 'фінальна місія', 'остання місія', 'епілог', 'титри',
    'помирає', 'помре', 'помер', 'померла', 'гине', 'загинув', 'загинула', 'смерть', 'вбив', 'вбила', 'вбили', 'вбивають',
    'зрада', 'зрадив', 'зрадила', 'сюжет', 'сюжету', 'спойлер', 'спойлери', 'злив', 'злили', 'витік', 'катсцена', 'проходження',
    // Polski
    'zakonczenie', 'zakończenie', 'koniec gry', 'final', 'finał', 'ostatnia misja', 'epilog', 'napisy koncowe',
    'umiera', 'umrze', 'zginie', 'zginal', 'zginęła', 'smierc', 'śmierć', 'zabija', 'zabil', 'zabity', 'zdrada', 'zdradza',
    'fabula', 'fabuła', 'spoiler', 'spojler', 'spoilery', 'wyciek', 'przeciek', 'przerywnik', 'przejscie gry',
    // Deutsch
    'ende', 'das ende', 'finale', 'letzte mission', 'abspann', 'stirbt', 'gestorben', 'tod', 'getotet', 'getötet', 'verrat',
    'verrater', 'handlung', 'geschichte', 'wendung', 'spoiler', 'leak', 'geleakt', 'zwischensequenz', 'komplettlosung',
    // Español / Português
    'final', 'el final', 'ultima mision', 'última misión', 'muere', 'murio', 'murió', 'muerte', 'mata', 'traicion', 'traición',
    'trama', 'giro', 'filtracion', 'filtración', 'filtrado', 'cinematica', 'morre', 'morreu', 'morte', 'traicao', 'traição',
    'enredo', 'reviravolta', 'vazamento', 'vazou', 'ultima missao', 'última missão',
    // Français / Italiano
    'fin', 'la fin', 'derniere mission', 'dernière mission', 'meurt', 'mort', 'tue', 'trahison', 'intrigue', 'rebondissement',
    'fuite', 'muore', 'morto', 'morte', 'uccide', 'tradimento', 'trama', 'colpo di scena', 'ultima missione', 'finale',
    // Türkçe
    'son', 'oyunun sonu', 'son gorev', 'son görev', 'oluyor', 'ölüyor', 'oldu', 'öldü', 'olum', 'ölüm', 'ihanet', 'hikaye', 'sizinti', 'sızıntı',
    // 日本語 / 中文 / 한국어
    'エンディング', '結末', 'ラスボス', '最終ミッション', '死亡', '死ぬ', 'ネタバレ', 'リーク', '流出',
    '结局', '結局', '剧透', '劇透', '最终任务', '死亡', '泄露', '泄漏', '剧情',
    '엔딩', '결말', '스포', '스포일러', '사망', '죽음', '유출', '마지막 미션'
  ];

  SPOIL.push('season finale', 'series finale', 'finale episode', 'post credit', 'post credits scene', 'mid credits', 'mid credit scene',
    'manga spoilers', 'novel spoilers', 'book spoilers', 'leaked chapter', 'raw scans', 'raws', 'who survives', 'ending scene', 'last episode',
    'финал сезона', 'последняя серия', 'сцена после титров', 'фінал сезону', 'остання серія', 'scena po napisach', 'ostatni odcinek');
  // 1.1: how anime and series get spoiled — power-ups, new forms, comebacks (13 languages)
  SPOIL.push('awakens', 'awakening', 'awakened', 'new form', 'final form', 'true form', 'transformation', 'transforms', 'power up', 'powers up', 'new power',
    'true identity', 'identity revealed', 'resurrected', 'revived', 'comes back to life', 'is alive', 'survives',
    'пробуждает', 'пробуждение', 'пробудил', 'пробудила', 'новая форма', 'финальная форма', 'истинная форма', 'трансформация', 'превращается',
    'новая сила', 'получил силу', 'воскрес', 'воскресла', 'воскрешение', 'выжил', 'выжила', 'настоящая личность', 'раскрыта личность',
    'пробуджує', 'пробудження', 'нова форма', 'справжня форма', 'трансформація', 'нова сила', 'воскрес', 'воскресла', 'вижив', 'вижила',
    'przebudzenie', 'nowa forma', 'prawdziwa forma', 'transformacja', 'nowa moc', 'wskrzeszony', 'przezyl', 'przeżył',
    'erwacht', 'erwachen', 'neue form', 'wahre form', 'verwandlung', 'neue kraft', 'wiederbelebt', 'uberlebt', 'überlebt',
    'eveil', 'éveil', 'nouvelle forme', 'vraie forme', 'nouveau pouvoir', 'ressuscite', 'survit',
    'despierta', 'despertar', 'nueva forma', 'forma final', 'transformacion', 'transformación', 'nuevo poder', 'resucita', 'sobrevive',
    'desperta', 'nova forma', 'transformacao', 'transformação', 'novo poder', 'ressuscita', 'sobrevive',
    'risveglio', 'si risveglia', 'nuova forma', 'vera forma', 'trasformazione', 'nuovo potere', 'resuscita', 'sopravvive',
    'uyanis', 'uyanış', 'yeni form', 'gercek form', 'gerçek form', 'donusum', 'dönüşüm', 'yeni guc', 'yeni güç', 'diriliyor',
    '覚醒', '新形態', '真の姿', '復活', '觉醒', '新形态', '真身', '复活', '각성', '새로운 형태', '부활');
  // 1.2: family reveals — "son of Roger", "Luffy's father", "ван пис сын роджера" (Антон 06.11)
  SPOIL.push('son of', 'daughter of', 'father of', 'mother of', 'is the son', 'is the father', 'real father', 'true father', 'real mother',
    'his father', 'her father', 'related to', 'сын', 'сына', 'сыном', 'дочь', 'дочери', 'настоящий отец', 'отец луффи', 'син', 'сина', 'донька',
    'справжній батько', 'syn', 'syna', 'córka', 'corka', 'prawdziwy ojciec', 'sohn von', 'tochter von', 'hijo de', 'hija de', 'fils de', 'figlio di',
    '息子', '父親', '儿子', '父亲', '아들', '아버지');
  // 1.2: plot retold in a search snippet — "Санджи … чтобы раз и навсегда победить его … появляется Ника" (Антон 06.11)
  SPOIL.push('defeats', 'defeated', 'finally defeats', 'is defeated', 'wins against', 'победить', 'победил', 'победила', 'побеждает', 'побеждён', 'побежден',
    'одолел', 'одолела', 'раз и навсегда', 'перемагає', 'переміг', 'перемогла', 'pokonuje', 'pokonal', 'pokonał', 'besiegt', 'vence a', 'derrota a', 'vainc', 'sconfigge',
    '倒す', '倒した', '打败', '击败', '이긴다', '쓰러뜨린다');
  const SPOIL_SET = compile(SPOIL);

  /*
   * 1.2: weak spoiler words. Alone they mean nothing ("The Final Big Preview", "Rockstar Just Revealed … gameplay",
   * "final trailer", "story trailer"): they count only when the text is not about a trailer/preview/release/price/news.
   * Strong words (ending, dies, leak, spoiler …) count always. Same rule for every list.
   */
  const WEAK = ['final', 'reveal', 'revealed', 'story', 'storyline', 'full story', 'plot', 'chapter', 'credits', 'the end', 'fin', 'la fin',
    'son', 'ende', 'das ende', 'el final', 'finał', 'finał', 'trama', 'giro', 'enredo', 'hikaye', 'geschichte', 'handlung', 'intrigue',
    'tue', 'mata', 'full game', 'сюжет', 'сюжета', 'сюжету', 'финал', 'финала', 'фінал', 'фіналу', 'fabula', 'fabuła', '剧情'];
  const MARKETING = ['trailer', 'trailers', 'teaser', 'teasers', 'preview', 'previews', 'gameplay', 'release', 'release date', 'released',
    'launch', 'launches', 'price', 'prices', 'pre order', 'preorder', 'pre orders', 'details', 'news', 'update', 'showcase', 'map', 'graphics',
    'edition', 'reaction', 'reacts', 'review', 'reviews', 'screenshot', 'screenshots', 'announcement', 'announced', 'confirmed', 'rumor',
    'rumors', 'rumour', 'rumours', 'everything we know', 'missed', 'tráiler', 'avance', 'precio', 'jugabilidad', 'vorschau', 'preis',
    'трейлер', 'трейлера', 'тизер', 'геймплей', 'дата выхода', 'цена', 'обзор', 'новости', 'превью', 'анонс', 'реакция', 'графика', 'карта',
    'дата виходу', 'ціна', 'огляд', 'новини', 'реакція', 'zwiastun', 'recenzja', 'cena', 'premiera', 'data premiery', 'zapowiedz', 'zapowiedź',
    'rozgrywka', 'bande annonce', '予告', 'トレーラー', '発売日', '预告', '发售日', '예고편', '트레일러'];
  const WEAK_N = new Set(WEAK.map((x) => SS.normalize(x, true).trim()));
  const STRONG_SET = compile(SPOIL.filter((x) => !WEAK_N.has(SS.normalize(x, true).trim())));
  const WEAK_SET = compile(WEAK);
  const MARKETING_SET = compile(MARKETING);
  /** Is there a spoiler word? Strong — always; weak — only when the text is not about trailers, release, price, news. */
  SS.hasSpoiler = function (norm, strongOnly) {
    if (find(STRONG_SET, norm)) return true;
    if (strongOnly) return false;                    // 1.3 "light" level: only the strong words
    return !!find(WEAK_SET, norm) && !find(MARKETING_SET, norm);
  };
  /** 1.3: three free levels. light = strong spoiler words only; spoilers (medium) = strong + weak; everything (hard) = any mention. */
  SS.level = function (m) { return m === 'everything' ? 'everything' : m === 'light' ? 'light' : 'spoilers'; };

  /*
   * Phrases that say the opposite: "no spoilers", "spoiler-free review", "ending theme". They are cut out before the
   * spoiler words are looked for (only in "spoilers only": "everything" still hides any mention).
   */
  const SAFE = ['no spoilers', 'no spoiler', 'spoiler free', 'spoilerfree', 'spoilers free', 'without spoilers', 'non spoiler', 'zero spoilers',
    'ending theme', 'ending song', 'opening and ending', 'opening ending', 'ending full', 'never ending', 'neverending',
    'без спойлеров', 'без спойлера', 'без спойлерів', 'без спойлеру', 'bez spoilerow', 'bez spoilerów', 'bez spojlerow',
    'ohne spoiler', 'spoilerfrei', 'sans spoiler', 'sans spoilers', 'sin spoilers', 'sin spoiler', 'sem spoilers', 'sem spoiler',
    'senza spoiler', 'spoilersiz', 'spoiler yok', 'ネタバレなし', 'ネタバレ無し', 'ネタバレ無', '无剧透', '無劇透', '不剧透', '스포 없음', '스포없음', '노스포'];
  const SAFE_NORM = SAFE.map((x) => SS.normalize(x, true).trim()).filter(Boolean);
  SS.stripSafe = function (norm) {
    let s = norm;
    for (const p of SAFE_NORM) {
      if (CJK.test(p)) s = s.split(p).join(' ');
      else s = s.split(' ' + p + ' ').join('  ');
    }
    return s;
  };

  /*
   * Episode and chapter numbers in a text: "episode 12", "ep 12", "chapter 1197", "серия 12", "1197 глава", "s2e5",
   * "第12話", "12화", and "<title> 1197" (anime titles are often followed by the chapter number).
   */
  const EP_WORDS = 'episodes?|eps?|chapters?|chap|ch|серия|серии|серию|эпизод|эпизода|эпизоде|глава|главы|главе|главу|серія|серії|серію|епізод|епізоду|розділ|розділу|odcinek|odcinka|odc|rozdział|rozdzial|rozdziału|rozdzialu|folge|kapitel|chapitre|episode|capitulo|capítulo|episodio|capitolo|puntata|bolum|bolumu|bölüm|bölümü';
  const EP_AFTER = new RegExp(' (?:' + EP_WORDS + ') (?:no |nr |n )?(\\d{1,5})(?= )', 'g');
  const EP_BEFORE = new RegExp(' (\\d{1,5}) (?:' + EP_WORDS + ')(?= )', 'g');
  const EP_SE = / s\d{1,2} ?e(\d{1,4})(?= )/g;
  // Hangul is decomposed by normalize() (NFKD), so the Korean suffixes are decomposed here too
  const EP_CJK = new RegExp('第\\s?(\\d{1,5})\\s?[話话集章回]|(\\d{1,5})\\s?(?:話|话|集|章|' + ['화', '편', '회'].map((x) => x.normalize('NFKD')).join('|') + ')', 'g');
  SS.episodes = function (norm, titles) {
    const out = [];
    const add = (x) => { const n = parseInt(x, 10); if (n > 0 && n < 100000) out.push(n); };
    for (const re of [EP_AFTER, EP_BEFORE, EP_SE]) { re.lastIndex = 0; for (let m = re.exec(norm); m; m = re.exec(norm)) add(m[1]); }
    EP_CJK.lastIndex = 0; for (let m = EP_CJK.exec(norm); m; m = EP_CJK.exec(norm)) add(m[1] || m[2]);
    if (titles) {
      for (const w of titles.words) {
        if (/\d$/.test(w)) continue;                       // "gta 6", "dune 3": the number is the title
        const at = norm.indexOf(' ' + w + ' ');
        if (at < 0) continue;
        const m = /^ (\d{2,5}) /.exec(norm.slice(at + w.length + 1));
        if (m) { const n = +m[1]; if (n < 1900 || n > 2100) add(m[1]); }   // not a year
      }
    }
    return out;
  };

  /*
   * Ready-made shields (all free since 1.1). Only names that were public in trailers / announcements or long-known
   * source material — never story details. kind: game | movie | show | anime.
   *   game   — titles (any spelling, any language): enough on their own in "everything"
   *   unique — names that point only to this title (Luffy, Rhaenyra): enough on their own in "everything"
   *   common — names that are also ordinary words or other people (Nami, Thor): only on a page about the title
   * Titles that are ordinary phrases ("the boys", "severance") are given only in unambiguous forms.
   */
  const LIB = [
    // ---------------------------------------------------------------- games
    { id: 'gta6', label: 'GTA VI', kind: 'game', game: GAME, unique: UNIQUE, common: COMMON },
    { id: 'wolverine', label: 'Marvel’s Wolverine', kind: 'game', game: ['marvels wolverine', 'marvel s wolverine', 'wolverine ps5', 'wolverine game', 'insomniac wolverine', 'росомаха игра', 'росомаха ps5', 'росомаха гра'], unique: [], common: ['wolverine', 'logan', 'росомаха', 'логан'] },
    { id: 're-requiem', label: 'Resident Evil Requiem', kind: 'game', game: ['resident evil requiem', 're requiem', 'resident evil 9', 're9', 'biohazard requiem', 'резидент эвил реквием', 'резидент ивел реквием', 'обитель зла реквием', 'バイオハザード レクイエム', '生化危机 安魂曲', '레지던트 이블 레퀴엠'], unique: ['grace ashcroft', 'грейс эшкрофт'], common: ['grace', 'raccoon city', 'leon kennedy', 'leon', 'раккун сити', 'леон'] },
    { id: 'gears-eday', label: 'Gears of War: E-Day', kind: 'game', game: ['gears of war e day', 'gears e day', 'gears of war eday', 'gow e day', 'gears of war 6', 'gears 6', 'gears of war день е'], unique: ['marcus fenix', 'dom santiago', 'dominic santiago', 'маркус феникс'], common: ['marcus', 'locust', 'emergence day', 'маркус'] },
    { id: 'ghost-yotei', label: 'Ghost of Yōtei', kind: 'game', game: ['ghost of yotei', 'ghost of yōtei', 'призрак ётэй', 'призрак йотей', 'привид йотей', 'ゴースト・オブ・ヨウテイ', '羊蹄山之魂', '고스트 오브 요테이'], unique: ['yotei six', 'шестерка йотей'], common: ['atsu', 'ezo', 'ацу'] },
    // ---------------------------------------------------------------- movies
    { id: 'avengers-doomsday', label: 'Avengers: Doomsday', kind: 'movie', game: ['avengers doomsday', 'avengers 5', 'мстители судный день', 'мстители 5', 'месники судний день', 'месники 5', 'avengers doomsday trailer', 'アベンジャーズ ドゥームズデイ', '复仇者联盟 毁灭日', '어벤져스 둠스데이'], unique: ['victor von doom', 'doctor doom', 'dr doom', 'доктор дум', 'доктор думм', 'віктор фон дум'], common: ['doom', 'thor', 'loki', 'captain america', 'steve rogers', 'fantastic four', 'x men', 'thunderbolts', 'mcu', 'тор', 'локи', 'капитан америка', 'фантастическая четверка', 'люди икс'] },
    { id: 'dune-3', label: 'Dune: Part Three', kind: 'movie', game: ['dune part three', 'dune part 3', 'dune 3', 'dune messiah', 'дюна часть третья', 'дюна часть 3', 'дюна 3', 'дюна мессия', 'дюна частина третя', 'diuna czesc trzecia', 'デューン 砂の惑星 part3', '沙丘3', '듄 파트 3'], unique: ['paul atreides', 'muad dib', 'muaddib', 'leto ii', 'alia atreides', 'пол атрейдес', 'муад диб', 'атрейдес', 'atreides', 'arrakis', 'арракис', 'fremen', 'фремены'], common: ['paul', 'chani', 'alia', 'irulan', 'чани', 'алия', 'пол'] },
    { id: 'hunger-games-reaping', label: 'The Hunger Games: Sunrise on the Reaping', kind: 'movie', game: ['sunrise on the reaping', 'hunger games sunrise', 'голодные игры рассвет жатвы', 'голодные игры восход', 'голодні ігри світанок жнив', 'голодні ігри'], unique: ['haymitch abernathy', 'lenore dove', 'maysilee donner', 'хеймитч эбернети', 'хеймитч'], common: ['haymitch', 'snow', 'panem', 'district 12', 'сноу', 'панем', 'дистрикт 12'] },
    { id: 'godzilla-minus-zero', label: 'Godzilla Minus Zero', kind: 'movie', game: ['godzilla minus zero', 'godzilla 0 0', 'godzilla minus 0', 'годзилла минус ноль', 'ґодзілла мінус нуль', 'годзілла мінус нуль', 'ゴジラ 0 0', 'ゴジラマイナスゼロ', '哥斯拉 负零'], unique: ['koichi shikishima', 'коити сикисима'], common: ['godzilla', 'годзилла', 'годзілла', 'ゴジラ', '哥斯拉'] },
    { id: 'spider-man-bnd', label: 'Spider-Man: Brand New Day', kind: 'movie', game: ['spider man brand new day', 'spiderman brand new day', 'spider man 4', 'spiderman 4', 'человек паук совершенно новый день', 'человек паук новый день', 'человек паук 4', 'людина павук новий день', 'людина павук 4', 'スパイダーマン ブランニューデイ', '蜘蛛侠 全新的一天'], unique: ['peter parker', 'питер паркер', 'пітер паркер'], common: ['spider man', 'spiderman', 'человек паук', 'людина павук', 'mj', 'punisher', 'hulk', 'каратель', 'халк'] },
    // ---------------------------------------------------------------- shows
    { id: 'rings-of-power', label: 'The Rings of Power', kind: 'show', game: ['rings of power', 'кольца власти', 'персні влади', 'pierscienie wladzy', 'die ringe der macht', 'les anneaux de pouvoir', 'los anillos de poder', 'os aneis de poder', 'gli anelli del potere', 'güç yüzükleri', '力の指輪', '力量之戒', '힘의 반지'], unique: ['annatar', 'celebrimbor', 'galadriel', 'elrond', 'isildur', 'sauron', 'saruman', 'mordor', 'numenor', 'аннатар', 'келебримбор', 'галадриэль', 'элронд', 'исильдур', 'саурон', 'саруман', 'мордор', 'нуменор'], common: ['durin', 'the stranger', 'adar', 'дурин', 'адар'] },
    { id: 'percy-jackson', label: 'Percy Jackson and the Olympians', kind: 'show', game: ['percy jackson', 'перси джексон', 'персі джексон', 'percy jackson season 3', 'パーシー・ジャクソン', '波西杰克逊'], unique: ['annabeth chase', 'grover underwood', 'luke castellan', 'thalia grace', 'annabeth', 'camp half blood', 'аннабет', 'лагерь полукровок', 'табір напівкровок'], common: ['percy', 'grover', 'thalia', 'luke', 'kronos', 'tyson', 'перси', 'гровер', 'талия', 'кронос'] },
    { id: 'yellowjackets', label: 'Yellowjackets', kind: 'show', game: ['yellowjackets', 'шершни сериал', 'шершні серіал', 'yellowjackets season 4'], unique: ['shauna shipman', 'taissa turner', 'misty quigley', 'lottie matthews', 'natalie scatorccio', 'van palmer', 'шона шипман', 'мисти куигли'], common: ['shauna', 'taissa', 'misty', 'lottie', 'natalie', 'van', 'jackie', 'шона', 'тайсса', 'мисти', 'лотти'] },
    { id: 'house-dragon', label: 'House of the Dragon', kind: 'show', game: ['house of the dragon', 'дом дракона', 'дім дракона', 'rod smoka', 'ród smoka', 'hotd', 'haus des drachen', 'la maison du dragon', 'la casa del dragon', 'a casa do dragao', 'ハウス・オブ・ザ・ドラゴン', '龙之家族', '하우스 오브 드래곤'], unique: ['rhaenyra', 'aemond', 'alicent hightower', 'alicent', 'daemon targaryen', 'aegon ii', 'targaryen', 'dragonstone', 'рейнира', 'эймонд', 'алисента', 'деймон таргариен', 'таргариен', 'таргарієн', 'драконий камень'], common: ['daemon', 'aegon', 'criston cole', 'otto hightower', 'деймон', 'эйгон', 'кристон коль'] },
    { id: 'last-of-us', label: 'The Last of Us', kind: 'show', game: ['the last of us', 'tlou', 'tlou2', 'одни из нас', 'одні з нас', 'last of us part ii', 'last of us season 3', 'ラスト・オブ・アス', '最后生还者', '라스트 오브 어스'], unique: ['abby anderson', 'ellie williams', 'joel miller', 'seraphites', 'серафиты'], common: ['ellie', 'abby', 'joel', 'dina', 'lev', 'wlf', 'fireflies', 'элли', 'эбби', 'джоэл', 'дина', 'цикады'] },
    { id: 'black-doves', label: 'Black Doves', kind: 'show', game: ['black doves', 'черные голуби', 'чорні голуби', 'czarne golebie', 'ブラック・ダブス'], unique: ['helen webb', 'хелен уэбб'], common: ['helen', 'sam young', 'reed', 'хелен'] },
    { id: 'the-boys', label: 'The Boys', kind: 'show', game: ['the boys season 5', 'the boys s5', 'the boys final season', 'the boys finale', 'the boys amazon', 'пацаны 5 сезон', 'пацаны сериал', 'хлопаки 5 сезон', 'хлопаки серіал', 'ザ・ボーイズ', '黑袍纠察队'], unique: ['homelander', 'billy butcher', 'hughie campbell', 'soldier boy', 'хоумлендер', 'билли бучер', 'хьюи кэмпбелл'], common: ['butcher', 'солдатик', 'hughie', 'starlight', 'a train', 'the deep', 'vought', 'kimiko', 'бучер', 'хьюи', 'старлайт', 'воут'] },
    { id: 'severance', label: 'Severance', kind: 'show', game: ['severance season', 'severance s2', 'severance s3', 'severance finale', 'severance apple tv', 'разделение сериал', 'разделение 3 сезон', 'розділення серіал', 'セヴェランス', '人生切割术'], unique: ['lumon', 'helly r', 'mark scout', 'helena eagan', 'mark s', 'люмон', 'хелли'], common: ['mark', 'helly', 'irving', 'dylan', 'milchick', 'cobel', 'kier', 'марк', 'ирвинг', 'дилан'] },
    // ---------------------------------------------------------------- anime
    { id: 'one-piece', label: 'One Piece', kind: 'anime', game: ['one piece', 'onepiece', 'ван пис', 'ван піс', 'ванпис', 'ワンピース', '海贼王', '航海王', '원피스'], unique: ['monkey d luffy', 'luffy', 'roronoa zoro', 'zoro', 'sanji', 'usopp', 'tony tony chopper', 'nico robin', 'shanks', 'straw hats', 'straw hat pirates', 'joy boy', 'imu', 'imu sama', 'marshall d teach', 'gear 5', 'gear fifth', 'sun god nika', 'elbaph', 'vegapunk', 'gorosei', 'луффи', 'монки д луффи', 'зоро', 'ророноа зоро', 'санджи', 'усопп', 'нико робин', 'шанкс', 'соломенные шляпы', 'джой бой', 'имму', 'гир 5', 'вегапанк', 'эльбаф', 'ルフィ', 'ゾロ', 'サンジ', 'シャンクス', '路飞', '索隆', '香吉士', '루피', '조로'], common: ['nami', 'chopper', 'egghead', 'чоппер', 'franky', 'brook', 'jinbe', 'blackbeard', 'garp', 'kizaru', 'robin', 'нами', 'фрэнки', 'брук', 'джимбей', 'черная борода', 'гарп', 'кизару'] },
    { id: 'jjk', label: 'Jujutsu Kaisen', kind: 'anime', game: ['jujutsu kaisen', 'jjk', 'магическая битва', 'магічна битва', '呪術廻戦', '咒术回战', '주술회전'], unique: ['yuji itadori', 'itadori', 'satoru gojo', 'gojo satoru', 'gojo', 'ryomen sukuna', 'sukuna', 'megumi fushiguro', 'nobara kugisaki', 'nobara', 'kenjaku', 'yuta okkotsu', 'culling game', 'юдзи итадори', 'итадори', 'годзё', 'годзе', 'годжо', 'сатору годзё', 'сукуна', 'мэгуми фусигуро', 'нобара', 'кэндзяку', 'юта оккоцу', '虎杖', '五条悟', '宿儺', '宿傩'], common: ['megumi', 'yuta', 'toji', 'maki', 'мэгуми', 'юта', 'тодзи', 'маки'] },
    { id: 'chainsaw-man', label: 'Chainsaw Man', kind: 'anime', game: ['chainsaw man', 'человек бензопила', 'людина бензопила', 'チェンソーマン', '电锯人', '체인소 맨'], unique: ['denji', 'makima', 'aki hayakawa', 'asa mitaka', 'yoru', 'reze', 'pochita', 'дэндзи', 'денджи', 'макима', 'аки хаякава', 'аса митака', 'резе', 'почита'], common: ['power', 'aki', 'asa', 'kobeni', 'пауэр', 'аки', 'кобени'] },
    { id: 'frieren', label: 'Frieren', kind: 'anime', game: ['sousou no frieren', 'frieren anime', 'frieren season', 'frieren staffel', 'frieren episode', 'frieren beyond journeys end', 'фрирен', 'фрірен', 'провожающая в последний путь фрирен', '葬送のフリーレン', '葬送的芙莉莲', '장송의 프리렌'], unique: ['химмель', 'айзен', 'хайтер', 'махт', 'фрирен'], common: ['himmel', 'eisen', 'heiter', 'macht', 'serie', 'ubel', 'fern', 'stark', 'sein', 'frieren', 'ферн', 'штарк'] },
    { id: 'solo-leveling', label: 'Solo Leveling', kind: 'anime', game: ['solo leveling', 'поднятие уровня в одиночку', 'соло левелинг', 'поднятие уровня', 'підняття рівня наодинці', '俺だけレベルアップな件', '我独自升级', '나 혼자만 레벨업'], unique: ['sung jinwoo', 'sung jin woo', 'jinwoo', 'jin woo', 'cha hae in', 'shadow monarch', 'beru', 'igris', 'сон джин ву', 'сун джину', 'джину', 'монарх теней', 'беру', 'игрис'], common: ['monarch', 'architect', 'монарх', 'архитектор'] },
    { id: 'demon-slayer', label: 'Demon Slayer', kind: 'anime', game: ['demon slayer', 'kimetsu no yaiba', 'infinity castle', 'клинок рассекающий демонов', 'истребитель демонов', 'клинок що розтинає демонів', 'бескрайний замок', '鬼滅の刃', '鬼灭之刃', '귀멸의 칼날'], unique: ['tanjiro kamado', 'tanjiro', 'nezuko kamado', 'nezuko', 'muzan kibutsuji', 'muzan', 'kokushibo', 'douma', 'akaza', 'zenitsu', 'inosuke', 'giyu', 'hashira', 'танджиро', 'тандзиро', 'нэдзуко', 'незуко', 'музан', 'кокушибо', 'кокусибо', 'доума', 'аказа', 'зеницу', 'иноске', 'гию', 'хаширы', '炭治郎', '禰豆子', '無惨'], common: ['shinobu', 'rengoku', 'tengen', 'шинобу', 'ренгоку'] },
    { id: 'apothecary', label: 'The Apothecary Diaries', kind: 'anime', game: ['apothecary diaries', 'kusuriya no hitorigoto', 'монолог фармацевта', 'монолог травницы', 'монолог фармацевтки', '薬屋のひとりごと', '药屋少女的呢喃', '약사의 혼잣말'], unique: ['maomao', 'jinshi', 'маомао', 'жэньши', 'дзинси', '猫猫', '壬氏'], common: ['gaoshun', 'lakan', 'гаошунь', 'лакан'] },
    { id: 'edgerunners-2', label: 'Cyberpunk: Edgerunners 2', kind: 'anime', game: ['edgerunners 2', 'cyberpunk edgerunners 2', 'киберпанк бегущие по краю 2', 'кіберпанк ті що біжать по краю 2', 'サイバーパンク エッジランナーズ 2', '赛博朋克 边缘行者 2'], unique: [], common: ['night city', 'edgerunners', 'найт сити'] },
    { id: 'jojo-sbr', label: 'JoJo: Steel Ball Run', kind: 'anime', game: ['steel ball run', 'jojo part 7', 'jojos bizarre adventure', 'jojo bizarre adventure', 'стил бол ран', 'невероятные приключения джоджо', 'ジョジョ', 'スティール・ボール・ラン', '飙马野郎'], unique: ['johnny joestar', 'gyro zeppeli', 'funny valentine', 'diego brando', 'джонни джостар', 'джайро цеппели', 'фанни валентайн'], common: ['johnny', 'gyro', 'valentine', 'diego', 'jojo', 'джоджо', 'джайро'] },
    { id: 'black-clover', label: 'Black Clover', kind: 'anime', game: ['black clover', 'черный клевер', 'чёрный клевер', 'чорна конюшина', 'ブラッククローバー', '黑色五叶草', '블랙 클로버'], unique: ['asta', 'yuno grinberryall', 'yami sukehiro', 'noelle silva', 'julius novachrono', 'lucius zogratis', 'black bulls', 'аста', 'юно', 'ями сукэхиро', 'ноэль сильва', 'черные быки'], common: ['yuno', 'yami', 'noelle', 'lucius', 'liebe', 'ями', 'ноэль'] },
    { id: 'sakamoto-days', label: 'Sakamoto Days', kind: 'anime', game: ['sakamoto days', 'дни сакамото', 'сакамото дейз', 'サカモトデイズ', '坂本日常', '사카모토 데이즈'], unique: ['taro sakamoto', 'shin asakura', 'lu xiaotang', 'nagumo', 'таро сакамото', 'синь асакура', 'нагумо'], common: ['sakamoto', 'shin', 'slur', 'order', 'сакамото', 'шин'] },
    { id: 'one-punch-man', label: 'One-Punch Man', kind: 'anime', game: ['one punch man', 'onepunch man', 'ванпанчмен', 'ван панч мен', 'ванпачмен', 'ワンパンマン', '一拳超人', '원펀맨'], unique: ['saitama', 'genos', 'garou', 'tatsumaki', 'сайтама', 'генос', 'гароу', 'тацумаки', 'サイタマ'], common: ['king', 'bang', 'fubuki', 'sonic', 'blast', 'кинг', 'фубуки'] },
    { id: 'dragon-ball', label: 'Dragon Ball', kind: 'anime', game: ['dragon ball super', 'dragon ball daima', 'dragon ball', 'драгонболл', 'драгон болл', 'жемчуг дракона', 'перли дракона', 'ドラゴンボール', '龙珠', '七龙珠', '드래곤볼'], unique: ['son goku', 'goku', 'vegeta', 'beerus', 'whis', 'gohan', 'frieza', 'гоку', 'сон гоку', 'вегета', 'бирус', 'вис', 'гохан', 'фриза', '悟空', 'ベジータ'], common: ['piccolo', 'trunks', 'broly', 'goten', 'пикколо', 'транкс', 'броли'] },
    { id: 'tokyo-revengers', label: 'Tokyo Revengers', kind: 'anime', game: ['tokyo revengers', 'токийские мстители', 'токійські месники', '東京リベンジャーズ', '东京复仇者', '도쿄 리벤저스'], unique: ['takemichi hanagaki', 'manjiro sano', 'mikey sano', 'draken', 'keisuke baji', 'hinata tachibana', 'tokyo manji', 'такемичи', 'дракен', 'тосва'], common: ['mikey', 'майки', 'takemichi', 'toman', 'baji', 'chifuyu', 'хината'] },
    { id: 'golden-kamuy', label: 'Golden Kamuy', kind: 'anime', game: ['golden kamuy', 'золотое божество', 'золотий камуй', 'ゴールデンカムイ', '黄金神威', '골든 카무이'], unique: ['saichi sugimoto', 'asirpa', 'tokushiro tsurumi', 'hijikata toshizo', 'асирпа', 'сугимото', 'цуруми'], common: ['sugimoto', 'shiraishi', 'ogata', 'tsurumi', 'огата', 'сираиси'] },
    { id: 'boruto', label: 'Boruto: Two Blue Vortex', kind: 'anime', game: ['boruto two blue vortex', 'boruto', 'боруто', 'ボルト', '博人传', '보루토'], unique: ['boruto uzumaki', 'kawaki', 'sarada uchiha', 'eida', 'каваки', 'сарада', 'эйда'], common: ['naruto', 'sasuke', 'himawari', 'code', 'kara', 'наруто', 'саске', 'химавари'] },
    { id: 'kaiju-8', label: 'Kaiju No. 8', kind: 'anime', game: ['kaiju no 8', 'kaiju number 8', 'kaiju n8', 'кайдзю номер восемь', 'кайдзю 8', 'кайдзю номер 8', '怪獣8号', '怪兽8号', '괴수 8호'], unique: ['kafka hibino', 'mina ashiro', 'kikoru shinomiya', 'reno ichikawa', 'кафка хибино', 'мина асиро', 'кикору'], common: ['kafka', 'kikoru', 'narumi', 'reno', 'кафка', 'наруми'] },
    // 1.2 (06.11.2026): new ready lists
    { id: 'harry-potter-hbo', label: 'Harry Potter (HBO series)', kind: 'show', game: ['harry potter hbo', 'hbo harry potter', 'harry potter series', 'harry potter tv series', 'harry potter and the philosophers stone series', 'harry potter 2026', 'harry potter max', 'гарри поттер сериал', 'гарри поттер hbo', 'гаррі поттер серіал', 'harry potter serial', 'ハリー・ポッター ドラマ', '哈利波特 剧集'], unique: ['dominic mclaughlin', 'alastair stout', 'arabella stanton', 'john lithgow dumbledore', 'paapa essiedu', 'janet mcteer', 'nick frost hagrid', 'доминик маклафлин', 'пааппа эссиеду', 'ник фрост хагрид'], common: ['harry potter', 'hermione', 'dumbledore', 'snape', 'hagrid', 'hogwarts', 'voldemort', 'mcgonagall', 'ron weasley', 'гарри поттер', 'гермиона', 'дамблдор', 'снейп', 'хагрид', 'хогвартс', 'волан-де-морт', 'воландеморт', 'гаррі поттер', 'герміона', 'дамблдор', 'снейп', 'гоґвортс'] },
    { id: 'blade-runner-2099', label: 'Blade Runner 2099', kind: 'show', game: ['blade runner 2099', 'бегущий по лезвию 2099', 'той, хто біжить по лезу 2099', 'blade runner prime video', 'блейд раннер 2099'], unique: ['olwen blade runner', 'cora blade runner', 'michelle yeoh blade runner', 'hunter schafer blade runner', 'dimitri abold', 'lewis gribben'], common: ['olwen', 'cora', 'replicant', 'replicants', 'blade runner', 'репликант', 'репликанты', 'репліканти', 'michelle yeoh', 'hunter schafer'] },
    { id: 'only-murders', label: 'Only Murders in the Building', kind: 'show', game: ['only murders in the building season 6', 'only murders season 6', 'only murders s6', 'omitb season 6', 'omitb s6', 'only murders in the building', 'убийства в одном здании 6 сезон', 'убийства в одном здании', 'вбивства в одній будівлі'], unique: ['charles haden savage', 'oliver putnam', 'mabel mora', 'loretta durkin', 'чарльз хейден сэвидж', 'оливер патнэм', 'мэйбл мора'], common: ['charles', 'oliver', 'mabel', 'steve martin', 'martin short', 'selena gomez', 'arconia', 'аркония', 'чарльз', 'оливер', 'мэйбл', 'мейбл', 'cinda canning', 'howard morris'] },
    { id: 'bad-monkey', label: 'Bad Monkey', kind: 'show', game: ['bad monkey season 2', 'bad monkey s2', 'bad monkey apple tv', 'bad monkey series', 'плохая обезьяна сериал', 'погана мавпа серіал'], unique: ['andrew yancy', 'rosa campesino', 'evan shook', 'neville stafford', 'vince vaughn bad monkey', 'эндрю янси', 'роза кампесино'], common: ['yancy', 'rogelio', 'caitlin', 'spencer', 'delaney', 'dragon queen', 'john malkovich', 'yvonne strahovski', 'янси'] },
    { id: 'hunting-wives', label: 'The Hunting Wives', kind: 'show', game: ['the hunting wives season 2', 'hunting wives season 2', 'hunting wives s2', 'the hunting wives', 'hunting wives netflix', 'жены охотников сериал', 'мисливські дружини'], unique: ['sophie oneil', 'margo banks', 'jed banks', 'deputy walter flynn', 'wanda salazar', 'софи онил', 'марго бэнкс'], common: ['sophie', 'margo', 'jed', 'graham', 'callie', 'starr', 'brad', 'brittany snow', 'malin akerman', 'софи', 'марго'] },
    { id: 'dune-prophecy', label: 'Dune: Prophecy', kind: 'show', game: ['dune prophecy season 2', 'dune prophecy s2', 'dune prophecy', 'дюна пророчество 2 сезон', 'дюна пророчество', 'дюна пророцтво'], unique: ['valya harkonnen', 'tula harkonnen', 'desmond hart', 'emily watson dune', 'валя харконнен', 'тула харконнен'], common: ['valya', 'tula', 'desmond', 'harkonnen', 'sisterhood', 'сестринство', 'харконнен', 'валя'] },
    { id: 'pride-prejudice-netflix', label: 'Pride and Prejudice (Netflix)', kind: 'show', game: ['pride and prejudice netflix', 'pride and prejudice series', 'pride and prejudice 2026', 'гордость и предубеждение сериал', 'гордість і упередження серіал'], unique: ['elizabeth bennet netflix', 'mr darcy netflix', 'netflix darcy', 'netflix elizabeth bennet'], common: ['darcy', 'elizabeth bennet', 'wickham', 'bingley', 'mr bennet', 'longbourn', 'pemberley', 'дарси', 'элизабет беннет', 'уикхем', 'бингли'] },
    { id: 'the-chosen', label: 'The Chosen', kind: 'show', game: ['the chosen season 6', 'the chosen s6', 'the chosen series', 'избранные 6 сезон', 'вибрані 6 сезон'], unique: ['jonathan roumie', 'dallas jenkins', 'jonathan roumie jesus', 'джонатан руми'], common: ['the chosen', 'избранные', 'вибрані'] },
    { id: 'attack-on-titan', label: 'Attack on Titan', kind: 'anime', game: ['attack on titan', 'attack on titan 3', 'attack on titan game', 'shingeki no kyojin', 'aot', 'вторжение титанов', 'атака титанов', 'атака титанів', 'вторгнення титанів', 'ataque a los titanes', 'l attaque des titans', 'attacco dei giganti', 'atak tytanow', 'attack on titan final season', '進撃の巨人', '进击的巨人', '진격의 거인'], unique: ['eren yeager', 'eren jaeger', 'mikasa ackerman', 'armin arlert', 'levi ackerman', 'reiner braun', 'zeke yeager', 'historia reiss', 'erwin smith', 'annie leonhart', 'jean kirstein', 'connie springer', 'sasha blouse', 'bertholdt hoover', 'эрен йегер', 'микаса аккерман', 'армин арлерт', 'леви аккерман', 'райнер браун', 'зик йегер', 'хистория райс', 'эрвин смит', 'ерен єгер', 'мікаса аккерман', 'арміну арлерт', 'леві аккерман', '艾伦', 'エレン・イェーガー', 'ミカサ・アッカーマン', 'リヴァイ'], common: ['eren', 'mikasa', 'armin', 'levi', 'reiner', 'zeke', 'historia', 'erwin', 'annie', 'jean', 'titan', 'titans', 'paradis', 'marley', 'эрен', 'микаса', 'армин', 'леви', 'райнер', 'зик', 'титан', 'титаны', 'титани', 'парадиз'] },
    { id: 'shangri-la-frontier', label: 'Shangri-La Frontier', kind: 'anime', game: ['shangri la frontier', 'shangri-la frontier season 3', 'shangri la frontier s3', 'slf season 3', 'shangri la frontier 3', 'фронтир шангри-ла', 'шангри ла фронтир', 'シャングリラ・フロンティア', '香格里拉·开拓异境'], unique: ['sunraku', 'rakurou hizutome', 'oikatzo', 'sunraku arthur', 'arthur pencilgon', 'санраку', 'оикаццо'], common: ['sunraku', 'vorpal bunny', 'pencilgon'] },
    { id: 'mashle', label: 'Mashle', kind: 'anime', game: ['mashle', 'mashle season 3', 'mashle final exam', 'mashle magic and muscles', 'мэшл', 'машл', 'мэшл магия и мускулы', 'マッシュル', '白魔法师'], unique: ['mash burnedead', 'lance crown', 'finn ames', 'dot barrett', 'lemon irvine', 'abel walker', 'mash burnedead', 'мэш бёрндэд', 'лэнс краун', 'финн эймс'], common: ['mash', 'finn', 'dot', 'lemon', 'lance', 'abel', 'мэш', 'финн', 'лемон', 'лэнс'] },
    { id: 'sekiro-no-defeat', label: 'Sekiro: No Defeat', kind: 'anime', game: ['sekiro no defeat', 'sekiro anime', 'sekiro: no defeat', 'sekiro: shadows die twice anime', 'секиро аниме', 'секіро аніме', 'sekiro no defeat anime', 'sekiro shadows die twice', 'секиро тени умирают дважды', 'sekiro', 'секиро', 'sekiro 隻狼', '隻狼'], unique: ['genichiro ashina', 'isshin ashina', 'owl sekiro', 'divine child kuro', 'emma sekiro', 'lady butterfly', 'гэничиро', 'иссин асина', 'гэнитиро', 'исин'], common: ['wolf', 'owl', 'kuro', 'emma', 'ashina', 'genichiro', 'isshin', 'волк', 'сова', 'куро', 'эмма', 'асина'] },
    { id: 'gundam-seed-freedom-zero', label: 'Gundam SEED Freedom Zero', kind: 'anime', game: ['gundam seed freedom zero', 'gundam seed freedom', 'seed freedom zero', 'mobile suit gundam seed freedom zero', 'гандам сид фридом зеро', '機動戦士ガンダムSEED FREEDOM ZERO', '機動戦士ガンダムSEED FREEDOM'], unique: ['kira yamato', 'lacus clyne', 'athrun zala', 'cagalli yula athha', 'киры ямато', 'лакус клайн', 'атрун зала', 'キラ・ヤマト', 'ラクス・クライン', 'アスラン・ザラ'], common: ['kira', 'lacus', 'athrun', 'cagalli', 'cosmic era', 'kira yamato', 'zaft', 'zaft', 'кира', 'лакус', 'атрун'] },
    { id: 'professor-layton-nws', label: 'Professor Layton and the New World of Steam', kind: 'game', game: ['professor layton and the new world of steam', 'layton new world of steam', 'layton and the new world of steam', 'professor layton new world of steam', 'layton new world', 'профессор лейтон новый мир пара', 'професор лейтон новий світ пари', 'レイトン教授と蒸気の新世界', '雷顿教授与蒸汽新世界'], unique: [], common: ['layton', 'luke triton', 'emmy altava', 'hershel layton', 'professor layton', 'лейтон', 'лейтона', 'профессор лейтон', 'професор лейтон'] },
    { id: 'metaphor-refantazio', label: 'Metaphor: ReFantazio', kind: 'game', game: ['metaphor refantazio', 'metaphor: refantazio', 'metaphor refantazio switch 2', 'metaphor refantazio ending', 'метафор рефантазио', 'метафора рефантазио', 'メタファー：リファンタジオ', 'メタファー リファンタジオ', '暗喻幻想', '메타포 리판타지오'], unique: ['hulkenberg', 'strohl', 'grius', 'eupha', 'junah', 'heismay', 'louis guiabern', 'basilio', 'forden', 'euchronia', 'hulkenberg metaphor', 'strohl metaphor', 'eupha metaphor', 'хулькенберг', 'ойфа', 'строл', 'гриус', 'евхрония', 'юхрония'], common: ['grius', 'junah', 'neuras', 'heismay', 'strohl', 'hulkenberg'] },
    { id: 'xenoblade-3', label: 'Xenoblade Chronicles 3', kind: 'game', game: ['xenoblade chronicles 3', 'xenoblade 3', 'xenoblade chronicles 3 switch 2', 'xenoblade 3 switch 2 edition', 'xenoblade chronicles 3 ending', 'ксеноблэйд хроники 3', 'ксеноблейд 3', 'ゼノブレイド3', '异度神剑3', '제노블레이드3'], unique: ['noah and mio', 'noah mio eunie', 'mio xenoblade', 'eunie xenoblade', 'taion xenoblade', 'lanz xenoblade', 'sena xenoblade', 'cammuravi', 'xenoblade future redeemed', 'ноа и мио', 'эуни', 'тайон', 'ланц', 'сена', 'камурави', 'ノア', 'ミオ'], common: ['noah', 'mio', 'eunie', 'taion', 'lanz', 'sena', 'ethel', 'cammuravi', 'aionios', 'moebius', 'nopon', 'ноа', 'мио', 'эуни', 'тайон', 'ланц', 'аионис', 'мебиус'] },
    { id: 'zelda-oot-remake', label: 'Zelda: Ocarina of Time (remake)', kind: 'game', game: ['zelda ocarina of time remake', 'ocarina of time remake', 'the legend of zelda ocarina of time remake', 'zelda oot remake', 'ocarina of time switch 2', 'зельда окарина времени ремейк', 'ocarina of time 2026', 'ゼルダの伝説 時のオカリナ リメイク', '塞尔达传说 时之笛 重制'], unique: ['ocarina of time remake', 'oot remake', 'ocarina remake', 'ocarina switch 2', 'окарина времени ремейк', 'окарина времени'], common: ['ganondorf', 'sheik', 'hyrule', 'navi', 'zelda', 'link', 'ocarina', 'ganon', 'ганондорф', 'хайрул', 'нави', 'зельда', 'линк', 'окарина', 'шейк'] }
  ];
  SS.LIBRARY = LIB.map((x) => ({ id: x.id, label: x.label, kind: x.kind, free: true }));
  const compiled = {};
  function preset(id) {
    if (compiled[id]) return compiled[id];
    const x = LIB.find((p) => p.id === id);
    if (!x) return null;
    const joined = x.game.filter((w) => /^[a-z0-9 ]+$/.test(w) && w.includes(' ') && w.replace(/ /g, '').length >= 6).map((w) => w.replace(/ /g, ''));   // 1.2: "O N E P I E C E" → onepiece
    return (compiled[id] = { id: x.id, label: x.label, kind: x.kind, game: compile(x.game.concat(joined)), unique: compile(x.unique), common: compile(x.common), spoil: SPOIL_SET });
  }
  SS.preset = preset;
  SS.PRESETS = { gta6: preset('gta6') };   // kept for older code and tests

  const lines = (text) => String(text || '').split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 300);
  /** Own words as a plain list (old setting; still used by tests). */
  SS.ownWords = function (text) { return compile(lines(text)); };

  /**
   * A shield from the settings -> matcher. Custom shield: the title (and its spellings, comma-separated) works like
   * a game name, every listed name like a name unique to it — the person chose them.
   */
  SS.buildShield = function (sh, pro) {
    if (!sh) return null;
    if (sh.preset) {
      const p = preset(sh.preset);
      return p ? Object.assign({}, p, { key: sh.id, mode: SS.level(sh.mode), action: sh.action === 'remove' ? 'remove' : 'blur' }, proOptions(sh, pro)) : null;
    }
    const titles = lines(sh.title);
    const words = lines(sh.words);      // words added with the right-click menu: hidden whenever they appear
    if (!titles.length && !words.length) return null;
    return { id: 'custom', key: sh.id, label: String(sh.label || titles[0] || words[0]).slice(0, 60), kind: 'custom', game: compile(titles), own: words.length ? compile(words) : null, unique: compile(lines(sh.names)), common: compile([]), spoil: SPOIL_SET,
      mode: SS.level(sh.mode), action: sh.action === 'remove' ? 'remove' : 'blur', ...proOptions(sh, pro) };
  };
  const dayEnd = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? Date.parse(d + 'T23:59:59') : 0);
  const dayStart = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? Date.parse(d + 'T00:00:00') : 0);
  /** Pro options of a shield (ignored without Pro): upTo — "I watched up to episode N"; release — until that day
   *  everything about it is hidden; until — after that day the shield is off. */
  function proOptions(sh, pro) {
    // 1.2: the dates of a shield (release day, protect until) are free for every list (Антон 06.11); "watched up to N" stays Pro
    const n = parseInt(sh.upTo, 10);
    return { upTo: pro && n > 0 && n < 100000 ? n : 0, releaseAt: dayStart(sh.release), untilAt: dayEnd(sh.until) };
  }
  SS.FREE_OWN = 3;   // own titles in the free version (1.1)

  /** Which shields work: Pro — all switched on; free — every ready list and the first 3 own titles (1.1). */
  SS.activeShields = function (shields, pro, now) {
    const out = []; let own = 0; const t = now || Date.now();
    for (const sh of shields || []) {
      if (!sh.preset) { own++; if (!pro && own > SS.FREE_OWN) continue; }   // same rule as isLocked, on or off
      if (sh.on === false) continue;
      const b = SS.buildShield(sh, pro);
      if (!b) continue;
      if (b.untilAt && t > b.untilAt) continue;                              // Pro "protect until": done
      b.everything = b.mode === 'everything' || (b.releaseAt > 0 && t < b.releaseAt);   // Pro: until release, hide all
      out.push(b);
    }
    return out;
  };
  SS.isLocked = function (shields, index, pro) {
    if (pro) return false;
    const sh = shields[index];
    if (!sh || sh.preset) return false;
    return shields.slice(0, index).filter((x) => !x.preset).length >= SS.FREE_OWN;
  };

  /** Does this text name the game (or a name unique to it)? Used to decide the page context. */
  SS.isAbout = function (norm, preset) {
    return !!(find(preset.game, norm) || find(preset.unique, norm));
  };

  /**
   * Judge one block against one shield. Returns '' (fine) or a short reason ('game', 'name', 'own').
   *   mode: 'light' | 'spoilers' | 'everything';  context: the page is about it;  own: compiled own words or null (old API)
   */
  SS.judge = function (norm, preset, mode, context, own) {
    if (own && (own.words.length || own.cjk.length) && find(own, norm)) return 'own';
    const game = !!find(preset.game, norm);
    const unique = !!find(preset.unique, norm);
    const common = !!find(preset.common, norm);
    if (!(game || unique || (common && context))) return '';
    const why = game ? 'game' : 'name';
    // Pro "I watched up to episode N": a text with episode numbers is judged by the numbers only
    const series = preset.kind === 'anime' || preset.kind === 'show' || preset.kind === 'custom';
    const eps = series || preset.upTo ? SS.episodes(norm, preset.game) : [];
    if (preset.upTo && eps.length) return Math.max.apply(null, eps) > preset.upTo ? 'episode' : '';
    if (mode === 'everything') return why;
    if (SS.hasSpoiler(SS.stripSafe(norm), mode === 'light')) return why;
    if (series && eps.length && mode !== 'light') return 'episode';      // "Sanji … One Piece 1197": a fresh episode is a spoiler too
    return '';
  };

  /** Judge against every active shield; contexts = Set of shield keys the page is about. First match wins. */
  SS.judgeAll = function (norm, shields, contexts, force) {
    for (const sh of shields) {
      const r = SS.judge(norm, sh, force || (sh.everything ? 'everything' : sh.mode), contexts.has(sh.key), sh.own || null);   // right-click words: hidden in any mode
      if (r) return { reason: r, label: sh.label, action: sh.action, key: sh.key };
    }
    return null;
  };
  /** Cheap first look: does this text mention anything any shield cares about? */
  SS.mentions = function (norm, shields) {
    for (const sh of shields) if (find(sh.game, norm) || find(sh.unique, norm) || find(sh.common, norm) || (sh.own && find(sh.own, norm))) return true;
    return false;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
