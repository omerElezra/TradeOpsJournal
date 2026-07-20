// Preset chip options shared by the trade journal form and the pre-entry
// check page, plus the auto-fill heuristics over measured stock context.

import type { StockContext } from "@/lib/domain/enrichment";
import { ENTRY_CONFIRMATION_OPTIONS } from "@/lib/domain/scoring";

// Canonical list lives in the scoring catalog (it's a scorable enum);
// re-exported here so both forms pull presets from one place.
export { ENTRY_CONFIRMATION_OPTIONS };

export const CANDLE_OPTIONS = [
  "Hammer",
  "Doji",
  "Bullish Engulfing",
  "Bearish Engulfing",
  "Inverted Hammer",
  "Marubozu",
  "None",
];

export const TREND_OPTIONS = ["Up", "Down", "Consolidating"];

export const VOLUME_OPTIONS = [
  "Volume supports trend",
  "Volume dropping (weakening)",
  "Climax volume",
];

export const MA_OPTIONS = [
  "Above MA20",
  "Below MA20",
  "Bouncing on MA20",
  "Reclaiming MA20",
  "Overextended from MA20",
  "Above MA150/200",
  "Below MA150/200",
  "Bouncing on MA150",
  "Trapped between MAs",
];

export const GAP_OPTIONS = ["Open gap upside", "Open gap downside"];

export const LEVEL_OPTIONS = [
  "Near strong support",
  "Breaking resistance",
  "Under near resistance",
  "On key Fibonacci",
];

export const SETUP_OPTIONS = [
  "VCP",
  "Cup & Handle",
  "Breakout",
  "Pullback",
  "Flag/Pennant",
  "Double Bottom/Top",
  "Fakeout",
  "MA Support Bounce",
  "Fibonacci Retracement",
];

export const EXIT_REASON_OPTIONS = [
  "Hit Target",
  "Hit Stop",
  "Broke MA",
  "Fear/Early exit",
  "Time stop",
];

export const EMOTION_OPTIONS = [
  "Calm",
  "Anxiety",
  "Boredom",
  "Overconfidence",
  "FOMO",
  "Frustration",
];

export const MISTAKE_OPTIONS = [
  "No mistakes (Perfect Execution)",
  "Chasing market",
  "Failed to take profit",
  "Overtrading",
  "Moved SL down",
];

// ─── Hover help (Hebrew) ──────────────────────────────────────────────────────
// Short plain-language explanations shown as tooltips. Keyed by the exact
// option string / field label, looked up automatically by the form controls.

export const OPTION_HELP: Record<string, string> = {
  // Recent trend
  Up: "רצף של שיאים ושפלים עולים — המניה במגמת עלייה",
  Down: "רצף של שיאים ושפלים יורדים — המניה במגמת ירידה",
  Consolidating: "דשדוש צידי בטווח מחירים — אין כיוון ברור",

  // Volume vs trend
  "Volume supports trend":
    "ימי התנועה בכיוון המגמה מלווים בנפח גבוה מהממוצע (פי 1.1+) — יש משתתפים אמיתיים מאחורי המהלך",
  "Volume dropping (weakening)":
    "הנפח דועך תוך כדי המהלך (מתחת לפי 0.9 מהממוצע) — המגמה מאבדת דלק",
  "Climax volume":
    "קפיצת נפח קיצונית (פי 2.5+ מהממוצע) — לרוב שיא רגשי: מיצוי של המהלך או תחילת מהלך חד",

  // Moving averages
  "Above MA20": "המחיר מעל הממוצע הנע של 20 יום — מגמה קצרת-טווח חיובית",
  "Below MA20": "המחיר מתחת לממוצע הנע של 20 יום — חולשה קצרת-טווח",
  "Bouncing on MA20": "המחיר ירד אל הממוצע, נגע בו וקיבל תמיכה (ריבאונד) — כניסה קלאסית בהמשך מגמה",
  "Reclaiming MA20": "המחיר היה מתחת לממוצע ועכשיו חוצה אותו חזרה כלפי מעלה — סימן התאוששות",
  "Overextended from MA20":
    "המחיר רחוק מדי מעל הממוצע (7%+) — רדיפה אחרי המחיר, סיכון גבוה לתיקון חד חזרה לממוצע",
  "Above MA150/200": "המחיר מעל הממוצע הארוך — מגמת-העל של המניה חיובית",
  "Below MA150/200": "המחיר מתחת לממוצע הארוך — מגמת-העל שלילית",
  "Bouncing on MA150":
    "המחיר ירד אל הממוצע הארוך (150 יום), נגע בו וקיבל תמיכה — ריבאונד מרמת התמיכה המרכזית של המגמה",
  "Trapped between MAs":
    "המחיר כלוא בין הממוצעים (למשל מעל 150 אבל מתחת ל-20/50) — אזור ללא כיוון ברור",

  // Gaps
  "Open gap upside": "פער מחיר פתוח מעל המחיר הנוכחי — המחיר נוטה להימשך למעלה לסגור אותו",
  "Open gap downside": "פער מחיר פתוח מתחת למחיר הנוכחי — המחיר נוטה להימשך למטה לסגור אותו",

  // Support / Resistance / Fibonacci
  "Near strong support": "המחיר קרוב לרמת תמיכה חזקה — אפשר להצמיד סטופ הגיוני מתחתיה",
  "Breaking resistance": "המחיר שובר עכשיו רמת התנגדות — אישור לפריצה",
  "Under near resistance": "יש התנגדות קרובה מעל — הרווח מוגבל עד אליה, מקום פחות טוב לכניסה",
  "On key Fibonacci": "המחיר על רמת פיבונאצ'י משמעותית (38.2% / 50% / 61.8%)",

  // Candle patterns
  Hammer: "נר עם צל תחתון ארוך — המוכרים דחפו למטה והקונים השתלטו, איתות היפוך למעלה",
  Doji: "פתיחה וסגירה כמעט זהות — היסוס, שיווי משקל בין קונים למוכרים",
  "Bullish Engulfing": "נר עולה שבולע לגמרי את הנר היורד הקודם — איתות היפוך למעלה",
  "Bearish Engulfing": "נר יורד שבולע לגמרי את הנר העולה הקודם — איתות היפוך למטה",
  "Inverted Hammer": "צל עליון ארוך אחרי ירידה — ניסיון עלייה ראשון, היפוך אפשרי",
  Marubozu: "נר מלא כמעט ללא צללים — שליטה מוחלטת של צד אחד לאורך כל היום",
  None: "אין תבנית נרות מיוחדת",

  // Entry confirmation
  "Breakout confirmed": "המחיר נסגר או החזיק מעל הרמה בנפח תומך — הפריצה אמיתית, לא בריחה רגעית",
  "MA bounce confirmed": "המחיר נגע בממוצע הנע, החזיק וחזר לכיוון המגמה — התמיכה אושרה",
  "Reclaim confirmed": "המחיר חצה חזרה מעל רמה או ממוצע שאיבד — ונשאר מעליהם",
  "Planned alert triggered": "התראה שהגדרת מראש קפצה — כניסה לפי תוכנית כתובה, לא מהרגע",
  "Anticipating early (no confirmation)":
    "כניסה לפני שהתבנית אישרה את עצמה — הימור על מה שעוד לא קרה. הגורם המרכזי לסטופים מהירים",
  "FOMO / chasing": "רדיפה אחרי מהלך שכבר רץ, בלי תוכנית — כניסה מהרגש ולא מהסטאפ",

  // Exit reasons
  "Hit Target": "המחיר הגיע ליעד המתוכנן — יציאה לפי תוכנית",
  "Hit Stop": "הסטופ המתוכנן נפגע — הפסד מבוקר, בדיוק כמו שתוכנן",
  "Broke MA": "המחיר שבר את הממוצע ששימש כתמיכה — יציאה טכנית",
  "Fear/Early exit": "יציאה מפחד לפני שהמחיר הגיע לסטופ או לטרגט — לא לפי תוכנית",
  "Time stop": "יציאה כי העסקה לא התקדמה בפרק זמן סביר",

  // Emotions
  Calm: "רגוע וממוקד — המצב הרגשי האידיאלי למסחר",
  Anxiety: "חרדה — לרוב סימן לפוזיציה גדולה מדי או לחוסר תוכנית",
  Boredom: "שעמום — מסוכן, מוביל לעסקאות מיותרות רק כדי 'לעשות משהו'",
  Overconfidence: "ביטחון יתר — לרוב אחרי רצף הצלחות, מוביל להגדלת סיכון לא מבוקרת",
  FOMO: "פחד לפספס — הדחף להיכנס בלי אישור כי 'זה בורח'",
  Frustration: "תסכול — לרוב אחרי הפסד, מוביל למסחר נקמה",

  // Mistakes
  "No mistakes (Perfect Execution)": "ביצעת בדיוק את התוכנית — גם אם העסקה הפסידה, הביצוע היה נכון",
  "Chasing market": "כניסה מאוחרת אחרי שהמהלך כבר רץ — מחיר כניסה גרוע וסטופ רחוק",
  "Failed to take profit": "לא לקחת רווח כשהיה על השולחן — חמדנות או חוסר תוכנית יציאה",
  Overtrading: "יותר מדי עסקאות — מסחר מתוך דחף ולא מתוך סטאפ אמיתי",
  "Moved SL down": "הזזת את הסטופ נגד הכיוון כדי 'לתת לזה עוד מקום' — הגדלת הפסד במקום לחתוך",

  // Technical setups
  VCP: "תבנית התכווצות תנודתיות: תיקונים הולכים וקטנים עם נפח דועך לפני פריצה",
  "Cup & Handle": "תבנית ספל וידית: קשת עגולה ואז תיקון קטן — כניסה על פריצת הידית",
  Breakout: "פריצת התנגדות או שיא בנפח גבוה",
  Pullback: "תיקון מסודר בתוך מגמה עולה — כניסה כשהמחיר חוזר לכיוון המגמה",
  "Flag/Pennant": "מהלך חד ואז דשדוש צר (דגל) — צפי להמשך בכיוון המהלך המקורי",
  "Double Bottom/Top": "תחתית או פסגה כפולה — תבנית היפוך מגמה",
  Fakeout: "פריצת שווא שנכשלה — כניסה בכיוון ההפוך כשהפורצים נלכדים",
  "MA Support Bounce": "כניסה על ריבאונד מתמיכה של ממוצע נע (למשל MA20/50) — המחיר נוגע בממוצע ומקבל תמיכה",
  "Fibonacci Retracement":
    "כניסה על תיקון לרמת פיבונאצ'י (38.2% / 50% / 61.8%) והתייצבות שם לפני חזרה לכיוון המגמה",
};

export const LABEL_HELP: Record<string, string> = {
  Symbol: "סימבול המניה שאתה שוקל להיכנס אליה (למשל AAPL)",
  Direction: "לונג = קנייה ברווח מעלייה, שורט = רווח מירידה",
  "Possible entry price (optional)": "מחיר הכניסה שאתה שוקל — אם ריק, נשתמש במחיר הסגירה האחרון",
  "Possible entry time (optional)":
    "ריק = בדיקה חיה של עכשיו. תאריך עבר = תרגול בדיעבד: איזה ציון היה מקבל הניתוח, ומה קרה אחר כך בפועל",
  "Recent trend": "מה כיוון התנועה של המניה בשבועות האחרונים",
  "Volume vs trend": "האם נפח המסחר תומך במגמה או נחלש — נפח מספר כמה משתתפים מאמינים במהלך",
  "Moving averages": "איפה המחיר ביחס לממוצעים הנעים — סמן כל מה שנכון",
  "Technical setup": "התבנית הטכנית שעליה בנויה העסקה — הסיבה המרכזית לכניסה",
  "Planned stop loss": "מחיר היציאה אם העסקה נכשלת — קובע את הסיכון שלך מראש",
  "Planned take profit": "יעד המחיר שבו תסגור ברווח",
  "Conviction level": "עד כמה אתה משוכנע בעסקה: 1 = חלש, 10 = סטאפ מושלם",
  "Candle pattern": "תבנית הנר האחרון בגרף היומי",
  "Open gaps": "פערי מחיר פתוחים בגרף שטרם נסגרו — פועלים כמגנט למחיר",
  "Support / Resistance / Fibonacci": "קרבת המחיר לרמות מפתח בגרף",
  "Entry confirmation":
    "איך הכניסה מאושרת בפועל — עם אישור טכני, לפי תוכנית, או מוקדם מדי בלי אישור. השאלה הכי חשובה נגד סטופים מהירים",
  "Exit reason": "מה גרם ליציאה מהעסקה בפועל",
  Emotions: "מה הרגשת במהלך העסקה — מודעות רגשית חושפת דפוסים חוזרים",
  Mistakes: "אילו טעויות ביצוע היו — גם בעסקה מרוויחה יכולות להיות טעויות",
  "Trade score": "ציון על משמעת הביצוע, לא על התוצאה — 10 = ביצעת בדיוק את התוכנית גם אם הפסדת",
  Notes: "הסיפור של העסקה במילים שלך — מה ראית, מה חשבת, מה היית עושה אחרת",
  "Risk amount ($)": "כמה כסף בסיכון בפועל — המרחק לסטופ כפול כמות המניות",
};

/** Section-level explanations, looked up by SectionTitle text. */
export const SECTION_HELP: Record<string, string> = {
  "Market Read": "קריאת השוק שלך — מגמה, נפח וממוצעים. מתמלא אוטומטית מהדאטה הנמדד וניתן לתיקון ידני",
  "Setup & Plan": "התוכנית לפני הכניסה — הסטאפ, אישור הכניסה, רמות היציאה ורמת הביטחון",
  "Execution & Psychology": "איך העסקה בוצעה בפועל ומה הרגשת בזמן אמת — כאן נחשפים הפערים בין תוכנית לביצוע",
  Review: "סיכום בדיעבד — טעויות, ציון משמעת והערות. הבסיס ללמידה לעסקה הבאה",
  "Chart Details (optional)": "פרטי גרף נוספים — תבניות נרות, גאפים ורמות מפתח",
};

// ─── Auto-fill suggestions from measured data ─────────────────────────────────
// Heuristics — never authoritative, so suggested values stay fully editable and
// are flagged "auto" until the user touches them.

export function suggestFromStockContext(sc: StockContext): {
  recentTrend?: string;
  volumeVsTrend?: string;
  maRelation?: string[];
} {
  const s: { recentTrend?: string; volumeVsTrend?: string; maRelation?: string[] } = {};

  if (sc.maAlignment === "BULLISH") s.recentTrend = "Up";
  else if (sc.maAlignment === "BEARISH") s.recentTrend = "Down";
  else if (sc.maAlignment === "MIXED") s.recentTrend = "Consolidating";

  const rv = sc.relativeVolume;
  if (rv != null) {
    if (rv >= 2.5) s.volumeVsTrend = "Climax volume";
    else if (rv >= 1.1) s.volumeVsTrend = "Volume supports trend";
    else if (rv < 0.9) s.volumeVsTrend = "Volume dropping (weakening)";
  }

  const ma: string[] = [];
  if (sc.aboveMa20 != null) ma.push(sc.aboveMa20 ? "Above MA20" : "Below MA20");
  const above150 = sc.aboveMa150 ?? null;
  if (above150 != null) ma.push(above150 ? "Above MA150/200" : "Below MA150/200");
  if (sc.distanceFromMa20Pct != null && sc.distanceFromMa20Pct > 7)
    ma.push("Overextended from MA20");
  if (ma.length) s.maRelation = ma;

  return s;
}
